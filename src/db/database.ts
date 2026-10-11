import Dexie, { type Table } from 'dexie';
import type {
  Recipe,
  Utensil,
  DiaryEntry,
  MealPlan,
  PantryItem,
  Preferences,
  DemoState,
} from '../types/models';
export class Database extends Dexie {
  recipes!: Table<Recipe, string>;
  utensils!: Table<Utensil, string>;
  diaryEntries!: Table<DiaryEntry, string>;
  mealPlans!: Table<MealPlan, string>;
  pantryItems!: Table<PantryItem, string>;
  preferences!: Table<Preferences, string>;
  demoState!: Table<DemoState, string>;
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
  }
}
export const db = new Database();
