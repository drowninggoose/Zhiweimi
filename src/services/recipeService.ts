import type { Recipe } from '../types/models';
export type RecipeFilters = {
  query?: string;
  cuisine?: string;
  ingredients?: string[];
  meal?: string;
  flavor?: string;
  difficulty?: string;
  maxMinutes?: number;
  mine?: boolean;
  favorites?: boolean;
};
export function filterRecipes(recipes: Recipe[], filters: RecipeFilters) {
  return recipes.filter(
    (r) =>
      (!filters.query ||
        `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.includes(filters.query.trim())) &&
      (!filters.cuisine || r.cuisines.includes(filters.cuisine)) &&
      (!filters.ingredients?.length ||
        filters.ingredients.every(
          (i) => r.ingredients.some((x) => x.name.includes(i)) || r.ingredientTags.includes(i),
        )) &&
      (!filters.meal || r.mealTypes.some((m) => m === filters.meal)) &&
      (!filters.flavor || r.flavorTags.includes(filters.flavor)) &&
      (!filters.difficulty || r.difficulty === filters.difficulty) &&
      (!filters.maxMinutes || (r.estimatedMinutes ?? Infinity) <= filters.maxMinutes) &&
      (!filters.mine || r.sourceType === 'user') &&
      (!filters.favorites || r.favorite),
  );
}
export function validateRecipe(recipe: Recipe) {
  if (!recipe.name.trim()) throw new Error('请填写菜名');
  if (
    recipe.ingredients.some(
      (i) => typeof i.amount === 'number' && (!Number.isFinite(i.amount) || i.amount < 0),
    )
  )
    throw new Error('食材数量不能为负数');
  if (
    recipe.estimatedMinutes !== undefined &&
    (!Number.isFinite(recipe.estimatedMinutes) || recipe.estimatedMinutes <= 0)
  )
    throw new Error('预计用时必须大于0');
  if (recipe.status === 'published') {
    if (!recipe.ingredients.length || recipe.ingredients.some((i) => !i.name.trim()))
      throw new Error('请填写至少一项完整食材');
    if (!recipe.steps.length || recipe.steps.some((s) => !s.instruction.trim()))
      throw new Error('请填写至少一个完整步骤');
  }
}
