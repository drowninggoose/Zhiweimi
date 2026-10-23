import { describe, expect, test } from 'vitest';
import { isSeasoning, isSeasoningName } from '../services/ingredientGroups';

describe('食材与调味料分组', () => {
  test('盐、酱油、番茄酱、香料算调味料', () => {
    expect(isSeasoningName('盐')).toBe(true);
    expect(isSeasoningName('生抽')).toBe(true);
    expect(isSeasoningName('番茄酱')).toBe(true);
    expect(isSeasoningName('八角')).toBe(true);
  });

  test('黄油、鸡蛋、葱姜蒜、肉类算食材', () => {
    expect(isSeasoningName('黄油', '调料')).toBe(false);
    expect(isSeasoningName('鸡蛋')).toBe(false);
    expect(isSeasoningName('生姜')).toBe(false);
    expect(isSeasoningName('红烧肉')).toBe(false);
  });

  test('数据里标成调料的黄油仍归食材', () => {
    expect(
      isSeasoning({ id: '1', name: '黄油', group: '调料', amount: 20, unit: '克' }),
    ).toBe(false);
    expect(isSeasoning({ id: '2', name: '盐', amount: 2, unit: '克' })).toBe(true);
  });
});
