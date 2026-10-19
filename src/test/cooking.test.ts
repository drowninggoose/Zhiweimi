import { expect, test } from 'vitest';
import {
  adaptInstructionForUtensils,
  convertIngredient,
  remedies,
} from '../services/cookingService';
import { stamp } from '../types/models';
test('阶段5：毫升与克数均可按家庭厨具容量换算，无法换算时保留单位', () => {
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
  expect(convertIngredient({ ...ingredient, unit: 'g' }, utensils).text).toContain('约半杯');
  expect(convertIngredient({ ...ingredient, unit: 'g' }, utensils).text).toContain('原始 100 g');
  expect(
    convertIngredient(
      { ...ingredient, amount: '适量', unit: undefined, normalizedAmount: 2, normalizedUnit: 'g' },
      utensils,
    ).text,
  ).toContain('原始 适量');
  expect(convertIngredient(ingredient, []).text).toBe('100 ml');
});
test('仅在烹饪步骤中使用量具替换克数，锅具或无量具时保留克数', () => {
  const ingredient = {
    id: 'sugar',
    name: '白糖',
    amount: '适量',
    normalizedAmount: 5,
    normalizedUnit: 'g',
  };
  const spoon = {
    ...stamp(),
    name: '瓷制汤勺',
    type: 'tablespoon' as const,
    capacity: 15,
    capacityUnit: 'ml' as const,
  };
  const pan = {
    ...stamp(),
    name: '平底煎锅',
    type: 'pan' as const,
    capacity: 1000,
    capacityUnit: 'ml' as const,
  };
  const instruction = '加入5克白糖并搅拌均匀。';
  expect(adaptInstructionForUtensils(instruction, [ingredient], [spoon])).toContain(
    '半瓷制汤勺的白糖',
  );
  expect(adaptInstructionForUtensils(instruction, [ingredient], [pan])).toBe(instruction);
  expect(adaptInstructionForUtensils(instruction, [ingredient], [])).toBe(instruction);
});
test('阶段5：八种补救采用保守少量调整与再次试味', () => {
  expect(Object.keys(remedies)).toHaveLength(8);
  for (const suggestion of Object.values(remedies)) {
    expect(suggestion).toContain('少量');
    expect(suggestion).toContain('充分混合');
    expect(suggestion).toContain('再次试味');
  }
});
