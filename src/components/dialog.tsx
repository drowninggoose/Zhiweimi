/**
 * 应用内确认对话框。
 *
 * 替代浏览器原生的 `window.confirm`：原生弹窗样式和产品风格完全不搭，
 * 也不能排版「会保留什么 / 会删除什么」这类要点。
 *
 * 用法：
 * ```tsx
 * const confirm = useConfirm();
 * if (await confirm({ title: '删除这条记录？', danger: true })) { ... }
 * ```
 * `useConfirm` 来自 `./dialogContext`，需要在树的上层包 `<DialogProvider>`（App 里已包好）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DialogContext, type ConfirmFn, type DialogOptions } from './dialogContext';

type DialogRequest = DialogOptions & { resolve: (ok: boolean) => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );

  const close = useCallback((ok: boolean) => {
    setRequest((current) => {
      if (!current) return null;
      // 微任务里结算，避免在 setState 更新函数中做副作用
      queueMicrotask(() => current.resolve(ok));
      return null;
    });
  }, []);

  // 打开时聚焦确认按钮；Esc 取消；锁住背景滚动
  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [request, close]);

  const titleId = 'app-dialog-title';

  return (
    <DialogContext.Provider value={confirm}>
      {children}
      {request ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            // 点遮罩关闭，点卡片内部不关
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <h3 className="dialog-title" id={titleId}>
              {request.title}
            </h3>
            {request.message ? <p className="dialog-message">{request.message}</p> : null}
            {request.details?.length ? (
              <ul className="dialog-list">
                {request.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <div className="dialog-actions">
              {request.cancelText !== null ? (
                <button type="button" className="secondary" onClick={() => close(false)}>
                  {request.cancelText ?? '取消'}
                </button>
              ) : null}
              <button
                type="button"
                ref={confirmRef}
                className={request.danger ? 'danger' : undefined}
                onClick={() => close(true)}
              >
                {request.confirmText ?? (request.cancelText === null ? '知道了' : '确定')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}
