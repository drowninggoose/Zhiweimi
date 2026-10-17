import Dexie, { type Table } from 'dexie';
import type {
  Recipe,
  Utensil,
  DiaryEntry,
  MealPlan,
  PantryItem,
  Preferences,
  DemoState,
  RecommendationState,
  CookingProgress,
  PreferenceMemory,
  AssistantMessage,
} from '../types/models';
export class Database extends Dexie {
  recipes!: Table<Recipe, string>;
  utensils!: Table<Utensil, string>;
  diaryEntries!: Table<DiaryEntry, string>;
  mealPlans!: Table<MealPlan, string>;
  pantryItems!: Table<PantryItem, string>;
  preferences!: Table<Preferences, string>;
  demoState!: Table<DemoState, string>;
  recommendationState!: Table<RecommendationState, string>;
  cookingProgress!: Table<CookingProgress, string>;
  preferenceMemory!: Table<PreferenceMemory, string>;
  assistantMessages!: Table<AssistantMessage, string>;
  constructor(name = 'zhiweimi') {
    super(name);
    this.version(1).stores({
      recipes: 'id,name,sourceType,status,favorite',
      utensils: 'id,type',
      diaryEntries: 'id,date,&[date+mealType],recipeId',
      mealPlans: 'id,startDate',
      pantryItems: 'id,status',
      preferences: 'id',
      demoState: 'id',
    });
    // v2：新增「今日推荐」刷新状态表（旧库自动升级，不影响已有数据）
    this.version(2).stores({
      recipes: 'id,name,sourceType,status,favorite',
      utensils: 'id,type',
      diaryEntries: 'id,date,&[date+mealType],recipeId',
      mealPlans: 'id,startDate',
      pantryItems: 'id,status',
      preferences: 'id',
      demoState: 'id',
      recommendationState: 'id,updatedAt',
    });
    // v3：新增烹饪进度表（做到一半可以离开，回来接着做）
    this.version(3).stores({
      recipes: 'id,name,sourceType,status,favorite',
      utensils: 'id,type',
      diaryEntries: 'id,date,&[date+mealType],recipeId',
      mealPlans: 'id,startDate',
      pantryItems: 'id,status',
      preferences: 'id',
      demoState: 'id',
      recommendationState: 'id,updatedAt',
      cookingProgress: 'id,recipeId,updatedAt',
    });
    // v4：新增语音助手的聊天记录与口味/忌口记忆表
    this.version(4).stores({
      recipes: 'id,name,sourceType,status,favorite',
      utensils: 'id,type',
      diaryEntries: 'id,date,&[date+mealType],recipeId',
      mealPlans: 'id,startDate',
      pantryItems: 'id,status',
      preferences: 'id',
      demoState: 'id',
      recommendationState: 'id,updatedAt',
      cookingProgress: 'id,recipeId,updatedAt',
      preferenceMemory: 'id,dimension,active,updatedAt',
      assistantMessages: 'id,createdAt,recipeId',
    });
  }
}
export const db = new Database();
