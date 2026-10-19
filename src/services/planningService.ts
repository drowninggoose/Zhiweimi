import {
  stamp,
  meals,
  type Recipe,
  type PantryItem,
  type PlanConditions,
  type MealPlan,
  type PlanDay,
  type MealType,
} from '../types/models';
export function eligibleRecipes(recipes: Recipe[], conditions: PlanConditions) {
  return recipes.filter(
    (r) =>
      r.status === 'published' &&
      r.sourceType !== 'demo' &&
      !conditions.avoidIngredients.some((avoid) =>
        r.ingredients.some((i) => i.name.includes(avoid)),
      ) &&
      (!conditions.maxMinutes || (r.estimatedMinutes ?? Infinity) <= conditions.maxMinutes) &&
      (!conditions.difficulty || r.difficulty === conditions.difficulty) &&
      (!conditions.flavors.length || conditions.flavors.some((f) => r.flavorTags.includes(f))),
  );
}
export function pantryScore(recipe: Recipe, pantry: PantryItem[]) {
  return pantry.filter(
    (p) =>
      p.status === 'available' &&
      recipe.ingredients.some((i) => i.name.includes(p.name) || p.name.includes(i.name)),
  ).length;
}
export function recommendations(
  recipes: Recipe[],
  conditions: PlanConditions,
  pantry: PantryItem[],
  meal: MealType | undefined,
  previous: string[] = [],
  random: () => number = Math.random,
) {
  const candidates = eligibleRecipes(recipes, conditions).filter(
    (r) => !meal || r.mealTypes.includes(meal),
  );
  return candidates
    .map((recipe) => ({
      recipe,
      score:
        (conditions.preferPantry ? pantryScore(recipe, pantry) * 10 : 0) +
        (previous.includes(recipe.id) ? -3 : 0) +
        random(),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.recipe);
}
const dateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function generatePlan(
  recipes: Recipe[],
  pantry: PantryItem[],
  conditions: PlanConditions,
  period: MealPlan['period'],
  startDate: string,
  previous?: MealPlan,
  /** 计划天数：传入时以它为准（1~30），忽略 period 推导 */
  dayCount?: number,
): MealPlan {
  const candidates = eligibleRecipes(recipes, conditions);
  if (!candidates.length) throw new Error('没有符合条件的菜谱，请调整忌口、难度或用时');
  const start = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) throw new Error('请选择有效开始日期');
  const count = dayCount
    ? Math.max(1, Math.min(30, Math.round(dayCount)))
    : period === 'today'
      ? 1
      : period === 'week'
        ? 7
        : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const days: PlanDay[] = [];
  const uses = new Map<string, number>();
  let lastId = '';
  let repeated = false;
  for (let index = 0; index < count; index++) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const day: PlanDay = { date: dateString(current) };
    for (const meal of meals) {
      let pool = candidates.filter((r) => r.mealTypes.includes(meal));
      if (!pool.length) {
        pool = candidates;
        repeated = true;
      }
      const yesterday = days[index - 1];
      const avoidDay = yesterday ? meals.map((m) => yesterday[`${m}RecipeId`]) : [];
      const distinct = pool.filter((r) => r.id !== lastId && !avoidDay.includes(r.id));
      const noAdjacent = pool.filter((r) => r.id !== lastId);
      const usable = distinct.length ? distinct : noAdjacent.length ? noAdjacent : pool;
      if (!distinct.length && index > 0) repeated = true;
      const previousId = previous?.days[index]?.[`${meal}RecipeId`];
      const ranked = usable
        .map((r) => ({
          r,
          score:
            (conditions.preferPantry ? pantryScore(r, pantry) * 20 : 0) -
            (uses.get(r.id) ?? 0) * 2 +
            (r.id === previousId ? -1 : 0) +
            Math.random(),
        }))
        .sort((a, b) => b.score - a.score);
      const chosen = ranked[0].r;
      day[`${meal}RecipeId`] = chosen.id;
      uses.set(chosen.id, (uses.get(chosen.id) ?? 0) + 1);
      lastId = chosen.id;
    }
    days.push(day);
  }
  return {
    ...stamp(),
    period,
    dayCount: count,
    startDate: days[0].date,
    endDate: days.at(-1)!.date,
    conditions,
    days,
    warning: repeated ? '符合条件的菜谱不足或餐次覆盖不足，部分餐次可能重复。' : undefined,
  };
}
export function replaceMeal(
  plan: MealPlan,
  date: string,
  meal: MealType,
  recipes: Recipe[],
  pantry: PantryItem[],
): MealPlan {
  const day = plan.days.find((d) => d.date === date);
  if (!day) throw new Error('计划日期不存在');
  const candidates = eligibleRecipes(recipes, plan.conditions).filter(
    (r) => r.mealTypes.includes(meal) && r.id !== day[`${meal}RecipeId`],
  );
  if (!candidates.length) throw new Error('没有其他符合条件的菜谱可替换');
  candidates.sort((a, b) =>
    plan.conditions.preferPantry ? pantryScore(b, pantry) - pantryScore(a, pantry) : 0,
  );
  return {
    ...plan,
    updatedAt: new Date().toISOString(),
    days: plan.days.map((d) =>
      d.date === date ? { ...d, [`${meal}RecipeId`]: candidates[0].id } : d,
    ),
  };
}
export function validatePantry(item: PantryItem) {
  if (!item.name.trim()) throw new Error('请填写食材名称');
  if (item.quantity !== undefined && (!Number.isFinite(item.quantity) || item.quantity < 0))
    throw new Error('食材数量不能为负数');
}

/** 把某天某餐精确替换成指定的菜（来自「全部菜品」选择）。 */
export function pickMealRecipe(
  plan: MealPlan,
  date: string,
  meal: MealType,
  recipeId: string,
): MealPlan {
  const day = plan.days.find((d) => d.date === date);
  if (!day) throw new Error('计划日期不存在');
  return {
    ...plan,
    updatedAt: new Date().toISOString(),
    days: plan.days.map((d) => (d.date === date ? { ...d, [`${meal}RecipeId`]: recipeId } : d)),
  };
}