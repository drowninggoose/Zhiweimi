import type { RecipeIngredient, Utensil } from '../types/models';
export function convertIngredient(
  ingredient: RecipeIngredient,
  utensils: Utensil[],
  selectedId?: string,
) {
  const original = `${ingredient.amount ?? ''} ${ingredient.unit ?? ''}`.trim();
  if (ingredient.unit !== 'ml' || !ingredient.amount || ingredient.amount <= 0)
    return { text: original };
  const usable = utensils.filter(
    (u) => u.capacity > 0 && Number.isFinite(u.capacity) && (!selectedId || u.id === selectedId),
  );
  const easy = [0.25, 0.5, 1, 1.5, 2, 3, 4];
  const choices = usable
    .map((u) => {
      const portions = ingredient.amount! / u.capacity;
      const score =
        Math.min(...easy.map((n) => Math.abs(portions - n))) + Math.max(0, portions - 4);
      return { u, portions, score };
    })
    .sort((a, b) => a.score - b.score);
  if (!choices.length) return { text: original };
  const best = choices[0];
  return {
    text: `约 ${Number(best.portions.toFixed(2))} 个${best.u.name}（${original}）`,
    utensilId: best.u.id,
    portions: best.portions,
  };
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
