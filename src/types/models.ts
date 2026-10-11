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
  amount?: number;
  unit?: string;
  note?: string;
};
export type RecipeStep = {
  id: string;
  order: number;
  instruction: string;
  image?: StoredImage;
  timerSeconds?: number;
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
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  notes?: string;
  sourceType: 'demo' | 'user';
  status: 'draft' | 'published';
  favorite: boolean;
};
export type Utensil = Base & {
  name: string;
  type: 'seasoning-spoon' | 'tablespoon' | 'bowl' | 'cup' | 'rice-cup' | 'other';
  image?: StoredImage;
  capacity: number;
  capacityUnit: 'ml';
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
