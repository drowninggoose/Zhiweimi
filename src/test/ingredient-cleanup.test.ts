import { describe, expect, test } from 'vitest';
import { cleanIngredientName, cleanIngredients } from '../services/ingredientCleanup';
import type { RecipeIngredient } from '../types/models';

const ingredient = (name: string, amount?: number): RecipeIngredient => ({
  id: name,
  name,
  amount,
  unit: 'g',
});

describe('菜谱食材清洗', () => {
  test('水与各种水名会被删除，水淀粉保留', () => {
    expect(cleanIngredientName('水')).toBeNull();
    expect(cleanIngredientName('清水（焯水用）')).toBeNull();
    expect(cleanIngredientName('温水')).toBeNull();
    expect(cleanIngredientName('水量')).toBeNull();
    expect(cleanIngredientName('水淀粉')).toBe('水淀粉');
  });

  test('猪肉末、猪肉丝、五花肉统一为猪肉，牛肉末不动', () => {
    expect(cleanIngredientName('猪肉末')).toBe('猪肉');
    expect(cleanIngredientName('猪肉丝')).toBe('猪肉');
    expect(cleanIngredientName('五花肉')).toBe('猪肉');
    expect(cleanIngredientName('牛肉末')).toBe('牛肉末');
  });

  test('清洗后去重，并保留第一次出现的用量', () => {
    const result = cleanIngredients([
      ingredient('猪肉末', 100),
      ingredient('清水', 50),
      ingredient('猪肉', 80),
      ingredient('葱', 10),
    ]);
    expect(result.map((item) => item.name)).toEqual(['猪肉', '葱']);
    expect(result[0].amount).toBe(100);
  });
});
