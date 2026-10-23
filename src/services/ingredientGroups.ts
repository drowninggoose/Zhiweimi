import type { RecipeIngredient } from '../types/models';

const SEASONING_NAMES = [
  '盐',
  '糖',
  '冰糖',
  '白糖',
  '红糖',
  '砂糖',
  '酱油',
  '生抽',
  '老抽',
  '蚝油',
  '料酒',
  '黄酒',
  '醋',
  '香醋',
  '陈醋',
  '米醋',
  '胡椒',
  '花椒',
  '八角',
  '桂皮',
  '香叶',
  '十三香',
  '五香粉',
  '孜然',
  '辣椒粉',
  '辣椒面',
  '咖喱',
  '味精',
  '鸡精',
  '豆瓣酱',
  '甜面酱',
  '沙茶酱',
  '番茄酱',
  '辣椒酱',
  '黄豆酱',
  '蒜蓉辣酱',
  '海鲜酱',
  '叉烧酱',
  '淀粉',
  '生粉',
  '水淀粉',
  '色拉油',
  '食用油',
  '植物油',
  '橄榄油',
  '香油',
  '芝麻油',
  '辣椒油',
  '花生油',
  '菜籽油',
  '猪油',
];

function cleanName(name: string) {
  return name.replace(/[（(][^）)]*[）)]/g, '').replace(/\s+/g, '').trim();
}

const FOOD_EXCEPTIONS = new Set(['黄油', '牛奶', '淡奶油', '芝士', '奶酪', '酸奶', '鸡蛋', '豆腐']);

/** 调味料：盐、酱油、油、淀粉、香料等；葱姜蒜、黄油、奶制品仍算食材。 */
export function isSeasoningName(name: string, group?: string) {
  const value = cleanName(name);
  if (!value) return false;
  if (FOOD_EXCEPTIONS.has(value)) return false;
  if (group === '调料' || group === '调味料' || group === '调料类') return true;
  if (['盐', '糖', '油', '醋', '酱'].includes(value)) return true;
  return SEASONING_NAMES.some((item) => value === item || value.endsWith(item));
}

export function isSeasoning(ingredient: RecipeIngredient) {
  return isSeasoningName(ingredient.name, ingredient.group);
}
