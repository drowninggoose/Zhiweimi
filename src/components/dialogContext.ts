/**
 * 对话框的上下文与 hook。
 *
 * 单独成文件是因为 `react-refresh` 要求组件文件只导出组件；
 * 而 `useConfirm` 是 hook，放在组件文件里会让热更新失效。
 */
import { createContext, useContext } from 'react';

export type DialogOptions = {
  /** 标题，必填 */
  title: string;
  /** 一句话说明 */
  message?: string;
  /** 要点列表，适合列出「会保留什么 / 会删除什么」 */
  details?: string[];
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 取消按钮文案；传 null 表示只有一个按钮（纯提示） */
  cancelText?: string | null;
  /** 危险操作：确认按钮用警示色 */
  danger?: boolean;
};

export type ConfirmFn = (options: DialogOptions) => Promise<boolean>;

export const DialogContext = createContext<ConfirmFn | null>(null);

/** 在任意组件里发起一个应用内确认框，返回用户是否点了确认。 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(DialogContext);
  if (!confirm) throw new Error('useConfirm 必须在 DialogProvider 内使用');
  return confirm;
}

/**
 * 测试专用：让 `useConfirm` 直接返回固定结果、不渲染对话框。
 *
 * 传 `null` 恢复真实对话框。单元测试里大量流程依赖「确认/取消」，
 * 逐个点按钮太脆弱，所以提供这个开关；e2e 与生产代码不使用。
 */
let autoConfirm: boolean | null = null;

export function setDialogAutoConfirm(value: boolean | null) {
  autoConfirm = value;
}

export function getDialogAutoConfirm() {
  return autoConfirm;
}