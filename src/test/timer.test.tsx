import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useTimer } from '../hooks/useTimer';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
test('阶段5计时：实际倒计时、暂停、重置、到零停止，无负数', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useTimer(3));
  act(() => result.current.setRunning(true));
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.seconds).toBe(2);
  act(() => result.current.setRunning(false));
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.seconds).toBe(2);
  act(() => result.current.setSeconds(3));
  expect(result.current.running).toBe(false);
  act(() => result.current.setRunning(true));
  act(() => vi.advanceTimersByTime(5000));
  expect(result.current.seconds).toBe(0);
  expect(result.current.running).toBe(false);
  act(() => result.current.setSeconds(-1));
  expect(result.current.seconds).toBe(0);
});
