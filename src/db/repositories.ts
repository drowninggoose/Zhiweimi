import type { Table } from 'dexie';
import {
  applyMemoryEvidence,
  type MemoryApplyResult,
  type MemoryEvidenceInput,
} from '../services/memoryPolicy';
import { db, type Database } from './database';
import { initialize, defaultPreferences } from './seed';
import { importLibrary } from './library';
import {
  buildRecommendation,
  windowId,
  type RecommendationBatch,
} from '../services/recommendationService';
import type {
  Base,
  AssistantMessage,
  CookingProgress,
  DataSnapshot,
  DiaryEntry,
  Recipe,
  RecommendationHistoryEntry,
  RecommendationState,
  Utensil,
  PantryItem,
  PreferenceMemory,
} from '../types/models';

/** 记住最近多少批推荐，用于「换一批」时避开刚看过的菜。 */
const RECENT_BATCH_LIMIT = 8;
export function repository<T extends Base>(table: Table<T, string>) {
  return {
    list: () => table.toArray(),
    getById: (id: string) => table.get(id),
    create: async (value: T) => {
      await table.add(value);
      return value;
    },
    update: async (value: T) => {
      const next = { ...value, updatedAt: new Date().toISOString() };
      if (!(await table.get(value.id))) throw new Error('记录已不存在');
      await table.put(next);
      return next;
    },
    delete: (id: string) => table.delete(id),
  };
}
export function createRepositories(database: Database) {
  const recipes = {
    ...repository(database.recipes),
    async delete(id: string) {
      await database.transaction(
        'rw',
        [database.recipes, database.diaryEntries, database.mealPlans],
        async () => {
          await database.recipes.delete(id);
          await database.diaryEntries
            .where('recipeId')
            .equals(id)
            .modify((entry) => {
              delete entry.recipeId;
            });
          for (const plan of await database.mealPlans.toArray()) {
            plan.days = plan.days.map((day) => ({
              ...day,
              breakfastRecipeId: day.breakfastRecipeId === id ? undefined : day.breakfastRecipeId,
              lunchRecipeId: day.lunchRecipeId === id ? undefined : day.lunchRecipeId,
              dinnerRecipeId: day.dinnerRecipeId === id ? undefined : day.dinnerRecipeId,
            }));
            await database.mealPlans.put(plan);
          }
        },
      );
    },
    async favorite(value: Recipe) {
      await database.recipes.put({
        ...value,
        favorite: !value.favorite,
        updatedAt: new Date().toISOString(),
      });
    },
    async viewed(id: string) {
      const state = await database.demoState.get('current');
      if (state)
        await database.demoState.put({
          ...state,
          recentRecipeIds: [id, ...state.recentRecipeIds.filter((x) => x !== id)].slice(0, 8),
        });
    },
  };
  const diaryEntries = {
    ...repository(database.diaryEntries),
    async save(value: DiaryEntry, replace = false) {
      return database.transaction('rw', database.diaryEntries, async () => {
        const existing = await database.diaryEntries
          .where('[date+mealType]')
          .equals([value.date, value.mealType])
          .first();
        if (existing && existing.id !== value.id && !replace) throw new Error('同日同餐已有记录');
        if (existing && existing.id !== value.id) await database.diaryEntries.delete(existing.id);
        await database.diaryEntries.put({ ...value, updatedAt: new Date().toISOString() });
      });
    },
  };
  const recommendationState = {
    get: () => database.recommendationState.get('current'),
    /**
     * 取当前时间段的推荐；如果换了时间段（比如从午餐切到晚餐），种子自动更新，
     * 于是「每次登录看到不同的推荐」。
     */
    async ensure(now = new Date()): Promise<{ state: RecommendationState; rotated: boolean }> {
      const current = await database.recommendationState.get('current');
      const id = windowId(now);
      const stampNow = new Date().toISOString();
      if (!current) {
        const fresh: RecommendationState = {
          id: 'current',
          version: 1,
          lastWindowId: id,
          seed: id,
          refreshCount: 0,
          updatedAt: stampNow,
          recentBatches: [],
        };
        await database.recommendationState.put(fresh);
        return { state: fresh, rotated: true };
      }
      if (current.lastWindowId !== id) {
        const next: RecommendationState = { ...current, lastWindowId: id, seed: id, updatedAt: stampNow };
        await database.recommendationState.put(next);
        return { state: next, rotated: true };
      }
      return { state: current, rotated: false };
    },
    /** 换一批：换种子 + 记下刚推过的菜。 */
    async refresh(now = new Date()): Promise<RecommendationState> {
      const { state } = await recommendationState.ensure(now);
      const stampNow = new Date().toISOString();
      const next: RecommendationState = {
        ...state,
        seed: `${state.lastWindowId}-${Date.now()}`,
        refreshCount: state.refreshCount + 1,
        updatedAt: stampNow,
      };
      await database.recommendationState.put(next);
      return next;
    },
    /** 把一批推荐记入历史，之后换批时优先避开这些菜。 */
    async remember(state: RecommendationState, batch: RecommendationBatch): Promise<void> {
      const entry: RecommendationHistoryEntry = {
        windowId: batch.windowId,
        seed: batch.seed,
        at: new Date().toISOString(),
        ids: batch.dishes.map((d) => d.recipe.id),
      };
      const next: RecommendationState = {
        ...state,
        recentBatches: [entry, ...state.recentBatches].slice(0, RECENT_BATCH_LIMIT),
        updatedAt: entry.at,
      };
      await database.recommendationState.put(next);
    },
    async build(
      recipes: Recipe[],
      conditions: Parameters<typeof buildRecommendation>[1],
      pantry: PantryItem[],
      state: RecommendationState,
      now = new Date(),
    ): Promise<RecommendationBatch> {
      const seenIds = [...new Set(state.recentBatches.flatMap((b) => b.ids))];
      const previous = state.recentBatches[0]?.ids ?? [];
      let batch = buildRecommendation(recipes, conditions, pantry, {
        now,
        seed: state.seed,
        seenIds,
      });
      let attempt = 0;
      // 极端情况下（候选太少）可能抽到和上一批完全一样的组合，换种子重抽。
      while (
        attempt < 5 &&
        previous.length > 0 &&
        batch.dishes.length > 0 &&
        batch.dishes.map((d) => d.recipe.id).join(',') === previous.join(',')
      ) {
        attempt += 1;
        batch = buildRecommendation(recipes, conditions, pantry, {
          now,
          seed: `${state.seed}-r${attempt}`,
          seenIds,
        });
      }
      return batch;
    },
  };
  return {
    recipes,
    utensils: repository<Utensil>(database.utensils),
    diaryEntries,
    mealPlans: repository(database.mealPlans),
    pantryItems: repository<PantryItem>(database.pantryItems),
    recommendationState,
    async snapshot(): Promise<DataSnapshot> {
      await initialize(database);
      return {
        recipes: await database.recipes.toArray(),
        utensils: await database.utensils.toArray(),
        diaryEntries: await database.diaryEntries.toArray(),
        mealPlans: await database.mealPlans.toArray(),
        pantryItems: await database.pantryItems.toArray(),
        preferences: (await database.preferences.get('current'))!,
        demoState: (await database.demoState.get('current'))!,
      };
    },
    preferences: {
      getById: () => database.preferences.get('current'),
      update: (value: DataSnapshot['preferences']) => database.preferences.put(value),
    },
    /**
     * 烹饪进度：一道菜一条记录，主键用 recipeId。
     * 页面每次状态变化都会调用 save()，所以做到一半关掉页面也不会丢。
     */
    cookingProgress: {
      list: () =>
        database.cookingProgress.orderBy('updatedAt').reverse().toArray(),
      get: (recipeId: string) => database.cookingProgress.where('recipeId').equals(recipeId).first(),
      save: (value: CookingProgress) => database.cookingProgress.put(value),
      remove: (recipeId: string) => database.cookingProgress.where('recipeId').equals(recipeId).delete(),
      clear: () => database.cookingProgress.clear(),
    },
    /**
     * 口味 / 忌口记忆。写入走 `applyEvidence`，内部套用 3 次阈值规则，
     * 保证「用户随口一说」不会被当成长期偏好。
     */
    preferenceMemory: {
      list: () => database.preferenceMemory.toArray(),
      active: () => database.preferenceMemory.filter((item) => item.active).toArray(),
      get: (dimension: PreferenceMemory['dimension']) =>
        database.preferenceMemory.get(`memory-${dimension}`),
      /** 直接覆盖保存，供界面手动修改/删除使用 */
      save: (value: PreferenceMemory) => database.preferenceMemory.put(value),
      remove: (dimension: PreferenceMemory['dimension']) =>
        database.preferenceMemory.delete(`memory-${dimension}`),
      clear: () => database.preferenceMemory.clear(),
      /**
       * 写入一条证据并按阈值规则更新。
       * 返回更新后的记忆，以及是否「首次生效」。
       */
      async applyEvidence(input: MemoryEvidenceInput): Promise<MemoryApplyResult> {
        const current = await database.preferenceMemory.get(`memory-${input.dimension}`);
        const result = applyMemoryEvidence(current, input);
        await database.preferenceMemory.put(result.next);
        return result;
      },
    },
    /** 语音助手聊天记录（可回看）。只存文本，不存原始音频。 */
    assistantMessages: {
      list: (limit = 100) =>
        database.assistantMessages.orderBy('createdAt').reverse().limit(limit).toArray(),
      add: (value: AssistantMessage) => database.assistantMessages.put(value),
      remove: (id: string) => database.assistantMessages.delete(id),
      clear: () => database.assistantMessages.clear(),
    },
    async restore(snapshot: DataSnapshot) {
      await database.transaction('rw', database.tables, async () => {
        for (const table of database.tables) await table.clear();
        await database.recipes.bulkAdd(snapshot.recipes);
        await database.utensils.bulkAdd(snapshot.utensils);
        await database.diaryEntries.bulkAdd(snapshot.diaryEntries);
        await database.mealPlans.bulkAdd(snapshot.mealPlans);
        await database.pantryItems.bulkAdd(snapshot.pantryItems);
        await database.preferences.put(snapshot.preferences);
        await database.demoState.put(snapshot.demoState);
      });
    },
    async clear(category: string) {
      await database.transaction('rw', database.tables, async () => {
        if (category === 'all') {
          for (const table of database.tables) await table.clear();
          await database.preferences.put(defaultPreferences);
          await database.demoState.put({
            id: 'current',
            version: 1,
            recentRecipeIds: [],
            recentRecommendationIds: [],
          });
        } else if (category === 'recipes') {
          for (const recipe of await database.recipes.where('sourceType').equals('user').toArray())
            await recipes.delete(recipe.id);
        } else {
          const table = database.tables.find((t) => t.name === category);
          if (!table) throw new Error('未知类别');
          await table.clear();
        }
      });
    },
    /**
     * 恢复菜谱库：按 `recipes-library.json` 重新导入。
     *
     * 与早期实现相比更安全：
     * - **保留收藏**：导入前记下收藏过的库菜谱 id，导入后回写；
     * - **不再无谓断开关联**：菜谱 id 是稳定的（JSON 里自带），
     *   只有在新版本菜谱库里**确实消失**的菜，才解除日记与计划里的引用；
     * - 最近查看记录只过滤掉失效 id，不再整体清空；
     * - 推荐换批历史保留（其中的失效 id 不影响随机结果）。
     */
    async restoreLibrary() {
      // importLibrary 内部自带事务，必须在任何外层事务之外调用
      const old = await database.recipes.where('sourceType').equals('library').toArray();
      const oldIds = new Set(old.map((r) => r.id));
      /** 用户收藏过的库菜谱，导入后要恢复 */
      const favoriteIds = old.filter((r) => r.favorite).map((r) => r.id);

      if (old.length) await database.recipes.bulkDelete([...oldIds]);
      await importLibrary(database);

      const fresh = await database.recipes.where('sourceType').equals('library').toArray();
      const freshIds = new Set(fresh.map((r) => r.id));
      /** 新版菜谱库里已经没有的菜：只有它们的引用需要清理 */
      const goneIds = new Set([...oldIds].filter((id) => !freshIds.has(id)));

      await database.transaction(
        'rw',
        [database.recipes, database.demoState, database.diaryEntries, database.mealPlans],
        async () => {
          // 1) 恢复收藏
          for (const id of favoriteIds) {
            if (freshIds.has(id)) await database.recipes.update(id, { favorite: true });
          }

          // 2) 只清理真的消失了的菜谱引用
          if (goneIds.size) {
            for (const entry of await database.diaryEntries.toArray()) {
              if (entry.recipeId && goneIds.has(entry.recipeId)) {
                const next = { ...entry };
                delete next.recipeId;
                await database.diaryEntries.put(next);
              }
            }
            for (const plan of await database.mealPlans.toArray()) {
              plan.days = plan.days.map((day) => ({
                ...day,
                breakfastRecipeId:
                  day.breakfastRecipeId && goneIds.has(day.breakfastRecipeId)
                    ? undefined
                    : day.breakfastRecipeId,
                lunchRecipeId:
                  day.lunchRecipeId && goneIds.has(day.lunchRecipeId)
                    ? undefined
                    : day.lunchRecipeId,
                dinnerRecipeId:
                  day.dinnerRecipeId && goneIds.has(day.dinnerRecipeId)
                    ? undefined
                    : day.dinnerRecipeId,
              }));
              await database.mealPlans.put(plan);
            }
          }

          // 3) 最近查看：过滤掉失效 id，其余保留
          const demo = await database.demoState.get('current');
          if (demo) {
            await database.demoState.put({
              ...demo,
              recentRecipeIds: demo.recentRecipeIds.filter((id) => !goneIds.has(id)),
              recentRecommendationIds: demo.recentRecommendationIds.filter(
                (id) => !goneIds.has(id),
              ),
            });
          }
        },
      );

      return {
        total: freshIds.size,
        favorites: favoriteIds.filter((id) => freshIds.has(id)).length,
        removed: goneIds.size,
      };
    },
  };
}
export const repositories = createRepositories(db);
