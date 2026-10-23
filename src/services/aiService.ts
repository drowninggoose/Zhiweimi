import type { Recipe, RecipeStep, StoredImage, Utensil } from '../types/models';
import type { DerivedMemory } from './preferenceMemoryService';

export type PreferenceUnderstanding = {
  reply: string;
  memories: DerivedMemory[];
  avoid: string[];
  liked: string[];
  removeAvoid: string[];
};
export function understandPreferences(
  text: string,
  history: { role: 'assistant' | 'user'; text: string }[],
  currentMemories: string[],
) {
  return post<PreferenceUnderstanding>('/api/ai/preferences', { text, history: history.slice(-10), currentMemories });
}

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

export type CookingAdjustment = {
  reply: string;
  summary: string;
  warnings: string[];
  remainingSteps: Omit<RecipeStep, 'id' | 'order' | 'image'>[];
  changes: { type: 'add' | 'remove' | 'modify'; description: string }[];
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

/** 根据当前味道反馈，仅调整尚未执行的步骤。 */
export async function adjustCookingSteps(
  recipe: Recipe,
  currentSteps: RecipeStep[],
  currentStepIndex: number,
  feedback: string,
  tastePreferences: string[],
): Promise<CookingAdjustment> {
  return post('/api/ai/adjust-cooking', {
    recipe: {
      name: recipe.name,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      originalSteps: recipe.steps.map(({ order, instruction, heat, durationSeconds, tip, check }) => ({
        order,
        instruction,
        heat,
        durationSeconds,
        tip,
        check,
      })),
    },
    currentSteps: currentSteps.map(({ order, instruction, heat, durationSeconds, tip, check }) => ({
      order,
      instruction,
      heat,
      durationSeconds,
      tip,
      check,
    })),
    currentStepIndex,
    feedback,
    tastePreferences,
  });
}
