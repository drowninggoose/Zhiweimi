import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
test('阶段3界面：创建、编辑、刷新数据与删除用户菜谱', async () => {
  window.history.replaceState({}, '', '/recipes/new');
  render(<App />);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('菜名'), '测试小炒');
  await user.type(screen.getByLabelText('食材1'), '番茄');
  await user.type(screen.getByLabelText('步骤1'), '炒熟装盘');
  await user.click(screen.getByRole('button', { name: '正式保存' }));
  await screen.findByRole('heading', { name: '测试小炒' });
  expect(await db.recipes.where('name').equals('测试小炒').count()).toBe(1);
  await user.click(screen.getByRole('link', { name: '编辑菜谱' }));
  await user.clear(screen.getByLabelText('菜名'));
  await user.type(screen.getByLabelText('菜名'), '编辑小炒');
  await user.click(screen.getByRole('button', { name: '正式保存' }));
  await screen.findByRole('heading', { name: '编辑小炒' });
  await user.click(screen.getByRole('button', { name: '删除菜谱' }));
  await screen.findByRole('heading', { name: '找到想做的那道菜' });
  expect(await db.recipes.where('name').equals('编辑小炒').count()).toBe(0);
});
test('阶段4界面：两件厨具创建、编辑与删除', async () => {
  window.history.replaceState({}, '', '/utensils');
  render(<App />);
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: '熟悉的厨具，直观的用量' });
  for (const name of ['杯子', '饭碗']) {
    await user.click(screen.getByRole('button', { name: '添加厨具' }));
    await user.type(screen.getByLabelText('厨具名称'), name);
    // 新建厨具不再有默认容量，必须显式填写
    await user.type(screen.getByLabelText('容量（ml）'), '200');
    await user.click(screen.getByRole('button', { name: '保存厨具' }));
    await screen.findByRole('heading', { name });
  }
  expect(await db.utensils.count()).toBe(2);
  const card = screen.getByRole('heading', { name: '杯子' }).closest('article')!;
  await user.click(within(card).getByRole('button', { name: '编辑' }));
  await user.clear(screen.getByLabelText('容量（ml）'));
  await user.type(screen.getByLabelText('容量（ml）'), '250');
  await user.click(screen.getByRole('button', { name: '保存厨具' }));
  await screen.findByText('水杯 · 250 ml');
  await user.click(
    within(screen.getByRole('heading', { name: '杯子' }).closest('article')!).getByRole('button', {
      name: '删除',
    }),
  );
  expect(await db.utensils.count()).toBe(1);
});
test('阶段5界面：准备到分步、八种建议、完成保存日记', async () => {
  window.history.replaceState({}, '', '/cook/fixture-1');
  render(<App />);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: '准备完成，开始分步烹饪' }),
  );
  expect(await screen.findByText('步骤 1 / 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '太咸' }));
  expect(screen.getByText(/少量加入未调味的同类食材/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await user.click(screen.getByRole('button', { name: '完成烹饪' }));
  await user.type(screen.getByLabelText('心得'), '完成闭环');
  await user.click(screen.getByRole('button', { name: '保存到日记' }));
  await screen.findByRole('heading', { name: '每一餐，都值得记住' });
  expect((await db.diaryEntries.toArray())[0].notes).toBe('完成闭环');
  // 保存到日记后应清掉这道菜的进度
  expect(await db.cookingProgress.count()).toBe(0);
});
