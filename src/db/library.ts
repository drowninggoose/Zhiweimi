import type { Database } from './database';
import type { Recipe, RecipeIngredient, RecipeStep } from '../types/models';
import { id } from '../types/models';
import { cleanIngredients } from '../services/ingredientCleanup';

type LibraryIngredient = {
  name: string;
  amount?: number | string;
  unit?: string;
  note?: string;
  normalizedAmount?: number | string;
  normalizedUnit?: string;
  normalizationNote?: string;
  group?: string;
};
type LibraryStep = {
  order: number;
  instruction: string;
  action?: string;
  utensil?: string;
  heat?: string;
  durationSeconds?: number;
  check?: string;
  personalization?: string;
};
type LibraryRecipe = {
  id: string;
  name: string;
  cuisines: string[];
  mealTypes: string[];
  flavorTags: string[];
  difficulty?: 'easy' | 'normal' | 'advanced';
  estimatedMinutes?: number;
  description?: string;
  ingredients: LibraryIngredient[];
  steps: LibraryStep[];
  tips?: string;
  coverUrl?: string;
  source?: string;
  sourceUrl?: string;
  dataStandard?: 'structured-v1' | 'structured-v2' | 'structured-v3' | 'structured-v4';
};

const VALID_MEALS = new Set(['breakfast', 'lunch', 'dinner']);

/** 库文件里难度可能是 null 或空值，只保留三种合法难度。 */
function isDifficulty(value: unknown): value is NonNullable<Recipe['difficulty']> {
  return value === 'easy' || value === 'normal' || value === 'advanced';
}

/** 从 /recipes-library.json 导入菜谱库；已导入过则跳过（幂等）。返回新导入数量。 */
export async function importLibrary(database: Database): Promise<number> {
  const existing = await database.recipes.where('sourceType').equals('library').toArray();
  if (
    existing.length > 0 &&
    existing.every(
      (recipe) =>
        recipe.dataStandard === 'structured-v4' &&
        (!recipe.coverUrl || recipe.coverUrl.startsWith('/recipe-images/')),
    )
  )
    return 0;

  const res = await fetch('/recipes-library.json');
  if (!res.ok) throw new Error(`菜谱库加载失败：HTTP ${res.status}`);
  const data = await res.json();
  const list: LibraryRecipe[] = data?.recipes ?? [];

  const now = new Date().toISOString();
  const existingById = new Map(existing.map((recipe) => [recipe.id, recipe]));
  const toAdd: Recipe[] = [];
  for (const raw of list) {
    if (!raw.name || !raw.steps?.length) continue;
    const ingredients: RecipeIngredient[] = cleanIngredients(
      (raw.ingredients ?? []).map((i) => ({
        id: id(),
        name: i.name,
        amount: i.amount,
        unit: i.unit,
        note: i.note,
        normalizedAmount: i.normalizedAmount,
        normalizedUnit: i.normalizedUnit,
        normalizationNote: i.normalizationNote,
        group: i.group,
      })),
    );
    const steps: RecipeStep[] = (raw.steps ?? []).map((s) => ({
      id: id(),
      order: s.order,
      instruction: s.instruction,
      action: s.action,
      utensil: s.utensil,
      heat: s.heat,
      durationSeconds: s.durationSeconds,
      check: s.check,
      personalization: s.personalization,
    }));
    toAdd.push({
      id: raw.id || id(),
      name: raw.name,
      cuisines: raw.cuisines ?? [],
      ingredientTags: [...new Set(ingredients.map((i) => i.name))],
      mealTypes: (raw.mealTypes ?? []).filter((m) => VALID_MEALS.has(m)) as Recipe['mealTypes'],
      flavorTags: raw.flavorTags ?? [],
      difficulty: isDifficulty(raw.difficulty) ? raw.difficulty : undefined,
      // 库文件里没有用时的记录是 null，转成 undefined，否则备份校验会判定「用时无效」
      estimatedMinutes:
        typeof raw.estimatedMinutes === 'number' && raw.estimatedMinutes > 0
          ? raw.estimatedMinutes
          : undefined,
      description: raw.description,
      ingredients,
      steps,
      tips: raw.tips,
      coverUrl: raw.coverUrl,
      source: raw.source,
      sourceUrl: raw.sourceUrl,
      sourceType: 'library',
      status: 'published',
      favorite: existingById.get(raw.id)?.favorite ?? false,
      dataStandard: raw.dataStandard,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (existing.length) {
    const nextIds = new Set(toAdd.map((recipe) => recipe.id));
    const removedIds = new Set(
      existing.map((recipe) => recipe.id).filter((id) => !nextIds.has(id)),
    );
    await database.transaction(
      'rw',
      [
        database.recipes,
        database.diaryEntries,
        database.mealPlans,
        database.demoState,
        database.recommendationState,
      ],
      async () => {
        await database.recipes.bulkDelete(existing.map((recipe) => recipe.id));
        if (toAdd.length) await database.recipes.bulkAdd(toAdd);
        for (const entry of await database.diaryEntries.toArray()) {
          if (entry.recipeId && removedIds.has(entry.recipeId)) {
            const next = { ...entry };
            delete next.recipeId;
            await database.diaryEntries.put(next);
          }
        }
        for (const plan of await database.mealPlans.toArray()) {
          plan.days = plan.days.map((day) => ({
            ...day,
            breakfastRecipeId:
              day.breakfastRecipeId && removedIds.has(day.breakfastRecipeId)
                ? undefined
                : day.breakfastRecipeId,
            lunchRecipeId:
              day.lunchRecipeId && removedIds.has(day.lunchRecipeId)
                ? undefined
                : day.lunchRecipeId,
            dinnerRecipeId:
              day.dinnerRecipeId && removedIds.has(day.dinnerRecipeId)
                ? undefined
                : day.dinnerRecipeId,
          }));
          await database.mealPlans.put(plan);
        }
        const demo = await database.demoState.get('current');
        if (demo) {
          demo.recentRecipeIds = demo.recentRecipeIds.filter((id) => nextIds.has(id));
          demo.recentRecommendationIds = demo.recentRecommendationIds.filter((id) =>
            nextIds.has(id),
          );
          await database.demoState.put(demo);
        }
        await database.recommendationState.clear();
      },
    );
  } else if (toAdd.length) await database.recipes.bulkAdd(toAdd);
  return toAdd.length;
}
