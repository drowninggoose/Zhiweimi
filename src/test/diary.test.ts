import { expect, test } from 'vitest';
import { diaryRows, validateDiary } from '../services/diaryService';
import { stamp } from '../types/models';
test('阶段6：两天日记按日期倒序，固定早中晚，空餐次正确映射', () => {
  const entries = [
    { ...stamp(), date: '2026-10-10', mealType: 'lunch' as const, dishName: '午餐' },
    { ...stamp(), date: '2026-10-11', mealType: 'breakfast' as const, dishName: '早餐' },
  ];
  const rows = diaryRows(entries, '2026-10-10', '2026-10-11');
  expect(rows.map((r) => r.date)).toEqual(['2026-10-11', '2026-10-10']);
  expect(rows[0].slots.map((s) => s.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
  expect(rows[0].slots[0].entry?.dishName).toBe('早餐');
  expect(rows[0].slots[1].entry).toBeUndefined();
  expect(rows[1].slots[1].entry?.dishName).toBe('午餐');
});
test('阶段6：空表单和不存在的日期拒绝', () => {
  const entry = { ...stamp(), date: '2026-10-11', mealType: 'dinner' as const, dishName: '晚饭' };
  expect(() => validateDiary({ ...entry, dishName: '' })).toThrow('菜名');
  expect(() => validateDiary({ ...entry, date: '2026-02-30' })).toThrow('日期');
});
