import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { fixtureRecipes } from './fixtures';
import { resetMascotState } from '../services/mascotService';

beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
  resetMascotState();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
});

function bubbleText() {
  const element = document.querySelector('.mascot-bubble');
  return element?.textContent?.trim() ?? '';
}

test('首屏会主动说一句问候', async () => {
  render(<App />);
  await waitFor(() => expect(bubbleText().length).toBeGreaterThan(0), { timeout: 3000 });
});

test('点一下小猫会冒气泡，再点一次必定换一句', async () => {
  render(<App />);
  const user = userEvent.setup();
  const button = await screen.findByRole('button', { name: '和知味咪说句话' });

  await user.click(button);
  await waitFor(() => expect(bubbleText().length).toBeGreaterThan(0));
  const first = bubbleText();

  await user.click(button);
  await waitFor(() => expect(bubbleText()).not.toBe(first));
  const second = bubbleText();

  await user.click(button);
  await waitFor(() => expect(bubbleText()).not.toBe(second));
});

test('侧边栏的小猫不可点击（只有首页那只带交互）', async () => {
  render(<App />);
  const buttons = await screen.findAllByRole('button', { name: '和知味咪说句话' });
  expect(buttons).toHaveLength(1);
});
