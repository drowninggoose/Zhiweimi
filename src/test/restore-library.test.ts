// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Database } from '../db/database';
import { createRepositories } from '../db/repositories';
import { fixtureRecipes } from './fixtures';
import { stamp, today, type Recipe } from '../types/models';

const database = new Database('restore-library-tests');
const repo = createRepositories(database);

/** 造一条「菜谱库」菜谱，id 由 JSON 决定（稳定不变）。 */
function libraryRecipe(id: string, name: string): Recipe {
  return {
    ...stamp(),
    ...fixtureRecipes()[0],
    id,
    name,
    sourceType: 'library',
    favorite: false,
  };
}

/** 模拟 public/recipes-library.json：这里只保留 lib-1 与 lib-2，lib-3 已下线。 */
const payload = {
  recipes: [
    {
      id: 'lib-1',
      name: '保留菜',
      steps: [{ order: 1, instruction: '第一步' }],
      ingredients: [{ name: '盐', amount: '少许' }],
    },
    {
      id: 'lib-2',
      name: '新菜',
      steps: [{ order: 1, instruction: '第一步' }],
      ingredients: [{ name: '糖', amount: '一勺' }],
    },
  ],
};

beforeEach(async () => {
  await database.open();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await database.delete();
});

test('恢复菜谱库：收藏保留、仍在的菜谱不断关联、只在菜谱消失时清引用', async () => {
  await database.recipes.bulkAdd([
    { ...libraryRecipe('lib-1', '保留菜'), favorite: true },
    libraryRecipe('lib-2', '旧菜'),
    libraryRecipe('lib-3', '将下线'),
  ]);
  await database.diaryEntries.bulkAdd([
    { ...stamp(), date: today(), mealType: 'dinner', dishName: '吃了保留菜', recipeId: 'lib-1' },
    { ...stamp(), date: today(), mealType: 'lunch', dishName: '吃了将下线', recipeId: 'lib-3' },
  ]);
  await database.mealPlans.add({
    ...stamp(),
    period: 'today',
    dayCount: 1,
    startDate: today(),
    endDate: today(),
    conditions: { flavors: [], avoidIngredients: [], preferPantry: true },
    days: [{ date: today(), breakfastRecipeId: 'lib-1', dinnerRecipeId: 'lib-3' }],
  });
  await database.demoState.put({
    id: 'current',
    version: 1,
    recentRecipeIds: ['lib-1', 'lib-3'],
    recentRecommendationIds: ['lib-3'],
  });

  const result = await repo.restoreLibrary();

  // 库被重新导入为 2 道，其中 1 道下线
  expect(await database.recipes.where('sourceType').equals('library').count()).toBe(2);
  expect(result).toEqual({ total: 2, favorites: 1, removed: 1 });

  // 收藏被恢复
  expect((await database.recipes.get('lib-1'))?.favorite).toBe(true);
  expect((await database.recipes.get('lib-2'))?.favorite).toBe(false);

  // 日记：仍在的菜谱保留关联，下线的解除关联但日记本身还在
  const diary = await database.diaryEntries.toArray();
  expect(diary).toHaveLength(2);
  expect(diary.find((e) => e.dishName === '吃了保留菜')?.recipeId).toBe('lib-1');
  expect(diary.find((e) => e.dishName === '吃了将下线')?.recipeId).toBeUndefined();

  // 计划：仍然存在的菜谱保留，下线的清空
  const plan = (await database.mealPlans.toArray())[0];
  expect(plan.days[0].breakfastRecipeId).toBe('lib-1');
  expect(plan.days[0].dinnerRecipeId).toBeUndefined();

  // 最近查看：只过滤失效 id
  const demo = await database.demoState.get('current');
  expect(demo?.recentRecipeIds).toEqual(['lib-1']);
  expect(demo?.recentRecommendationIds).toEqual([]);
});
