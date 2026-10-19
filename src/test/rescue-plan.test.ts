import { describe, expect, test } from 'vitest';
import type { RecipeStep } from '../types/models';
import {
  dishKindOf,
  mergeRescueSteps,
  shouldApplyRescue,
  type RescuePlan,
} from '../services/rescuePlan';

const step = (order: number, instruction: string): RecipeStep => ({
  id: `s-${order}`,
  order,
  instruction,
});

let counter = 0;
const makeId = () => `id${++counter}`;

describe('菜品形态判断', () => {
  test('汤羹类识别为汤菜', () => {
    expect(dishKindOf({ name: '番茄蛋汤', cuisines: ['汤羹'] })).toBe('汤菜');
    expect(dishKindOf({ name: '皮蛋瘦肉粥', cuisines: ['粥'] })).toBe('汤菜');
  });

  test('凉菜、蒸菜、炖菜、热菜分别识别', () => {
    expect(dishKindOf({ name: '凉拌黄瓜', cuisines: ['凉菜'] })).toBe('凉菜');
    expect(dishKindOf({ name: '清蒸鱼', cuisines: ['热菜'] })).toBe('蒸菜');
    expect(dishKindOf({ name: '土豆炖鸡', cuisines: ['热菜'] })).toBe('炖／焖菜');
    expect(dishKindOf({ name: '青椒炒肉', cuisines: ['热菜'] })).toBe('炒／烧类热菜');
  });

  test('其它类型兜底', () => {
    expect(dishKindOf({ name: '提拉米苏', cuisines: ['甜品'] })).toBe('甜品烘焙');
    expect(dishKindOf({ name: '蛋炒饭', cuisines: ['主食'] })).toBe('主食面食');
    expect(dishKindOf({ name: '不知名', cuisines: [] })).toBe('家常菜');
  });
});

describe('抢救方案与步骤合并', () => {
  const base = [step(1, '切菜'), step(2, '下锅翻炒'), step(3, '收汁'), step(4, '装盘')];

  test('已做过的步骤保持原样，插入抢救步骤并改写后续步骤', () => {
    const plan: RescuePlan = {
      diagnosis: '太咸，先稀释再收汁',
      fixes: [{ do: '加半碗热水', amount: '约 100ml', when: '现在', check: '尝起来不咸' }],
      insertNow: { instruction: '加入半碗热水稀释', action: '稀释', check: '汤汁尝起来刚好' },
      remaining: [
        { instruction: '开大火收汁', action: '收汁', check: '汤汁变浓' },
        { instruction: '关火装盘', action: '装盘' },
      ],
    };

    const result = mergeRescueSteps(base, 1, plan, makeId);

    // 前两步（含当前步骤）不被动过
    expect(result.steps[0].instruction).toBe('切菜');
    expect(result.steps[1].instruction).toBe('下锅翻炒');
    // 第 3 步是插入的抢救步骤
    expect(result.steps[2].instruction).toBe('加入半碗热水稀释');
    expect(result.steps[2].id.startsWith('rescue-')).toBe(true);
    // 后续步骤被改写为 2 步
    expect(result.steps[3].instruction).toBe('开大火收汁');
    expect(result.steps[4].instruction).toBe('关火装盘');
    // 重新编号
    expect(result.steps.map((item) => item.order)).toEqual([1, 2, 3, 4, 5]);
    expect(result.inserted).toBe(1);
    expect(result.replaced).toBe(2);
  });

  test('没有 insertNow 时只改写后续步骤，不插步骤', () => {
    const result = mergeRescueSteps(
      base,
      2,
      { diagnosis: '火太大', fixes: [], remaining: [{ instruction: '转小火' }] },
      makeId,
    );
    expect(result.inserted).toBe(0);
    // 前 3 步（含当前步骤）保留 + 改写后的 1 步
    expect(result.steps).toHaveLength(4);
    expect(result.steps[3].instruction).toBe('转小火');
    expect(result.replaced).toBe(1);
  });

  test('没有 remaining 时保留原来的后续步骤', () => {
    const result = mergeRescueSteps(
      base,
      1,
      { diagnosis: '加点盐', fixes: [], insertNow: { instruction: '补少许盐' } },
      makeId,
    );
    expect(result.inserted).toBe(1);
    expect(result.replaced).toBe(0);
    // 原本的第 3、4 步还在
    expect(result.steps.map((item) => item.instruction)).toEqual([
      '切菜',
      '下锅翻炒',
      '补少许盐',
      '收汁',
      '装盘',
    ]);
  });

  test('当前步骤是最后一步时不会越界', () => {
    const result = mergeRescueSteps(
      base,
      99,
      { diagnosis: '最后调整', fixes: [], insertNow: { instruction: '淋几滴香油' } },
      makeId,
    );
    expect(result.steps).toHaveLength(5);
    expect(result.steps[4].instruction).toBe('淋几滴香油');
  });

  test('空指令的补丁会被忽略', () => {
    const result = mergeRescueSteps(
      base,
      0,
      { diagnosis: '无操作', fixes: [], insertNow: { instruction: '   ' }, remaining: [] },
      makeId,
    );
    expect(result.inserted).toBe(0);
    expect(result.steps).toHaveLength(4);
  });
});

describe('是否需要触发步骤改写', () => {
  test('没有方案或方案为空时不触发', () => {
    expect(shouldApplyRescue(null)).toBe(false);
    expect(shouldApplyRescue(undefined)).toBe(false);
    expect(shouldApplyRescue({ diagnosis: '只是解释', fixes: [] })).toBe(false);
  });

  test('有插入步骤或后续改写时触发', () => {
    expect(
      shouldApplyRescue({ diagnosis: 'x', fixes: [], insertNow: { instruction: '加水' } }),
    ).toBe(true);
    expect(
      shouldApplyRescue({ diagnosis: 'x', fixes: [], remaining: [{ instruction: '收汁' }] }),
    ).toBe(true);
  });
});
