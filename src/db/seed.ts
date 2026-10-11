import type { Database } from './database';
import type { Preferences, Recipe } from '../types/models';
export const defaultPreferences: Preferences = {
  id: 'current',
  flavorPreferences: [],
  avoidIngredients: [],
  theme: 'cream-orange-green',
  fontScale: 'normal',
  dataVersion: 1,
};
const definitions = [
  ['番茄炒蛋', '家常菜', '番茄,鸡蛋', 'lunch,dinner', '鲜香', 15],
  ['香菇鸡肉饭', '粤菜', '鸡肉,香菇,米饭', 'lunch,dinner', '清淡', 30],
  ['青菜豆腐汤', '汤羹', '蔬菜,豆腐', 'lunch,dinner', '清淡', 15],
  ['葱香鸡蛋饼', '面食', '鸡蛋,面粉,葱', 'breakfast', '鲜香', 15],
  ['南瓜牛奶粥', '甜品', '南瓜,牛奶,米饭', 'breakfast', '微甜', 30],
  ['土豆炖鸡', '家常菜', '土豆,鸡肉', 'lunch,dinner', '鲜香', 45],
  ['麻婆豆腐', '川菜', '豆腐,猪肉', 'lunch,dinner', '微辣', 25],
  ['清蒸鱼', '粤菜', '鱼,葱', 'lunch,dinner', '清淡', 30],
  ['牛肉面', '面食', '牛肉,面条,蔬菜', 'lunch,dinner', '鲜香', 45],
  ['虾仁炒饭', '家常菜', '虾,鸡蛋,米饭', 'lunch,dinner', '鲜香', 20],
  ['蒸蛋羹', '家常菜', '鸡蛋', 'breakfast,lunch,dinner', '清淡', 15],
  ['酸辣土豆丝', '湘菜', '土豆', 'lunch,dinner', '酸辣', 20],
  ['菠菜拌豆腐', '家常菜', '蔬菜,豆腐', 'lunch,dinner', '清淡', 15],
  ['苹果燕麦杯', '甜品', '苹果,牛奶,燕麦', 'breakfast', '微甜', 10],
  ['葱油拌面', '江浙菜', '面条,葱', 'breakfast,lunch,dinner', '鲜香', 15],
  ['红烧肉', '鲁菜', '猪肉', 'lunch,dinner', '浓郁', 60],
] as const;
export function demoRecipes(): Recipe[] {
  const now = new Date().toISOString();
  return definitions.map((d, i) => ({
    id: `demo-${i + 1}`,
    name: d[0],
    coverUrl: `/demo-images/dish-${(i % 4) + 1}.svg`,
    cuisines: [d[1]],
    ingredientTags: d[2].split(','),
    mealTypes: d[3].split(',') as Recipe['mealTypes'],
    flavorTags: [d[4]],
    difficulty: i === 15 ? 'advanced' : i % 3 === 0 ? 'normal' : 'easy',
    estimatedMinutes: d[5],
    ingredients: [
      ...d[2].split(',').map((name, j) => ({
        id: `ingredient-${i}-${j}`,
        name,
        amount: name === '鸡蛋' ? 2 : 100,
        unit: name === '鸡蛋' ? '个' : 'g',
      })),
      { id: `water-${i}`, name: '水', amount: 100, unit: 'ml' },
    ],
    steps: [
      {
        id: `step-${i}-1`,
        order: 1,
        instruction: `洗净并切好${d[2].split(',').join('、')}，准备干净厨具。`,
      },
      {
        id: `step-${i}-2`,
        order: 2,
        instruction: '按食材特点加热或混合，充分翻动，注意观察状态。',
        timerSeconds: 180,
      },
      {
        id: `step-${i}-3`,
        order: 3,
        instruction: '确认食材熟透后少量调味，充分混合，试味后装盘。',
      },
    ],
    notes: '虚构演示菜谱，用于功能验证；实际操作请按食材状态调整。',
    sourceType: 'demo',
    status: 'published',
    favorite: false,
    createdAt: now,
    updatedAt: now,
  }));
}
export async function initialize(database: Database) {
  await database.transaction('rw', database.tables, async () => {
    if (!(await database.demoState.get('current'))) {
      if ((await database.recipes.count()) === 0) await database.recipes.bulkAdd(demoRecipes());
      await database.demoState.put({
        id: 'current',
        version: 1,
        recentRecipeIds: [],
        recentRecommendationIds: [],
      });
    }
    if (!(await database.preferences.get('current')))
      await database.preferences.put(defaultPreferences);
  });
}
