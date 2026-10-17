import type { Recipe, RecipeStep, StoredImage, Utensil } from '../types/models';

export type UtensilEstimate = {
  name: string;
  type: Utensil['type'];
  capacityMl: number;
  rangeMinMl: number;
  rangeMaxMl: number;
  confidence: number;
  reasoning: string;
  needsConfirmation: boolean;
};

export type RecipeAdaptation = {
  summary: string;
  warnings: string[];
  steps: Omit<RecipeStep, 'id' | 'order' | 'image'>[];
};

async function imageDataUrl(image: StoredImage) {
  const bytes = new Uint8Array(await image.blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${image.mimeType};base64,${btoa(binary)}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error || 'AI 服务请求失败');
  return value;
}

export async function analyzeUtensil(image: StoredImage): Promise<UtensilEstimate> {
  return post('/api/ai/analyze-utensil', { imageDataUrl: await imageDataUrl(image) });
}

export async function adaptRecipe(
  recipe: Recipe,
  utensil: Utensil,
  tastePreferences: string[],
): Promise<RecipeAdaptation> {
  return post('/api/ai/adapt-recipe', {
    recipe: {
      name: recipe.name,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      steps: recipe.steps.map(({ order, instruction, heat, durationSeconds, tip, check }) => ({
        order,
        instruction,
        heat,
        durationSeconds,
        tip,
        check,
      })),
    },
    utensil: { name: utensil.name, type: utensil.type, capacityMl: utensil.capacity },
    tastePreferences,
  });
}
