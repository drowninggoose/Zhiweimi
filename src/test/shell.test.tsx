import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { App } from '../app/App';
import { navigation } from '../app/navigation';
afterEach(cleanup);
test('阶段1：左侧七个导航可访问，当前模块高亮，全局搜索跳转', async () => {
  render(<App />);
  const user = userEvent.setup();
  const nav = within(screen.getByRole('navigation'));
  // 「今日推荐」已合并进首页，导航固定为七个模块
  expect(navigation).toHaveLength(7);
  expect(navigation.map(([, label]) => label)).not.toContain('今日推荐');
  for (const [path, label] of navigation) {
    await user.click(nav.getByRole('link', { name: label }));
    expect(window.location.pathname).toBe(path);
    expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(label);
  }
  await user.type(screen.getByLabelText('全局菜谱搜索'), '番茄');
  await user.click(screen.getByRole('button', { name: '搜索' }));
  expect(window.location.search).toContain(encodeURIComponent('番茄'));
  expect(screen.queryByRole('button', { name: '设置' })).not.toBeInTheDocument();
});
