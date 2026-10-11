import { expect, test } from 'vitest';
import { demoRecipes } from '../db/seed';
import { filterRecipes, validateRecipe } from '../services/recipeService';
test('阶段3：菜名/食材搜索、组合筛选和收藏', () => {
  const recipes = demoRecipes();
  expect(filterRecipes(recipes, { query: '番茄' }).map((r) => r.name)).toEqual(['番茄炒蛋']);
  expect(
    filterRecipes(recipes, { ingredients: ['鸡蛋'], meal: 'breakfast', maxMinutes: 15 }).length,
  ).toBeGreaterThan(0);
  expect(filterRecipes(recipes, { cuisine: '川菜', flavor: '微辣' }).map((r) => r.name)).toEqual([
    '麻婆豆腐',
  ]);
  expect(filterRecipes(recipes, { mine: true })).toEqual([]);
  expect(filterRecipes([{ ...recipes[0], favorite: true }], { favorites: true })).toHaveLength(1);
});
test('阶段3：空菜名、负数与不完整正式菜谱拒绝，草稿允许未完成步骤', () => {
  const r = demoRecipes()[0];
  expect(() => validateRecipe({ ...r, name: '' })).toThrow('菜名');
  expect(() =>
    validateRecipe({ ...r, ingredients: [{ id: 'x', name: '盐', amount: -1 }] }),
  ).toThrow('负数');
  expect(() => validateRecipe({ ...r, steps: [] })).toThrow('步骤');
  expect(() => validateRecipe({ ...r, status: 'draft', steps: [] })).not.toThrow();
});
