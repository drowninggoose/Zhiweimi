import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
test('阶段7界面：三周期生成保存，单餐替换、重生成与重新打开读取', async () => {
  window.history.replaceState({}, '', '/planner');
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: '把三餐安排得从容一点' });
  for (const period of ['today', 'week', 'month']) {
    await user.selectOptions(screen.getByLabelText('计划周期'), period);
    await user.click(screen.getByRole('button', { name: '生成演示计划' }));
    await user.click(screen.getByRole('button', { name: '保存计划' }));
    await screen.findByText('计划已保存');
    expect((await db.mealPlans.toArray()).some((p) => p.period === period)).toBe(true);
  }
  expect(await db.mealPlans.count()).toBe(3);
  await user.click(screen.getByRole('button', { name: '替换早餐' }));
  await user.click(screen.getByRole('button', { name: '保存计划' }));
  cleanup();
  render(<App />);
  await screen.findAllByRole('button', { name: '查看计划' });
  expect(screen.getAllByRole('button', { name: '查看计划' })).toHaveLength(3);
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
