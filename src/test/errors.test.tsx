import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { db } from '../db/database';
import { repositories } from '../db/repositories';
import { initialize } from '../db/seed';
import { stamp, today } from '../types/models';
import { fixtureRecipes } from './fixtures';
beforeEach(async () => {
  await db.open();
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
  await initialize(db);
  await db.recipes.bulkAdd(fixtureRecipes());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test('阶段10：IndexedDB写入失败显示可见错误，已有数据保留', async () => {
  await db.utensils.add({
    ...stamp(),
    name: '已有杯',
    type: 'cup',
    capacity: 200,
    capacityUnit: 'ml',
  });
  vi.spyOn(repositories.utensils, 'create').mockRejectedValue(
    new DOMException('配额不足', 'QuotaExceededError'),
  );
  window.history.replaceState({}, '', '/utensils');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '添加厨具' }));
  await user.type(screen.getByLabelText('厨具名称'), '失败杯');
  await user.click(screen.getByRole('button', { name: '保存厨具' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('配额不足');
  expect(await db.utensils.count()).toBe(1);
  expect(screen.getByRole('heading', { name: '已有杯' })).toBeInTheDocument();
});
test('阶段6/10：同日同餐冲突取消保留原记录、确认替换后唯一', async () => {
  const date = today();
  await db.diaryEntries.add({ ...stamp(), date, mealType: 'dinner', dishName: '原晚餐' });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  window.history.replaceState({}, '', '/diary');
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '添加记录' }));
  await user.type(screen.getByLabelText('菜名'), '新晚餐');
  await user.click(screen.getByRole('button', { name: '保存日记' }));
  expect(confirm).toHaveBeenCalled();
  expect((await db.diaryEntries.toArray())[0].dishName).toBe('原晚餐');
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: '保存日记' }));
  await screen.findByRole('button', { name: new RegExp(`${date}晚餐查看新晚餐`) });
  expect(await db.diaryEntries.count()).toBe(1);
  expect((await db.diaryEntries.toArray())[0].dishName).toBe('新晚餐');
});
test('阶段3/10：未保存离开取消仍在编辑，菜谱库副本不会覆盖原菜谱', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  window.history.replaceState({}, '', '/recipes/fixture-1/edit');
  render(<App />);
  const user = userEvent.setup();
  await user.clear(await screen.findByLabelText('菜名'));
  await user.type(screen.getByLabelText('菜名'), '副本名');
  await user.click(within(screen.getByRole('navigation')).getByRole('link', { name: '首页总览' }));
  expect(screen.getByLabelText('菜名')).toHaveValue('副本名');
  await user.click(screen.getByRole('button', { name: '正式保存' }));
  await screen.findByRole('heading', { name: '副本名' });
  expect((await db.recipes.get('fixture-1'))?.name).toBe('番茄炒蛋');
  expect((await db.recipes.where('name').equals('副本名').first())?.sourceType).toBe('user');
});
