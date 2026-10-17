import type { Database } from './database';
import type { Recipe, RecipeIngredient, RecipeStep } from '../types/models';
import { id } from '../types/models';

type LibraryIngredient = { name: string; amount?: string; group?: string };
type LibraryStep = { order: number; instruction: string };
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
};

const VALID_MEALS = new Set(['breakfast', 'lunch', 'dinner']);

/** 库文件里难度可能是 null 或空值，只保留三种合法难度。 */
function isDifficulty(value: unknown): value is NonNullable<Recipe['difficulty']> {
  return value === 'easy' || value === 'normal' || value === 'advanced';
}

/** 从 /recipes-library.json 导入菜谱库；已导入过则跳过（幂等）。返回新导入数量。 */
export async function importLibrary(database: Database): Promise<number> {
  const already = await database.recipes.where('sourceType').equals('library').count();
  if (already > 0) return 0;

  const res = await fetch('/recipes-library.json');
  if (!res.ok) throw new Error(`菜谱库加载失败：HTTP ${res.status}`);
  const data = await res.json();
  const list: LibraryRecipe[] = data?.recipes ?? [];

  const now = new Date().toISOString();
  const toAdd: Recipe[] = [];
  for (const raw of list) {
    if (!raw.name || !raw.steps?.length) continue;
    const ingredients: RecipeIngredient[] = (raw.ingredients ?? []).map((i) => ({
      id: id(),
      name: i.name,
      amount: i.amount,
      group: i.group,
    }));
    const steps: RecipeStep[] = (raw.steps ?? []).map((s) => ({
      id: id(),
      order: s.order,
      instruction: s.instruction,
    }));
    toAdd.push({
      id: raw.id || id(),
      name: raw.name,
      cuisines: raw.cuisines ?? [],
      ingredientTags: (raw.ingredients ?? []).map((i) => i.name),
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
      favorite: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (toAdd.length) await database.recipes.bulkAdd(toAdd);
  return toAdd.length;
}
