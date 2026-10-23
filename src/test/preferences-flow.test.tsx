import { beforeEach, afterEach, expect, test } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { fixtureRecipes } from './fixtures';
beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
});
afterEach(cleanup);
test('阶段9：用聊天告诉 AI 偏好，写入忌口与口味记忆库', async () => {
  window.history.replaceState({}, '', '/settings');
  render(<App />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('告诉知味咪你的偏好'), '我口味清淡，不吃虾和鱼');
  await user.click(screen.getByRole('button', { name: '发送' }));
  await screen.findByText('已保存');
  await waitFor(async () => {
    const current = await db.preferences.get('current');
    expect(current?.avoidIngredients).toEqual(expect.arrayContaining(['虾', '鱼']));
  });
  const saltMemory = await db.preferenceMemory.get('memory-saltiness');
  expect(saltMemory?.polarity).toBeLessThan(0);
  expect(saltMemory?.active).toBe(true);
  expect(
    (await db.preferenceMemory.toArray()).some((item) => item.dimension === 'disliked_ingredient'),
  ).toBe(true);
});
test('阶段8：查看菜谱后返回首页，最近查看立即显示新菜谱', async () => {
  window.history.replaceState({}, '', '/recipes/fixture-10');
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: '虾仁炒饭' });
  await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: '首页总览' }));
  expect(screen.getByRole('link', { name: '选择一道菜，去全部菜谱' })).toHaveAttribute(
    'href',
    '/recipes',
  );
  await waitFor(() => expect(document.querySelector('a[href="/cook/fixture-10"]')).not.toBeNull());
});
