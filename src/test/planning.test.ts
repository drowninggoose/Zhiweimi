import { expect, test } from 'vitest';
import { fixtureRecipes } from './fixtures';
import {
  generatePlan,
  recommendations,
  eligibleRecipes,
  pantryScore,
  replaceMeal,
  validatePantry,
} from '../services/planningService';
import { stamp, meals, type PlanConditions } from '../types/models';
const conditions: PlanConditions = { flavors: [], avoidIngredients: [], preferPantry: false };
test('阶段7：三周期天数、避免相邻餐与相邻日同菜、单餐替换', () => {
  const recipes = fixtureRecipes();
  for (const [period, count] of [
    ['today', 1],
    ['week', 7],
    ['month', 31],
  ] as const) {
    const plan = generatePlan(recipes, [], conditions, period, '2026-10-01');
    expect(plan.days).toHaveLength(count);
    const sequence = plan.days.flatMap((d) => meals.map((m) => d[`${m}RecipeId`]));
    for (let i = 1; i < sequence.length; i++) expect(sequence[i]).not.toBe(sequence[i - 1]);
    for (let i = 1; i < plan.days.length; i++) {
      const yesterday = meals.map((m) => plan.days[i - 1][`${m}RecipeId`]);
      for (const m of meals) expect(yesterday).not.toContain(plan.days[i][`${m}RecipeId`]);
    }
    const changed = replaceMeal(plan, plan.startDate, 'lunch', recipes, []);
    expect(changed.days[0].lunchRecipeId).not.toBe(plan.days[0].lunchRecipeId);
    expect(changed.days[0].dinnerRecipeId).toBe(plan.days[0].dinnerRecipeId);
  }
});
test('阶段7：忌口、时间、难度与家庭食材权重', () => {
  const recipes = fixtureRecipes();
  const eligible = eligibleRecipes(recipes, {
    ...conditions,
    avoidIngredients: ['鸡蛋'],
    maxMinutes: 30,
    difficulty: 'easy',
  });
  expect(
    eligible.every(
      (r) =>
        !r.ingredients.some((i) => i.name === '鸡蛋') &&
        r.estimatedMinutes! <= 30 &&
        r.difficulty === 'easy',
    ),
  ).toBe(true);
  const pantry = [{ ...stamp(), name: '虾', category: '水产', status: 'available' as const }];
  expect(pantryScore(recipes[9], pantry)).toBe(1);
  const result = recommendations(
    recipes,
    { ...conditions, preferPantry: true },
    pantry,
    undefined,
    [],
    () => 0,
  );
  expect(result[0].id).toBe('fixture-10');
  expect(() => validatePantry({ ...pantry[0], quantity: -1 })).toThrow('负数');
});
test('阶段7：菜谱不足允许月计划但明确警告，无候选拒绝', () => {
  const plan = generatePlan([fixtureRecipes()[10]], [], conditions, 'month', '2026-10-01');
  expect(plan.days).toHaveLength(31);
  expect(plan.warning).toContain('不足');
  expect(() => generatePlan([], [], conditions, 'today', '2026-10-01')).toThrow('没有符合');
});
test('阶段7：推荐换批在候选充分时改变组合', () => {
  const recipes = fixtureRecipes();
  const first = recommendations(recipes, conditions, [], undefined, [], () => 0.5);
  const second = recommendations(
    recipes,
    conditions,
    [],
    undefined,
    first.map((r) => r.id),
    () => 0.5,
  );
  expect(first.map((r) => r.id)).not.toEqual(second.map((r) => r.id));
});
