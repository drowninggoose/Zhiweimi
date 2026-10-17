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
test('阶段9：逐字符输入多项偏好、忌口和清空，保存后正确拆分', async () => {
  window.history.replaceState({}, '', '/settings');
  render(<App />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('默认口味（逗号分隔）'), '清淡,鲜香');
  await user.type(screen.getByLabelText('忌口（逗号分隔）'), '虾,鱼');
  await user.click(screen.getByRole('button', { name: '保存偏好' }));
  await screen.findByText('偏好已保存');
  expect((await db.preferences.get('current'))?.flavorPreferences).toEqual(['清淡', '鲜香']);
  expect((await db.preferences.get('current'))?.avoidIngredients).toEqual(['虾', '鱼']);
  await user.clear(screen.getByLabelText('忌口（逗号分隔）'));
  await user.click(screen.getByRole('button', { name: '保存偏好' }));
  expect((await db.preferences.get('current'))?.avoidIngredients).toEqual([]);
});
test('阶段8：查看菜谱后返回首页，最近查看立即显示新菜谱', async () => {
  window.history.replaceState({}, '', '/recipes/fixture-10');
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: '虾仁炒饭' });
  await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: '首页总览' }));
  await waitFor(() => expect(screen.getByLabelText('首页烹饪菜谱')).toHaveValue('fixture-10'));
});
