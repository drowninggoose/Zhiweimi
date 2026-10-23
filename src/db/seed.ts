import type { Database } from './database';
import { importLibrary } from './library';
import type { PantryItem, Preferences } from '../types/models';
import { cleanIngredientName, cleanRecipe } from '../services/ingredientCleanup';

export const defaultPreferences: Preferences = {
  id: 'current',
  flavorPreferences: [],
  avoidIngredients: [],
  theme: 'cream-orange-green',
  fontScale: 'normal',
  dataVersion: 1,
};

/**
 * 清理历史遗留的「演示菜谱」。
 *
 * 早期版本内置过 16 道 AI 生成的演示菜（番茄炒蛋、虾仁炒饭等，`sourceType: 'demo'`）。
 * 现在只提供清洗后的真实菜谱库（当前 45 道），所以老用户浏览器里残留的这批数据要清掉，
 * 同时移除日记和饮食计划里对它们的引用（日记文字与图片保留）。
 *
 * 返回删除的演示菜谱条数。
 */
export async function purgeLegacyDemoRecipes(database: Database): Promise<number> {
  const legacy = await database.recipes.where('sourceType').equals('demo').toArray();
  if (!legacy.length) return 0;
  const ids = new Set(legacy.map((r) => r.id));
  await database.transaction(
    'rw',
    [database.recipes, database.diaryEntries, database.mealPlans],
    async () => {
      await database.recipes.bulkDelete([...ids]);
      for (const entry of await database.diaryEntries.toArray()) {
        if (entry.recipeId && ids.has(entry.recipeId)) {
          const next = { ...entry };
          delete next.recipeId;
          await database.diaryEntries.put(next);
        }
      }
      for (const plan of await database.mealPlans.toArray()) {
        plan.days = plan.days.map((day) => ({
          ...day,
          breakfastRecipeId:
            day.breakfastRecipeId && ids.has(day.breakfastRecipeId)
              ? undefined
              : day.breakfastRecipeId,
          lunchRecipeId:
            day.lunchRecipeId && ids.has(day.lunchRecipeId) ? undefined : day.lunchRecipeId,
          dinnerRecipeId:
            day.dinnerRecipeId && ids.has(day.dinnerRecipeId) ? undefined : day.dinnerRecipeId,
        }));
        await database.mealPlans.put(plan);
      }
    },
  );
  return ids.size;
}

/**
 * 首次启动初始化。
 *
 * 应用只内置菜谱库文件 `public/recipes-library.json`（当前 45 道），
 * 不再生成任何「演示菜谱」，所以这里只负责清理历史数据、建立演示状态与偏好，
 * 以及导入菜谱库（`importLibrary` 内部幂等，已导入则跳过）。
 */
export async function initialize(database: Database) {
  await purgeLegacyDemoRecipes(database);
  await database.transaction('rw', database.tables, async () => {
    if (!(await database.demoState.get('current'))) {
      await database.demoState.put({
        id: 'current',
        version: 1,
        recentRecipeIds: [],
        recentRecommendationIds: [],
      });
    }
    if (!(await database.preferences.get('current')))
      await database.preferences.put(defaultPreferences);
  });
  // 首次启动导入菜谱库（内部幂等：已导入则跳过）
  try {
    await importLibrary(database);
  } catch (e) {
    console.warn('菜谱库导入跳过：', e instanceof Error ? e.message : e);
  }
  await cleanStoredRecipeIngredients(database);
  await cleanStoredPantryItems(database);
}

/** 清洗已有菜谱（包括用户自己的菜谱）：删水、猪肉形态归一、同名去重。 */
export async function cleanStoredRecipeIngredients(database: Database) {
  const recipes = await database.recipes.toArray();
  const cleaned = recipes.map((recipe) => cleanRecipe(recipe));
  const changed = cleaned.filter((recipe, index) => recipe !== recipes[index]);
  if (!changed.length) return 0;
  await database.transaction('rw', database.recipes, async () => {
    await database.recipes.bulkPut(changed);
  });
  return changed.length;
}

/** 冰箱同样清洗：删水、猪肉形态归一；重名合并，优先保留“有”。 */
export async function cleanStoredPantryItems(database: Database) {
  const items = await database.pantryItems.toArray();
  const next = new Map<string, PantryItem>();
  const remove: string[] = [];
  const renamed: PantryItem[] = [];
  for (const item of items) {
    const name = cleanIngredientName(item.name);
    if (!name) {
      remove.push(item.id);
      continue;
    }
    const candidate = name === item.name ? item : { ...item, name };
    const existing = next.get(name);
    if (!existing) {
      next.set(name, candidate);
      if (candidate !== item) renamed.push(candidate);
      continue;
    }
    remove.push(item.id);
    if (existing.status !== 'available' && candidate.status === 'available') {
      const merged = { ...existing, status: 'available' as const };
      next.set(name, merged);
      renamed.push(merged);
    }
  }
  if (!remove.length && !renamed.length) return 0;
  await database.transaction('rw', database.pantryItems, async () => {
    if (renamed.length) await database.pantryItems.bulkPut(renamed);
    if (remove.length) await database.pantryItems.bulkDelete(remove);
  });
  return remove.length + renamed.length;
}
