import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { fixtureRecipes } from './fixtures';

beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
  window.history.replaceState({}, '', '/recipes');
});

afterEach(cleanup);

test('菜谱筛选始终显示餐次、时间、品类、菜系四个维度', async () => {
  render(<App />);
  const user = userEvent.setup();

  expect(await screen.findByText('按餐次')).toBeInTheDocument();
  expect(screen.getByText('按时间')).toBeInTheDocument();
  expect(screen.getByText('按品类')).toBeInTheDocument();
  expect(screen.getByText('按菜系')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '凉菜' }));
  expect(screen.getByText('按菜系')).toBeInTheDocument();
});
