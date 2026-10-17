import { createContext, useContext } from 'react';
import type { DataSnapshot } from '../types/models';
export type DataContextValue = {
  data: DataSnapshot | null;
  error: string;
  notice: string;
  refresh: () => Promise<void>;
  run: (task: () => Promise<unknown>, message?: string) => Promise<boolean>;
};
export const Context = createContext<DataContextValue | null>(null);
export function useData() {
  const value = useContext(Context);
  if (!value) throw new Error('缺少数据上下文');
  return value;
}
