import type { Utensil } from '../types/models';
export const utensilTypes = {
  'seasoning-spoon': '调味勺',
  tablespoon: '汤匙',
  bowl: '饭碗',
  cup: '水杯',
  'rice-cup': '米杯',
  other: '其他',
};
export function validateUtensil(value: Utensil) {
  if (!value.name.trim()) throw new Error('请填写厨具名称');
  if (!Number.isFinite(value.capacity) || value.capacity <= 0) throw new Error('容量必须大于0');
  if (!(value.type in utensilTypes)) throw new Error('请选择有效厨具类型');
}
