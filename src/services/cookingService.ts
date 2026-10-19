import type { RecipeIngredient, Utensil } from '../types/models';
const MEASURING_UTENSILS = new Set(['seasoning-spoon', 'tablespoon', 'bowl', 'cup', 'rice-cup']);

function naturalPortion(portions: number, utensil: Utensil) {
  const rounded = Math.round(portions * 2) / 2;
  if (rounded < 0.5) return `少于半${utensil.name}`;
  if (rounded === 0.5) return `半${utensil.name}`;
  if (Number.isInteger(rounded)) return `${rounded}${utensil.name}`;
  return `${Math.floor(rounded)}${utensil.name}半`;
}
export function convertIngredient(
  ingredient: RecipeIngredient,
  utensils: Utensil[],
  selectedId?: string,
) {
  const original = `${ingredient.amount ?? ''} ${ingredient.unit ?? ''}`.trim();
  const normalizedAmount = ingredient.normalizedAmount ?? ingredient.amount;
  const normalizedUnit = ingredient.normalizedUnit ?? ingredient.unit;
  const amountNum = typeof normalizedAmount === 'number' ? normalizedAmount : undefined;
  if (!amountNum || amountNum <= 0 || !['ml', 'g'].includes(normalizedUnit ?? ''))
    return { text: original };
  // 家庭厨具的容量来自图片 AI 估算或用户确认。克数先按常见堆积密度折算成体积，
  // 再选择最接近 1/4、1/2、1、1.5 等易操作份数的家用厨具。
  const densities: Array<[RegExp, number]> = [
    [/油/, 0.92],
    [/面粉|淀粉|粉$/, 0.55],
    [/白糖|砂糖|冰糖/, 0.85],
    [/盐/, 1.2],
    [/大米|小米|糯米|米$/, 0.85],
    [/蜂蜜|糖浆/, 1.4],
  ];
  const density = densities.find(([pattern]) => pattern.test(ingredient.name))?.[1] ?? 1;
  const volumeMl = normalizedUnit === 'g' ? amountNum / density : amountNum;
  const usable = utensils.filter(
    (u) =>
      MEASURING_UTENSILS.has(u.type) &&
      u.capacity > 0 &&
      Number.isFinite(u.capacity) &&
      (!selectedId || u.id === selectedId),
  );
  const easy = [0.25, 0.5, 1, 1.5, 2, 3, 4];
  const choices = usable
    .map((u) => {
      const portions = volumeMl / u.capacity;
      const score =
        Math.min(...easy.map((n) => Math.abs(portions - n))) + Math.max(0, portions - 4);
      return { u, portions, score };
    })
    .sort((a, b) => a.score - b.score);
  if (!choices.length) return { text: original };
  const best = choices[0];
  const measure = naturalPortion(best.portions, best.u);
  return {
    text: `约${measure}（原始 ${original || `${amountNum} ${normalizedUnit}`}${normalizedUnit === 'g' ? '，按标准克数和常见密度估算' : ''}）`,
    measure: `约${measure}`,
    utensilId: best.u.id,
    portions: best.portions,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 仅在分步烹饪时，把步骤里的克/毫升替换成用户家中已上传量具的份数。 */
export function adaptInstructionForUtensils(
  instruction: string,
  ingredients: RecipeIngredient[],
  utensils: Utensil[],
) {
  if (!utensils.length) return instruction;
  let result = instruction;
  for (const ingredient of ingredients) {
    const converted = convertIngredient(ingredient, utensils);
    if (!converted.utensilId || !converted.measure) continue;
    const name = escapeRegExp(ingredient.name);
    const amount = ingredient.normalizedAmount;
    const unit = ingredient.normalizedUnit;
    if (typeof amount !== 'number' || !unit) continue;
    const unitPattern = unit === 'g' ? '(?:克|g)' : '(?:毫升|ml)';
    result = result
      .replace(
        new RegExp(`${name}\\s*${amount}\\s*${unitPattern}`, 'gi'),
        `${converted.measure}的${ingredient.name}`,
      )
      .replace(
        new RegExp(`${amount}\\s*${unitPattern}\\s*${name}`, 'gi'),
        `${converted.measure}的${ingredient.name}`,
      );
  }
  return result;
}
export const remedies = {
  太咸: '少量加入未调味的同类食材或适合的液体，充分混合，再次试味。',
  太淡: '少量添加适合的调味料，充分混合，再次试味。',
  太辣: '少量加入适合的未调味食材或液体，充分混合，再次试味。',
  太甜: '少量加入未调味的同类食材，充分混合，再次试味。',
  太酸: '少量增加适合的未调味食材，充分混合，再次试味。',
  太油: '少量撇去表面浮油或调整配菜，充分混合，再次试味。',
  太稀: '少量延长加热或添加适合的增稠食材，充分混合，再次试味。',
  太稠: '少量添加适合的液体，充分混合，再次试味。',
};
