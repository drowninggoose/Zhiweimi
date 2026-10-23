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
  return post<PreferenceUnderstanding>(
    '/api/ai/preferences',
    { text, history: history.slice(-10), currentMemories },
    30_000,
  );
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

/** 上游原始报错 → 用户看得懂的话，避免把 "invalid key: xxx" 直接抛到界面。 */
function friendlyError(raw: string, status: number) {
  if (/AI_API_KEY|未配置/.test(raw))
    return 'AI 服务未配置：请在 .env 里填写 AI_API_KEY 后重启。菜谱、烹饪、日记、计划等核心功能不受影响。';
  if (/invalid key|unauthorized|forbidden|401|403/i.test(raw))
    return 'AI 服务密钥无效或已过期，请联系管理员更新。核心功能不受影响。';
  return raw || `AI 服务暂时不可用（${status}）`;
}

/** 单次请求。网络层失败抛 TypeError，由上层决定是否重试。 */
async function postOnce<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const seconds = Math.round(timeoutMs / 1000);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const value = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(friendlyError(value.error ?? '', response.status));
    return value;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new Error(`AI 响应超过 ${seconds} 秒，已停止等待；可以重试，或改用本地规则继续。`);
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 调用本地 AI 网关。
 *
 * 实测耗时：厨具识别 5~10 秒、步骤改写 15~18 秒、烹饪中调整 10~20 秒，
 * 因此按任务分配超时预算；上游偶发连接失败，网络错误自动重试一次。
 */
async function post<T>(path: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  try {
    return await postOnce<T>(path, body, timeoutMs);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    try {
      return await postOnce<T>(path, body, timeoutMs);
    } catch (retryError) {
      if (retryError instanceof TypeError)
        throw new Error('无法连接 AI 服务；核心功能仍可离线使用，请稍后重试。');
      throw retryError;
    }
  }
}

export async function analyzeUtensil(image: StoredImage): Promise<UtensilEstimate> {
  return post('/api/ai/analyze-utensil', { imageDataUrl: await imageDataUrl(image) }, 40_000);
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
  }, 45_000);
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
  }, 40_000);
}
