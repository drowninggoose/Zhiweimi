import { expect, test } from 'vitest';
import { validateUtensil } from '../services/utensilService';
import { validateImage } from '../services/imageService';
import { stamp } from '../types/models';
test('阶段4：厨具名称和正容量验证', () => {
  const value = {
    ...stamp(),
    name: '汤匙',
    type: 'tablespoon' as const,
    capacity: 15,
    capacityUnit: 'ml' as const,
  };
  expect(() => validateUtensil(value)).not.toThrow();
  expect(() => validateUtensil({ ...value, name: '' })).toThrow('名称');
  for (const capacity of [0, -1, NaN])
    expect(() => validateUtensil({ ...value, capacity })).toThrow('大于0');
});
test('阶段4：超大与错误图片格式拒绝', () => {
  expect(() => validateImage(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).toThrow(
    '仅支持',
  );
  expect(() =>
    validateImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })),
  ).toThrow('10 MB');
  expect(() => validateImage(new File(['x'], 'x.png', { type: 'image/png' }))).not.toThrow();
});
