import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { WelcomePortal } from '../components/WelcomePortal';
import { clearEnteredPortal } from '../components/portalStorage';

describe('封面入口', () => {
  test('点击封面任意位置后在转场结束时进入主页', async () => {
    clearEnteredPortal();
    const onEnter = vi.fn();
    render(<WelcomePortal onEnter={onEnter} />);
    fireEvent.click(screen.getByRole('button', { name: /点击封面任意位置/ }));
    expect(onEnter).not.toHaveBeenCalled();
    await new Promise((resolve) => window.setTimeout(resolve, 1380));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  test('按任意键也可以进入主页', async () => {
    clearEnteredPortal();
    const onEnter = vi.fn();
    render(<WelcomePortal onEnter={onEnter} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onEnter).not.toHaveBeenCalled();
    await new Promise((resolve) => window.setTimeout(resolve, 1380));
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
