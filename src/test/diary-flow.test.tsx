import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { initialize } from '../db/seed';
import { stamp, today } from '../types/models';
beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await initialize(db);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test('阶段6界面：空盘带入日期餐次、详情编辑删除、关联再次烹饪', async () => {
  const date = today();
  await db.diaryEntries.add({
    ...stamp(),
    date,
    mealType: 'lunch',
    dishName: '午餐记录',
    recipeId: 'demo-1',
  });
  window.history.replaceState({}, '', '/diary');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: `${date}早餐添加记录` }));
  expect(screen.getByLabelText('日期')).toHaveValue(date);
  expect(screen.getByLabelText('餐次')).toHaveValue('breakfast');
  await user.type(screen.getByLabelText('菜名'), '早餐记录');
  await user.selectOptions(screen.getByLabelText('关联菜谱'), 'demo-1');
  await user.click(screen.getByRole('button', { name: '保存日记' }));
  await user.click(await screen.findByRole('button', { name: `${date}早餐查看早餐记录` }));
  expect(screen.getByRole('link', { name: '再次烹饪' })).toHaveAttribute('href', '/cook/demo-1');
  await user.click(screen.getByRole('button', { name: '编辑日记' }));
  await user.type(screen.getByLabelText('心得'), '日记编辑');
  await user.click(screen.getByRole('button', { name: '保存日记' }));
  await user.click(await screen.findByRole('button', { name: `${date}早餐查看早餐记录` }));
  expect(screen.getByText('日记编辑')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '删除日记' }));
  await screen.findByRole('button', { name: `${date}早餐添加记录` });
  expect(await db.diaryEntries.count()).toBe(1);
});
