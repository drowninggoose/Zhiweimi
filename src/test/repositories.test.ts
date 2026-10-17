// @vitest-environment node
import { afterEach, beforeEach, expect, test } from 'vitest';
import { Database } from '../db/database';
import { initialize } from '../db/seed';
import { createRepositories } from '../db/repositories';
import { stamp, type Recipe } from '../types/models';
import { generatePlan } from '../services/planningService';
import { fixtureRecipes } from './fixtures';
const database = new Database('repository-tests');
const repo = createRepositories(database);
beforeEach(() => database.open());
afterEach(() => database.delete());
test('阶段2/10：五类业务Repository增查改删，清空用户菜谱保留菜谱库并清除引用', async () => {
  await initialize(database);
  const [libraryRecipe] = fixtureRecipes();
  await repo.recipes.create(libraryRecipe);
  const recipe = {
    ...libraryRecipe,
    ...stamp(),
    sourceType: 'user' as const,
    name: '用户菜',
  };
  await repo.recipes.create(recipe);
  expect((await repo.recipes.getById(recipe.id))?.name).toBe('用户菜');
  await repo.recipes.update({ ...recipe, name: '用户菜修改' });
  expect((await repo.recipes.getById(recipe.id))?.name).toBe('用户菜修改');
  const pantry = { ...stamp(), name: '番茄', category: '蔬菜', status: 'available' as const };
  await repo.pantryItems.create(pantry);
  expect(await repo.pantryItems.getById(pantry.id)).toEqual(pantry);
  await repo.pantryItems.update({ ...pantry, status: 'used-up' });
  expect((await repo.pantryItems.getById(pantry.id))?.status).toBe('used-up');
  await repo.pantryItems.delete(pantry.id);
  expect(await repo.pantryItems.list()).toEqual([]);
  const diary = {
    ...stamp(),
    date: '2026-10-11',
    mealType: 'lunch' as const,
    dishName: '用户日记',
    recipeId: recipe.id,
  };
  await repo.diaryEntries.create(diary);
  expect(await repo.diaryEntries.getById(diary.id)).toEqual(diary);
  await repo.diaryEntries.update({ ...diary, notes: '更新' });
  expect((await repo.diaryEntries.getById(diary.id))?.notes).toBe('更新');
  const plan = generatePlan(
    await repo.recipes.list(),
    [],
    { flavors: [], avoidIngredients: [], preferPantry: false },
    'today',
    '2026-10-11',
  );
  plan.days[0].lunchRecipeId = recipe.id;
  await repo.mealPlans.create(plan);
  expect(await repo.mealPlans.getById(plan.id)).toEqual(plan);
  await repo.mealPlans.update({ ...plan, warning: '已更新' });
  expect((await repo.mealPlans.getById(plan.id))?.warning).toBe('已更新');
  await repo.clear('recipes');
  // 只清用户菜谱，菜谱库保留
  expect(await database.recipes.count()).toBe(1);
  expect((await repo.recipes.getById(libraryRecipe.id))?.name).toBe(libraryRecipe.name);
  expect((await repo.diaryEntries.getById(diary.id))?.recipeId).toBeUndefined();
  expect((await repo.mealPlans.getById(plan.id))?.days[0].lunchRecipeId).toBeUndefined();
  await repo.diaryEntries.delete(diary.id);
  await repo.mealPlans.delete(plan.id);
  expect(await repo.diaryEntries.list()).toEqual([]);
  expect(await repo.mealPlans.list()).toEqual([]);
});
test('阶段2：初始化幂等、不再生成演示菜谱、CRUD和重新打开持久化', async () => {
  // 测试环境没有真实服务器，菜谱库导入会失败，所以这里手动塞一道菜谱库菜谱
  const [libraryRecipe] = fixtureRecipes();
  await database.recipes.add(libraryRecipe);
  await initialize(database);
  await initialize(database);
  const data = await repo.snapshot();
  // 重复初始化不会刷出任何演示菜谱
  expect(data.recipes.filter((r) => r.sourceType === 'demo')).toHaveLength(0);
  expect(data.recipes.map((r) => r.id)).toEqual([libraryRecipe.id]);
  const item = {
    ...stamp(),
    name: '杯',
    type: 'cup' as const,
    capacity: 200,
    capacityUnit: 'ml' as const,
  };
  await repo.utensils.create(item);
  await repo.utensils.update({ ...item, capacity: 250 });
  database.close();
  await database.open();
  expect((await repo.utensils.getById(item.id))?.capacity).toBe(250);
  await repo.utensils.delete(item.id);
  expect(await repo.utensils.list()).toEqual([]);
});
test('阶段2：启动时清理老版本残留的演示菜谱，并移除日记与计划里的引用', async () => {
  const [libraryRecipe] = fixtureRecipes();
  const legacyDemo: Recipe = {
    ...libraryRecipe,
    id: 'demo-1',
    name: '番茄炒蛋',
    sourceType: 'demo',
    coverUrl: '/demo-images/dish-2.svg',
  };
  await database.recipes.bulkAdd([libraryRecipe, legacyDemo]);
  const diary = {
    ...stamp(),
    date: '2026-10-11',
    mealType: 'dinner' as const,
    dishName: '引用演示菜谱的日记',
    recipeId: 'demo-1',
  };
  await database.diaryEntries.add(diary);
  const plan = generatePlan([libraryRecipe], [], { flavors: [], avoidIngredients: [], preferPantry: false }, 'today', '2026-10-11');
  plan.days[0].dinnerRecipeId = 'demo-1';
  await database.mealPlans.add(plan);

  await initialize(database);

  expect(await database.recipes.get('demo-1')).toBeUndefined();
  expect((await database.recipes.get(libraryRecipe.id))?.name).toBe(libraryRecipe.name);
  // 日记文字保留，只清掉对演示菜谱的引用
  const storedDiary = await database.diaryEntries.get(diary.id);
  expect(storedDiary?.dishName).toBe('引用演示菜谱的日记');
  expect(storedDiary?.recipeId).toBeUndefined();
  expect((await database.mealPlans.get(plan.id))?.days[0].dinnerRecipeId).toBeUndefined();
});
test('阶段2：重复日记拒绝，确认替换；删除菜谱保留日记内容并清除引用', async () => {
  await initialize(database);
  const [libraryRecipe] = fixtureRecipes();
  const recipe = { ...libraryRecipe, ...stamp(), sourceType: 'user' as const };
  await repo.recipes.create(recipe);
  const entry = {
    ...stamp(),
    date: '2026-10-11',
    mealType: 'lunch' as const,
    dishName: '记录',
    recipeId: recipe.id,
  };
  await repo.diaryEntries.save(entry);
  await expect(repo.diaryEntries.save({ ...entry, ...stamp() })).rejects.toThrow('同日同餐');
  await repo.diaryEntries.save({ ...entry, ...stamp() }, true);
  await repo.recipes.delete(recipe.id);
  const entries = await repo.diaryEntries.list();
  expect(entries).toHaveLength(1);
  expect(entries[0].dishName).toBe('记录');
  expect(entries[0].recipeId).toBeUndefined();
});
