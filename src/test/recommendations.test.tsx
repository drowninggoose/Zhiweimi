import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { importLibrary } from '../db/library';
import { initialize } from '../db/seed';
import { repositories } from '../db/repositories';
import { exportBackup, parseBackup } from '../services/backupService';
import {
  buildRecommendation,
  formatCountdown,
  seededRandom,
  windowDateInfo,
  windowId,
  windowMeal,
} from '../services/recommendationService';
import type { Recipe } from '../types/models';

const at = (hour: number, minute = 0) => new Date(2026, 1, 14, hour, minute, 0);

let seq = 0;
function recipe(
  name: string,
  cuisines: string[],
  meals: Recipe['mealTypes'],
  extra: Partial<Recipe> = {},
): Recipe {
  seq += 1;
  const now = new Date().toISOString();
  return {
    id: `r-${seq}`,
    name,
    cuisines,
    ingredientTags: [],
    mealTypes: meals,
    flavorTags: [],
    difficulty: 'easy',
    estimatedMinutes: 20,
    ingredients: [{ id: `i-${seq}`, name: '清水', amount: '适量', group: '调料' }],
    steps: [{ id: `s-${seq}`, order: 1, instruction: '做熟装盘' }],
    sourceType: 'library',
    status: 'published',
    favorite: false,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

function breakfastPool() {
  return [
    recipe('鸡蛋饼', ['早餐', '面食'], ['breakfast'], { estimatedMinutes: 10 }),
    recipe('小米粥', ['粥', '早餐'], ['breakfast'], { estimatedMinutes: 30 }),
    recipe('豆浆油条', ['早餐', '小吃'], ['breakfast'], { flavorTags: ['甜味'] }),
    recipe('三明治', ['早餐', '西餐'], ['breakfast'], { estimatedMinutes: 8 }),
  ];
}

const noConditions = { flavors: [], avoidIngredients: [], preferPantry: true };

describe('时间段划分（9 点前早餐 / 14 点前午餐 / 之后晚餐）', () => {
  test.each([
    [6, 'breakfast'],
    [8, 'breakfast'],
    [9, 'lunch'],
    [13, 'lunch'],
    [14, 'dinner'],
    [21, 'dinner'],
    [23, 'dinner'],
  ])('%i 点 → %s', (hour, expected) => {
    expect(windowMeal(at(hour as number))).toBe(expected);
  });

  test('时段 id 与倒计时文案', () => {
    expect(windowId(at(8, 30))).toBe('2026-02-14-breakfast');
    expect(windowId(at(12))).toBe('2026-02-14-lunch');
    expect(windowId(at(19))).toBe('2026-02-14-dinner');
    expect(windowDateInfo(at(12)).windowRange).toBe('09:00 - 14:00');
    expect(windowDateInfo(at(12)).countdownMs).toBe(119 * 60 * 1000 + 59 * 1000);
    expect(formatCountdown(windowDateInfo(at(12)).countdownMs)).toBe('1 小时 59 分钟');
    expect(formatCountdown(119 * 60 * 1000)).toBe('1 小时 59 分钟');
    expect(formatCountdown(30 * 1000)).toBe('不到 1 分钟');
  });
});

describe('可复现的种子随机', () => {
  test('同种子结果一致，不同种子结果不同', () => {
    const a = seededRandom('2026-02-14-lunch');
    const b = seededRandom('2026-02-14-lunch');
    const c = seededRandom('2026-02-14-dinner');
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect([c(), c(), c()]).not.toEqual(first);
  });
});

describe('按时段挑选菜品', () => {
  test('早餐时段只从早餐候选里挑', () => {
    const recipes = [
      ...breakfastPool(),
      recipe('红烧肉', ['热菜', '家常菜'], ['lunch', 'dinner']),
      recipe('番茄炒蛋', ['热菜', '家常菜'], ['lunch', 'dinner']),
    ];
    const batch = buildRecommendation(recipes, noConditions, [], { now: at(7), seed: 'seed-a' });
    expect(batch.meal).toBe('breakfast');
    expect(batch.dishes.length).toBeGreaterThan(0);
    expect(batch.dishes.every((d) => d.recipe.mealTypes.includes('breakfast'))).toBe(true);
  });

  test('晚餐时段的主菜来自午餐/晚餐候选，并带汤 / 西餐 / 甜品搭配', () => {
    const recipes = [
      recipe('红烧肉', ['热菜', '家常菜'], ['lunch', 'dinner']),
      recipe('辣子鸡', ['热菜', '川菜'], ['lunch', 'dinner']),
      recipe('番茄炒蛋', ['热菜', '家常菜'], ['lunch', 'dinner']),
      recipe('青菜豆腐汤', ['汤羹'], ['lunch', 'dinner']),
      recipe('奶油蘑菇汤', ['汤羹', '西餐'], ['lunch', 'dinner']),
      recipe('提拉米苏', ['甜品', '烘焙'], ['lunch', 'dinner']),
      recipe('黑椒牛排', ['西餐', '热菜'], ['dinner']),
      recipe('凉拌黄瓜', ['凉菜'], ['lunch', 'dinner']),
    ];
    const batch = buildRecommendation(recipes, noConditions, [], { now: at(19), seed: 'seed-b' });
    expect(batch.meal).toBe('dinner');
    const slots = batch.groups.map((g) => g.slot);
    expect(slots).toContain('main');
    expect(slots).toContain('soup');
    expect(slots).toContain('dessert');
    // 所有菜都带上「为什么推它」或时段标签，且互不重复
    const ids = batch.dishes.map((d) => d.recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(batch.dishes.every((d) => d.slotLabel.length > 0)).toBe(true);
  });

  test('午餐时段不会把早餐专属菜当主菜', () => {
    const recipes = [
      recipe('鸡蛋饼', ['早餐'], ['breakfast']),
      recipe('番茄炒蛋', ['热菜'], ['lunch', 'dinner']),
      recipe('土豆炖鸡', ['热菜'], ['lunch', 'dinner']),
    ];
    const batch = buildRecommendation(recipes, noConditions, [], { now: at(12), seed: 'seed-c' });
    expect(batch.meal).toBe('lunch');
    expect(batch.dishes.some((d) => d.recipe.name === '鸡蛋饼')).toBe(false);
  });

  test('忌口只降低推荐频率，不会硬过滤', () => {
    const recipes = [
      recipe('蒜蓉虾', ['热菜'], ['lunch'], { ingredients: [{ id: 'x', name: '虾' }] }),
      recipe('清炒时蔬', ['热菜'], ['lunch']),
      recipe('牛肉面', ['面食'], ['lunch'], { ingredients: [{ id: 'y', name: '辣椒' }] }),
    ];
    const pantry = [
      {
        id: 'p1',
        name: '虾',
        category: '水产',
        status: 'available' as const,
        createdAt: '',
        updatedAt: '',
      },
    ];
    const withPantry = buildRecommendation(recipes, noConditions, pantry, {
      now: at(12),
      seed: 's1',
    });
    expect(withPantry.dishes.some((d) => d.reasons.includes('冰箱里已有食材'))).toBe(true);
    const pool = [
      recipe('含虾菜', ['热菜'], ['lunch'], { ingredients: [{ id: 'avoid', name: '虾' }] }),
      ...Array.from({ length: 19 }, (_, i) => recipe(`普通菜${i}`, ['热菜'], ['lunch'])),
    ];
    let avoidedHits = 0;
    let neutralHits = 0;
    for (let i = 0; i < 200; i++) {
      const batch = buildRecommendation(pool, { ...noConditions, avoidIngredients: ['虾'] }, [], {
        now: at(12),
        seed: `avoid-${i}`,
      });
      if (batch.dishes.some((d) => d.recipe.name === '含虾菜')) avoidedHits += 1;
      if (batch.dishes.some((d) => d.recipe.name === '普通菜0')) neutralHits += 1;
    }
    expect(avoidedHits).toBeGreaterThan(0);
    expect(avoidedHits).toBeLessThan(neutralHits);
  });

  test('同一个种子给同一批菜，换种子换组合', () => {
    const recipes = [
      ...breakfastPool(),
      recipe('红烧肉', ['热菜'], ['lunch', 'dinner']),
      recipe('番茄炒蛋', ['热菜'], ['lunch', 'dinner']),
      recipe('麻婆豆腐', ['热菜', '川菜'], ['lunch', 'dinner']),
      recipe('青菜豆腐汤', ['汤羹'], ['lunch', 'dinner']),
      recipe('提拉米苏', ['甜品', '烘焙'], ['lunch', 'dinner']),
    ];
    const first = buildRecommendation(recipes, noConditions, [], { now: at(12), seed: 'same' });
    const again = buildRecommendation(recipes, noConditions, [], { now: at(12), seed: 'same' });
    expect(again.dishes.map((d) => d.recipe.id)).toEqual(first.dishes.map((d) => d.recipe.id));
    const next = buildRecommendation(recipes, noConditions, [], { now: at(12), seed: 'other' });
    expect(next.dishes.length).toBeGreaterThan(0);
  });

  test('同一批里每道菜只出现一次，汤羹类不会占主菜位', () => {
    // 这批数据里汤羹同时带「热菜」标签，用来确认主菜位的过滤规则生效
    const recipes = [
      recipe('暖心鸡汤', ['家常菜', '汤羹', '热菜'], ['lunch', 'dinner']),
      recipe('番茄蛋花汤', ['汤羹', '热菜'], ['lunch', 'dinner']),
      recipe('青椒炒肉', ['热菜', '家常菜'], ['lunch', 'dinner']),
      recipe('干煸四季豆', ['热菜', '家常菜'], ['lunch', 'dinner']),
      recipe('凉拌黄瓜', ['凉菜'], ['lunch', 'dinner']),
      recipe('提拉米苏', ['甜品', '烘焙'], ['lunch', 'dinner']),
    ];
    const batch = buildRecommendation(recipes, noConditions, [], { now: at(12), seed: 'soup-1' });
    const ids = batch.dishes.map((d) => d.recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    const mainIds = new Set(
      batch.groups.find((g) => g.slot === 'main')?.dishes.map((d) => d.recipe.id),
    );
    expect(mainIds.has(recipes[0].id)).toBe(false);
    expect(mainIds.has(recipes[1].id)).toBe(false);
    const soup = batch.groups.find((g) => g.slot === 'soup');
    if (soup) expect(soup.dishes.every((d) => !mainIds.has(d.recipe.id))).toBe(true);
  });

  test('该餐次没有候选时退回全部候选并给出提示', () => {
    const recipes = [
      recipe('鸡蛋饼', ['早餐'], ['breakfast']),
      recipe('小米粥', ['粥', '早餐'], ['breakfast']),
      recipe('豆浆', ['早餐'], ['breakfast']),
    ];
    const batch = buildRecommendation(recipes, noConditions, [], { now: at(20), seed: 'relax' });
    expect(batch.meal).toBe('dinner');
    expect(batch.dishes.length).toBeGreaterThan(0);
    expect(batch.note).toContain('晚餐');
    expect(batch.dishes.every((d) => recipes.some((r) => r.id === d.recipe.id))).toBe(true);
  });

  test('候选充足时，换批会避开刚推过的菜', () => {
    const recipes = Array.from({ length: 20 }, (_, i) =>
      recipe(`午餐${i}`, ['热菜'], ['lunch'], { estimatedMinutes: 10 + i }),
    );
    const first = buildRecommendation(recipes, noConditions, [], { now: at(12), seed: 'k1' });
    const second = buildRecommendation(recipes, noConditions, [], {
      now: at(12),
      seed: 'k2',
      seenIds: first.dishes.map((d) => d.recipe.id),
    });
    const firstIds = new Set(first.dishes.map((d) => d.recipe.id));
    expect(second.dishes.length).toBeGreaterThan(0);
    expect(second.dishes.every((d) => !firstIds.has(d.recipe.id))).toBe(true);
  });
});

describe('「换一批」的持久化', () => {
  beforeEach(async () => {
    await db.open();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    await initialize(db);
  });

  test('首次读取会建立现场，换批会换种子并记下刚推过的菜', async () => {
    const recipes = [
      recipe('番茄炒蛋', ['热菜'], ['lunch', 'dinner']),
      recipe('红烧肉', ['热菜'], ['lunch', 'dinner']),
      recipe('土豆炖鸡', ['热菜'], ['lunch', 'dinner']),
      recipe('青菜豆腐汤', ['汤羹'], ['lunch', 'dinner']),
    ];
    const { state } = await repositories.recommendationState.ensure(at(12));
    expect(state.lastWindowId).toBe('2026-02-14-lunch');
    expect(state.refreshCount).toBe(0);

    const batch = await repositories.recommendationState.build(
      recipes,
      noConditions,
      [],
      state,
      at(12),
    );
    expect(batch.meal).toBe('lunch');
    await repositories.recommendationState.remember(state, batch);
    const refreshed = await repositories.recommendationState.refresh(at(12));
    expect(refreshed.refreshCount).toBe(1);
    expect(refreshed.seed).not.toBe(state.seed);
    expect(refreshed.recentBatches[0].ids).toEqual(batch.dishes.map((d) => d.recipe.id));

    const stored = await db.recommendationState.get('current');
    expect(stored?.refreshCount).toBe(1);
  });

  test('换成晚餐时段后种子自动更新，于是每次登录都是新的一批', async () => {
    const first = await repositories.recommendationState.ensure(at(12));
    expect(first.rotated).toBe(true);
    const same = await repositories.recommendationState.ensure(at(12, 30));
    expect(same.rotated).toBe(false);
    expect(same.state.seed).toBe(first.state.seed);
    const dinner = await repositories.recommendationState.ensure(at(19));
    expect(dinner.rotated).toBe(true);
    expect(dinner.state.lastWindowId).toBe('2026-02-14-dinner');
    expect(dinner.state.seed).toBe('2026-02-14-dinner');
  });
});

describe('菜谱库导入', () => {
  beforeEach(async () => {
    await db.open();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
  });

  test('库里 estimatedMinutes / difficulty 为 null 的记录会被归一化', async () => {
    const payload = {
      version: '1.0',
      count: 2,
      recipes: [
        {
          id: 'lib-null',
          name: '测试菜',
          cuisines: ['热菜'],
          mealTypes: ['lunch'],
          flavorTags: [],
          estimatedMinutes: null,
          difficulty: null,
          ingredients: [{ name: '盐', amount: '少许', group: '调料' }],
          steps: [{ order: 1, instruction: '炒熟' }],
        },
        {
          id: 'lib-ok',
          name: '正常菜',
          cuisines: ['热菜'],
          mealTypes: ['lunch'],
          flavorTags: [],
          estimatedMinutes: 30,
          difficulty: 'easy',
          ingredients: [{ name: '盐', amount: '少许', group: '调料' }],
          steps: [{ order: 1, instruction: '炒熟' }],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );
    const imported = await importLibrary(db);
    expect(imported).toBe(2);
    const stored = await db.recipes.get('lib-null');
    expect(stored?.estimatedMinutes).toBeUndefined();
    expect(stored?.difficulty).toBeUndefined();
    expect((await db.recipes.get('lib-ok'))?.estimatedMinutes).toBe(30);
    // 归一化后自带的备份校验必须能接受自己的导出
    const snapshot = await repositories.snapshot();
    const parsed = parseBackup(await exportBackup(snapshot));
    expect(parsed.recipes.filter((r) => r.sourceType === 'library')).toHaveLength(2);
  });
});

describe('界面：首页的推荐中心（推荐已合并进首页）', () => {
  beforeEach(async () => {
    await db.open();
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    await initialize(db);
    // jsdom 没有真实服务器，菜谱库导入会失败，这里补几道菜让推荐有候选。
    await db.recipes.bulkAdd([
      recipe('番茄炒蛋', ['热菜', '家常菜'], ['lunch', 'dinner']),
      recipe('青菜豆腐汤', ['汤羹'], ['lunch', 'dinner']),
      recipe('提拉米苏', ['甜品', '烘焙'], ['lunch', 'dinner']),
      recipe('黑椒牛排', ['西餐'], ['lunch', 'dinner']),
      recipe('凉拌黄瓜', ['凉菜'], ['lunch', 'dinner']),
      recipe('土豆炖鸡', ['热菜'], ['lunch', 'dinner']),
    ]);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('首页推荐中心显示当前时段，点「换一批」会换一组菜并记账', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: '今日推荐' });
    // 合并后首页就带着完整的推荐中心：时间段头 + 距离换时段提示
    expect(await screen.findByRole('heading', { name: /现在推荐/ })).toBeInTheDocument();
    expect(screen.getByText(/距离换时段还有/)).toBeInTheDocument();
    // PRD 18.10：推荐结果必须明确标注为演示推荐
    expect(screen.getByText('演示推荐')).toBeInTheDocument();
    const refresh = screen.getAllByRole('button', { name: /换一批/ });
    await user.click(refresh[0]);
    await waitFor(async () => {
      const stored = await db.recommendationState.get('current');
      expect(stored?.refreshCount).toBe(1);
      expect(stored?.recentBatches[0]?.ids.length).toBeGreaterThan(0);
    });
  });

  test('首页可以手动切餐次，并能切到「按类型看」', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: /现在推荐/ });
    await user.click(screen.getByRole('button', { name: '晚餐' }));
    await waitFor(() => expect(screen.getByText('手动选择餐次')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '按类型看' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '今晚主菜' })).toBeInTheDocument(),
    );
  });

  test('推荐卡片的按钮可用（可收藏、可进入烹饪）', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    await screen.findByRole('heading', { name: /现在推荐/ });
    expect(screen.getAllByRole('link', { name: '开始烹饪' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /收藏/ }).length).toBeGreaterThan(0);
  });
});
