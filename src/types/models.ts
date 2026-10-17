export type MealType = 'breakfast' | 'lunch' | 'dinner';
export const meals: MealType[] = ['breakfast', 'lunch', 'dinner'];
export const mealLabels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
export type StoredImage = {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  size: number;
};
export type Base = { id: string; createdAt: string; updatedAt: string };
export type RecipeIngredient = {
  id: string;
  name: string;
  amount?: number | string; // 数值（换算用）或文本（如"少许""2个"）
  unit?: string;
  note?: string;
  group?: '主料' | '辅料' | '调料' | string; // 食材分组
};
export type RecipeStep = {
  id: string;
  order: number;
  instruction: string;
  image?: StoredImage;
  heat?: string; // 火候：大火/中火/小火（大模型二次阐述时填充）
  durationSeconds?: number; // 本步时长（秒）
  tip?: string; // 技巧/原因
  check?: string; // 判断标准（做到什么程度算好）
};
export type Recipe = Base & {
  name: string;
  coverImage?: StoredImage;
  coverUrl?: string;
  cuisines: string[];
  ingredientTags: string[];
  mealTypes: MealType[];
  flavorTags: string[];
  difficulty?: 'easy' | 'normal' | 'advanced';
  estimatedMinutes?: number;
  description?: string; // 简介
  servings?: number; // 几人份
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  notes?: string;
  tips?: string; // 烹饪小窍门
  source?: string; // 菜谱来源（如"美食天下"）
  sourceUrl?: string; // 原始链接
  sourceType: 'demo' | 'user' | 'library'; // 新增 library
  status: 'draft' | 'published';
  favorite: boolean;
};
export type Utensil = Base & {
  name: string;
  type:
    | 'seasoning-spoon'
    | 'tablespoon'
    | 'bowl'
    | 'cup'
    | 'rice-cup'
    | 'pot'
    | 'pan'
    | 'wok'
    | 'baking-dish'
    | 'other';
  image?: StoredImage;
  capacity: number;
  capacityUnit: 'ml';
  aiEstimate?: {
    rangeMinMl: number;
    rangeMaxMl: number;
    confidence: number;
    reasoning: string;
    needsConfirmation: boolean;
  };
};
export type DiaryEntry = Base & {
  date: string;
  mealType: MealType;
  dishName: string;
  image?: StoredImage;
  recipeId?: string;
  tasteRating?: string;
  notes?: string;
  adjustmentNotes?: string;
};
export type PlanConditions = {
  flavors: string[];
  avoidIngredients: string[];
  maxMinutes?: number;
  difficulty?: string;
  preferPantry: boolean;
};
export type PlanDay = {
  date: string;
  breakfastRecipeId?: string;
  lunchRecipeId?: string;
  dinnerRecipeId?: string;
};
export type MealPlan = Base & {
  period: 'today' | 'week' | 'month';
  startDate: string;
  endDate: string;
  conditions: PlanConditions;
  days: PlanDay[];
  warning?: string;
};
export type PantryItem = Base & {
  name: string;
  category: string;
  quantity?: number;
  unit?: string;
  status: 'available' | 'used-up' | 'discarded';
};
export type Preferences = {
  id: 'current';
  flavorPreferences: string[];
  avoidIngredients: string[];
  defaultDifficulty?: string;
  theme: 'cream-orange-green' | 'sage-green-cream' | 'tomato-orange-cream';
  fontScale: 'small' | 'normal' | 'large';
  dataVersion: number;
};
export type DemoState = {
  id: 'current';
  version: number;
  recentRecipeIds: string[];
  recentRecommendationIds: string[];
};
/** 「今日推荐」的刷新现场：记住当前时间段、种子和刚才推过的菜，刷新时避开重复。 */
export type RecommendationHistoryEntry = {
  windowId: string;
  seed: string;
  at: string;
  ids: string[];
};
export type RecommendationState = {
  id: 'current';
  version: number;
  /** 最近一次使用的时间段（如 2026-02-14-dinner）。 */
  lastWindowId: string;
  /** 当前时间段的换批种子，刷新一次换一个。 */
  seed: string;
  refreshCount: number;
  updatedAt: string;
  /** 只保留最近若干批，供「刷新不重复」使用。 */
  recentBatches: RecommendationHistoryEntry[];
};
/**
 * 烹饪进度：一道菜做到一半时保存的现场，用于「离开后回来接着做」。
 * 一道菜一条记录，主键是 recipeId。
 */
export type CookingProgress = Base & {
  recipeId: string;
  recipeName: string;
  /** 停在哪一阶段：分步烹饪中，或已点完成正在写日记。 */
  stage: 'steps' | 'complete';
  /** 当前停在第几步（0 开始）。 */
  stepIndex: number;
  /** 已点「完成烹饪」、正在填写日记。 */
  completed: boolean;
  /** 准备页的厨具换算选择：食材 id -> 厨具 id。 */
  utensilChoices: Record<string, string>;
  cookingUtensilId?: string;
  adaptedSteps?: RecipeStep[];
  adaptationSummary?: string;
  /** 味道/状态补救选择，如「太咸」。 */
  problem?: string;
  /** 日记草稿。 */
  rating: string;
  notes: string;
  date: string;
  mealType: MealType;
  image?: StoredImage;
  /** 最后保存时间（展示「x 分钟前」用）。 */
  savedAt: string;
};
export type DataSnapshot = {
  recipes: Recipe[];
  utensils: Utensil[];
  diaryEntries: DiaryEntry[];
  mealPlans: MealPlan[];
  pantryItems: PantryItem[];
  preferences: Preferences;
  demoState: DemoState;
};
export const id = () => crypto.randomUUID();
export const stamp = () => {
  const now = new Date().toISOString();
  return { id: id(), createdAt: now, updatedAt: now };
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
