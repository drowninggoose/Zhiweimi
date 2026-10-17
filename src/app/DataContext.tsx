import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { repositories } from '../db/repositories';
import type { DataSnapshot } from '../types/models';
import { Context } from './data';
export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DataSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!data) return;
    document.documentElement.style.fontSize = { small: '14px', normal: '16px', large: '18px' }[
      data.preferences.fontScale
    ];
    document.documentElement.dataset.theme = data.preferences.theme;
  }, [data]);
  const refresh = useCallback(async () => {
    try {
      setData(await repositories.snapshot());
      setError('');
    } catch (e) {
      setError(`本地数据读取失败：${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }, []);
  useEffect(() => {
    let active = true;
    repositories
      .snapshot()
      .then((snapshot) => {
        if (active) setData(snapshot);
      })
      .catch((e) => {
        if (active) setError(`本地数据读取失败：${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = useCallback(
    async (task: () => Promise<unknown>, message = '已保存') => {
      try {
        await task();
        await refresh();
        setNotice(message);
        setError('');
        return true;
      } catch (e) {
        setError(`操作失败，原数据未主动清空：${e instanceof Error ? e.message : String(e)}`);
        return false;
      }
    },
    [refresh],
  );
  return (
    <Context.Provider value={{ data, error, notice, refresh, run }}>{children}</Context.Provider>
  );
}
