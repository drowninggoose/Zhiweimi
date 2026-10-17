import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { repositories } from '../db/repositories';
import { fixtureRecipes } from './fixtures';

beforeEach(async () => {
  cleanup();
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await db.cookingProgress.clear();
});

test('烹饪进度：翻到下一步后离开，进度已写入本地', async () => {
  window.history.replaceState({}, '', '/cook/fixture-1/steps');
  render(<App />);
  const user = userEvent.setup();
  expect(await screen.findByText('步骤 1 / 3')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '下一步' }));
  expect(screen.getByText('步骤 2 / 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '太咸' }));

  // 防抖 600ms 后落盘
  await waitFor(
    async () => {
      const saved = await repositories.cookingProgress.get('fixture-1');
      expect(saved?.stepIndex).toBe(1);
      expect(saved?.problem).toBe('太咸');
      expect(saved?.stage).toBe('steps');
    },
    { timeout: 4000 },
  );
});

test('烹饪进度：离开后回到同一道菜，自动停在原来的步骤并保留补救选择', async () => {
  window.history.replaceState({}, '', '/cook/fixture-1/steps');
  render(<App />);
  const user = userEvent.setup();
  expect(await screen.findByText('步骤 1 / 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '太淡' }));

  // 等进度落盘后模拟「离开」（卸载整个页面）
  await waitFor(async () => expect(await repositories.cookingProgress.get('fixture-1')).toBeTruthy(), {
    timeout: 4000,
  });
  cleanup();

  // 重新进入同一道菜
  window.history.replaceState({}, '', '/cook/fixture-1/steps');
  render(<App />);
  expect(await screen.findByText('步骤 2 / 3')).toBeInTheDocument();
  expect(screen.getByText(/已恢复上次进度/)).toBeInTheDocument();
  expect(screen.getByText(/少量添加适合的调味料/)).toBeInTheDocument();
  cleanup();
  await repositories.cookingProgress.clear();
});

test('烹饪进度：开始烹饪页列出做到一半的菜，可以点「继续烹饪」回去', async () => {
  const now = new Date().toISOString();
  await repositories.cookingProgress.save({
    id: 'progress-fixture-2',
    createdAt: now,
    updatedAt: now,
    savedAt: now,
    recipeId: 'fixture-2',
    recipeName: '香菇鸡肉饭',
    stage: 'steps',
    stepIndex: 2,
    completed: false,
    utensilChoices: {},
    rating: '满意',
    notes: '',
    date: '2026-10-11',
    mealType: 'lunch',
  });
  window.history.replaceState({}, '', '/cook');
  render(<App />);

  expect(await screen.findByRole('heading', { name: '继续上次的烹饪' })).toBeInTheDocument();
  expect(screen.getByText(/第 3 \/ 3 步/)).toBeInTheDocument();
  const links = screen.getAllByRole('link', { name: '继续烹饪' });
  expect(links.some((a) => a.getAttribute('href') === '/cook/fixture-2/steps')).toBe(true);
});

test('烹饪进度：日记草稿（心得）也会自动保存，离开再回来仍在', async () => {
  window.history.replaceState({}, '', '/cook/fixture-1/steps');
  render(<App />);
  const user = userEvent.setup();
  expect(await screen.findByText('步骤 1 / 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '完成烹饪' }));
  await user.type(screen.getByLabelText('心得'), '这次少放了盐');

  await waitFor(
    async () => {
      const saved = await repositories.cookingProgress.get('fixture-1');
      expect(saved?.notes).toBe('这次少放了盐');
      expect(saved?.stage).toBe('complete');
    },
    { timeout: 4000 },
  );

  cleanup();
  window.history.replaceState({}, '', '/cook/fixture-1/steps');
  render(<App />);
  // 恢复后直接回到「填写日记」阶段，草稿还在
  expect(await screen.findByRole('heading', { name: '完成啦，记录这一餐' })).toBeInTheDocument();
  expect(screen.getByLabelText('心得')).toHaveValue('这次少放了盐');
});

test('烹饪进度：点「仅完成」会清掉这道菜的进度', async () => {
  const now = new Date().toISOString();
  await repositories.cookingProgress.save({
    id: 'progress-fixture-3',
    createdAt: now,
    updatedAt: now,
    savedAt: now,
    recipeId: 'fixture-3',
    recipeName: '青菜豆腐汤',
    stage: 'complete',
    stepIndex: 2,
    completed: true,
    utensilChoices: {},
    rating: '满意',
    notes: '',
    date: '2026-10-11',
    mealType: 'dinner',
  });
  window.history.replaceState({}, '', '/cook/fixture-3/steps');
  render(<App />);
  const user = userEvent.setup();
  expect(await screen.findByRole('heading', { name: '完成啦，记录这一餐' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '仅完成' }));
  await waitFor(async () => expect(await db.cookingProgress.count()).toBe(0));
});
