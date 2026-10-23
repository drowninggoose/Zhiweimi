import type { Recipe, RecipeIngredient } from '../types/models';

const WATER_NAMES =
  /^(水|清水|温水|凉水|冷水|热水|开水|冰水|纯净水|饮用水|矿泉水|淘米水|水量|清水量|用水量)$/;
const PORK_FORMS =
  /^(猪)?(猪肉|猪颈肉|猪腿肉|前腿肉|后腿肉|猪里脊|夹心肉)?(末|馅|丝|片|丁|块|泥|糜|条|绞肉)$|^(猪|猪肉|五花肉|梅花肉|里脊肉)$/;

function baseName(name: string) {
  return name.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim();
}

/**
 * 菜谱食材清洗：
 * - 水、清水、温水等不参与备料，直接移除；
 * - 猪肉末、猪肉馅、猪肉丝、五花肉等统一成“猪肉”；
 * - 同名食材去重，保留第一次出现的用量。
 */
export function cleanIngredientName(name: string): string | null {
  const base = baseName(name);
  if (!base || WATER_NAMES.test(base)) return null;
  if (PORK_FORMS.test(base)) return '猪肉';
  return name.trim();
}

export function cleanIngredients(ingredients: RecipeIngredient[]) {
  const seen = new Set<string>();
  const next: RecipeIngredient[] = [];
  for (const ingredient of ingredients) {
    const name = cleanIngredientName(ingredient.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    next.push(name === ingredient.name ? ingredient : { ...ingredient, name });
  }
  return next;
}

export function cleanRecipe(recipe: Recipe): Recipe {
  const ingredients = cleanIngredients(recipe.ingredients);
  const ingredientTags = [...new Set(ingredients.map((item) => item.name))];
  const currentTags = recipe.ingredientTags ?? [];
  const unchanged =
    ingredients.length === recipe.ingredients.length &&
    ingredients.every(
      (item, index) =>
        item.name === recipe.ingredients[index]?.name &&
        item.amount === recipe.ingredients[index]?.amount &&
        item.unit === recipe.ingredients[index]?.unit,
    ) &&
    ingredientTags.length === currentTags.length &&
    ingredientTags.every((tag, index) => tag === currentTags[index]);
  return unchanged ? recipe : { ...recipe, ingredients, ingredientTags };
}
