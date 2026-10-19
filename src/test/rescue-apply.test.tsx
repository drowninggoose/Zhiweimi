import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { repositories } from '../db/repositories';
import { fixtureRecipes } from './fixtures';
import { today } from '../types/models';

beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
});

test('分步页优先显示改写后的步骤（抢救方案）', async () => {
  const recipe = (await db.recipes.get('fixture-1'))!;
  await repositories.cookingProgress.save({
    id: `progress-${recipe.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    stage: 'steps',
    stepIndex: 0,
    completed: false,
    utensilChoices: {},
    rating: '满意',
    notes: '',
    date: today(),
    mealType: 'dinner',
    adaptedSteps: [
      { id: 'a1', order: 1, instruction: '这是改写后的第一步' },
      { id: 'rescue-x', order: 2, instruction: '加入半碗热水稀释', action: '抢救' },
      { id: 'a3', order: 3, instruction: '开大火收汁' },
    ],
  });

  window.history.replaceState({}, '', `/cook/${recipe.id}/steps`);
  render(<App />);

  expect(await screen.findByText('这是改写后的第一步')).toBeInTheDocument();
  // 原来菜谱的第一步不应出现（已被改写覆盖）
  const original = recipe.steps[0].instruction;
  expect(screen.queryByText(original)).not.toBeInTheDocument();
});

test('别的页面改写进度后，分步页会自动刷新出新步骤', async () => {
  const recipe = (await db.recipes.get('fixture-1'))!;
  await repositories.cookingProgress.save({
    id: `progress-${recipe.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    stage: 'steps',
    stepIndex: 0,
    completed: false,
    utensilChoices: {},
    rating: '满意',
    notes: '',
    date: today(),
    mealType: 'dinner',
    adaptedSteps: [{ id: 'a1', order: 1, instruction: '初始步骤' }],
  });

  window.history.replaceState({}, '', `/cook/${recipe.id}/steps`);
  render(<App />);
  expect(await screen.findByText('初始步骤')).toBeInTheDocument();
  // 一开始只有 1 步
  expect(screen.getByText('步骤 1 / 1')).toBeInTheDocument();

  // 模拟语音助手写入新的抢救步骤
  await repositories.cookingProgress.save({
    id: `progress-${recipe.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    stage: 'steps',
    stepIndex: 0,
    completed: false,
    utensilChoices: {},
    rating: '满意',
    notes: '',
    date: today(),
    mealType: 'dinner',
    adaptedSteps: [
      { id: 'a1', order: 1, instruction: '初始步骤' },
      { id: 'rescue-y', order: 2, instruction: '盛出一半肉丝备用', action: '抢救' },
    ],
  });
  window.dispatchEvent(
    new CustomEvent('zhiweimi:cooking-progress-updated', { detail: { recipeId: recipe.id } }),
  );

  // 抢救步骤插到当前步骤之后，因此总步数从 1 变成 2
  await waitFor(() => expect(screen.getByText('步骤 1 / 2')).toBeInTheDocument());
});
