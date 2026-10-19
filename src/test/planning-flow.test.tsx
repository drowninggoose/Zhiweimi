import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { stamp, today } from '../types/models';
import { fixtureRecipes } from './fixtures';
beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test('阶段7界面：按天数生成保存、跳转挑菜替换、重生成与重新打开读取', async () => {
  window.history.replaceState({}, '', '/planner');
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: '把三餐安排得从容一点' });
  // 需求 13：周期改为自由天数（这里验证 1 天与 3 天）
  for (const days of [1, 3]) {
    await user.clear(screen.getByLabelText('计划天数（1-30）'));
    await user.type(screen.getByLabelText('计划天数（1-30）'), String(days));
    await user.click(screen.getByRole('button', { name: '生成演示计划' }));
    await user.click(screen.getByRole('button', { name: '保存计划' }));
    await screen.findByText('计划已保存');
    await waitFor(async () => {
      expect((await db.mealPlans.toArray()).some((p) => p.dayCount === days)).toBe(true);
    });
  }
  expect(await db.mealPlans.count()).toBe(2);

  // 需求 15：替换菜品会跳到「全部菜品」，选完再回来替换
  const before = (await db.mealPlans.toArray()).find((p) => p.dayCount === 3)!;
  await user.click(screen.getAllByRole('button', { name: '替换早餐' })[0]);
  await screen.findAllByRole('button', { name: '选它' });
  const pickTarget = (await db.recipes.toArray()).find((r) => r.mealTypes.includes('breakfast'));
  expect(pickTarget).toBeTruthy();
  await user.click(screen.getAllByRole('button', { name: '选它' })[0]);
  await screen.findByRole('heading', { name: '把三餐安排得从容一点' });
  // 草稿带回来了，计划还在
  expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  expect(before.dayCount).toBe(3);

  cleanup();
  render(<App />);
  await screen.findAllByRole('button', { name: '查看计划' });
  expect(screen.getAllByRole('button', { name: '查看计划' })).toHaveLength(2);
});
test('阶段7界面：家庭食材维护，默认过滤用完记录', async () => {
  window.history.replaceState({}, '', '/planner/pantry');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '添加食材' }));
  await user.type(screen.getByLabelText('食材名称'), '番茄');
  await user.click(screen.getByRole('button', { name: '保存食材' }));
  await screen.findByRole('heading', { name: '番茄' });
  await user.click(screen.getByRole('button', { name: '已用完' }));
  await screen.findByText('还没有现有食材，添加新买的食材以便安排饮食。');
  expect((await db.pantryItems.toArray())[0].status).toBe('used-up');
  await user.click(screen.getByRole('checkbox'));
  await screen.findByRole('heading', { name: '番茄' });
});
test('阶段8：首页日记摘要来自本地数据', async () => {
  await db.diaryEntries.add({
    ...stamp(),
    date: today(),
    mealType: 'lunch',
    dishName: '首页真实日记',
  });
  window.history.replaceState({}, '', '/');
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText('首页真实日记');
  expect(screen.getByRole('link', { name: /首页真实日记/ })).toHaveAttribute(
    'href',
    expect.stringContaining('/diary?entry='),
  );
  await user.click(
    within(screen.getByRole('navigation')).getByRole('link', { name: 'DIY美食日记' }),
  );
  await screen.findByRole('heading', { name: '每一餐，都值得记住' });
});
