import type { Table } from 'dexie';
import { db, type Database } from './database';
import { initialize, defaultPreferences, demoRecipes } from './seed';
import type { Base, DataSnapshot, DiaryEntry, Recipe, Utensil, PantryItem } from '../types/models';
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
          const value = await database.recipes.get(id);
          if (value?.sourceType === 'demo') throw new Error('演示菜谱不可删除');
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
  return {
    recipes,
    utensils: repository<Utensil>(database.utensils),
    diaryEntries,
    mealPlans: repository(database.mealPlans),
    pantryItems: repository<PantryItem>(database.pantryItems),
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
    async resetDemo() {
      await database.transaction('rw', [database.recipes, database.demoState], async () => {
        await database.recipes.where('sourceType').equals('demo').delete();
        await database.recipes.bulkAdd(demoRecipes());
        await database.demoState.put({
          id: 'current',
          version: 1,
          recentRecipeIds: [],
          recentRecommendationIds: [],
        });
      });
    },
  };
}
export const repositories = createRepositories(db);
