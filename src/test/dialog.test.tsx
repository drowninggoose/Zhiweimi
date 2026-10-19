import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogProvider } from '../components/dialog';
import { setDialogAutoConfirm, useConfirm, type DialogOptions } from '../components/dialogContext';

/** 测试外壳：点按钮发起一个确认框，把结果回传出来。 */
function Harness({
  options,
  onResult,
}: {
  options: DialogOptions;
  onResult: (ok: boolean) => void;
}) {
  const confirm = useConfirm();
  return (
    <button
      type="button"
      onClick={() => {
        void confirm(options).then(onResult);
      }}
    >
      触发
    </button>
  );
}

function setup(options: DialogOptions) {
  const onResult = vi.fn();
  const user = userEvent.setup();
  render(
    <DialogProvider>
      <Harness options={options} onResult={onResult} />
    </DialogProvider>,
  );
  return { onResult, user };
}

describe('应用内对话框', () => {
  beforeEach(() => setDialogAutoConfirm(null));
  afterEach(() => cleanup());

  test('点确认返回 true，并展示标题、说明与要点', async () => {
    const { onResult, user } = setup({
      title: '清空全部数据？',
      message: '包括菜谱库与图片',
      details: ['请先导出备份'],
      confirmText: '全部清空',
      danger: true,
    });

    await user.click(screen.getByRole('button', { name: '触发' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('清空全部数据？');
    expect(dialog).toHaveTextContent('包括菜谱库与图片');
    expect(dialog).toHaveTextContent('请先导出备份');

    await user.click(screen.getByRole('button', { name: '全部清空' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('点取消返回 false', async () => {
    const { onResult, user } = setup({ title: '删除这条？' });
    await user.click(screen.getByRole('button', { name: '触发' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  test('按 Esc 视为取消', async () => {
    const { onResult, user } = setup({ title: '删除这条？' });
    await user.click(screen.getByRole('button', { name: '触发' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  test('cancelText 为 null 时只有一个按钮，文案默认「知道了」', async () => {
    const { onResult, user } = setup({ title: '提示', cancelText: null });
    await user.click(screen.getByRole('button', { name: '触发' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '知道了' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
  });
});
