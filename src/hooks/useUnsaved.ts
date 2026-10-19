import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../components/dialogContext';

/**
 * 离开前的未保存拦截。
 *
 * 用应用内对话框代替 `window.confirm`：原生弹窗样式与产品不一致，
 * 也无法说明「未保存的修改会丢失」这类要点。
 * 路由拦截的判定是异步的：先等待用户选择，再决定 proceed / reset。
 */
export function useUnsaved(dirty: boolean, message = '还有未保存内容，确认离开？') {
  const permitted = useRef(false);
  const prompted = useRef(false);
  const blocker = useBlocker(() => dirty && !permitted.current);
  const confirm = useConfirm();

  useEffect(() => {
    if (blocker.state !== 'blocked' || prompted.current) return;
    prompted.current = true;
    let active = true;
    void confirm({
      title: '离开这个页面？',
      message,
      details: ['未保存的修改会丢失'],
      confirmText: '离开',
      cancelText: '留在本页',
      danger: true,
    }).then((ok) => {
      prompted.current = false;
      if (!active) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    });
    return () => {
      active = false;
    };
  }, [blocker, confirm, message]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      if (permitted.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);

  return () => {
    permitted.current = true;
  };
}
