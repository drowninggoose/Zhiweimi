/**
 * 测试专用菜谱数据。
 *
 * 说明：产品里已经不再内置「演示菜谱」，只有内置的真实菜谱库（当前 45 道）。
 * 但测试仍需要一批可复现、字段完整的菜谱，所以集中放在这里。
 * id 统一带 `fixture-` 前缀，避免和真实菜谱库的 `lib-*` 混淆。
 */
import type { Recipe } from '../types/models';

const NOW = '2026-10-11T00:00:00.000Z';

type Definition = readonly [
  name: string,
  cuisine: string,
  ingredientTags: string,
  mealTypes: string,
  flavor: string,
  minutes: number,
];

/** 与早期演示菜谱同名同结构，方便既有断言继续有意义。 */
const DEFINITIONS: readonly Definition[] = [
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
];

/** 生成 16 道结构完整的测试菜谱。 */
export function fixtureRecipes(): Recipe[] {
  return DEFINITIONS.map((d, i) => {
    const [name, cuisine, ingredientTags, mealList, flavor, minutes] = d;
    return {
      id: `fixture-${i + 1}`,
      name,
      coverUrl: `/demo-images/dish-${(i % 4) + 1}.svg`,
      cuisines: [cuisine],
      ingredientTags: ingredientTags.split(','),
      mealTypes: mealList.split(',') as Recipe['mealTypes'],
      flavorTags: [flavor],
      difficulty: i === 15 ? 'advanced' : i % 3 === 0 ? 'normal' : 'easy',
      estimatedMinutes: minutes,
      ingredients: [
        ...ingredientTags.split(',').map((ingredient, j) => ({
          id: `fixture-ingredient-${i}-${j}`,
          name: ingredient,
          amount: ingredient === '鸡蛋' ? 2 : 100,
          unit: ingredient === '鸡蛋' ? '个' : 'g',
        })),
        { id: `fixture-water-${i}`, name: '水', amount: 100, unit: 'ml' },
      ],
      steps: [
        {
          id: `fixture-step-${i}-1`,
          order: 1,
          instruction: `洗净并切好${ingredientTags.split(',').join('、')}，准备干净厨具。`,
        },
        { id: `fixture-step-${i}-2`, order: 2, instruction: '按食材特点加热或混合，充分翻动。' },
        { id: `fixture-step-${i}-3`, order: 3, instruction: '确认食材熟透后调味，试味后装盘。' },
      ],
      notes: '测试专用菜谱。',
      sourceType: 'library',
      status: 'published',
      favorite: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
  });
}

/** 按菜名取一道测试菜谱，找不到直接抛错，避免测试静默通过。 */
export function fixtureByName(name: string): Recipe {
  const found = fixtureRecipes().find((r) => r.name === name);
  if (!found) throw new Error(`测试数据里没有「${name}」`);
  return found;
}
