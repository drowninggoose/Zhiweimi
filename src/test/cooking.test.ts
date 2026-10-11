import { expect, test } from 'vitest';
import { convertIngredient, remedies } from '../services/cookingService';
import { stamp } from '../types/models';
test('阶段5：全部厨具最佳匹配、临时指定、无法换算保留单位', () => {
  const utensils = [
    { ...stamp(), name: '杯', type: 'cup' as const, capacity: 200, capacityUnit: 'ml' as const },
    {
      ...stamp(),
      name: '勺',
      type: 'tablespoon' as const,
      capacity: 15,
      capacityUnit: 'ml' as const,
    },
  ];
  const ingredient = { id: 'water', name: '水', amount: 100, unit: 'ml' };
  expect(convertIngredient(ingredient, utensils).utensilId).toBe(utensils[0].id);
  expect(convertIngredient(ingredient, utensils, utensils[1].id).utensilId).toBe(utensils[1].id);
  expect(convertIngredient({ ...ingredient, unit: 'g' }, utensils).text).toBe('100 g');
  expect(convertIngredient(ingredient, []).text).toBe('100 ml');
});
test('阶段5：八种补救采用保守少量调整与再次试味', () => {
  expect(Object.keys(remedies)).toHaveLength(8);
  for (const suggestion of Object.values(remedies)) {
    expect(suggestion).toContain('少量');
    expect(suggestion).toContain('充分混合');
    expect(suggestion).toContain('再次试味');
  }
});
