import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { transferableAbortController } from 'node:util';
// React Router uses Node's Request in JSDOM; both must use the same native signal realm.
const nativeController = transferableAbortController();
globalThis.AbortController = nativeController.constructor as typeof AbortController;
globalThis.AbortSignal = nativeController.signal.constructor as typeof AbortSignal;
// 单元测试默认让确认框直接返回 true，保持既有流程断言不变；
// 需要「取消」或验证对话框本身的用例，自己再 setDialogAutoConfirm(false/null)。
import { setDialogAutoConfirm } from '../components/dialogContext';
setDialogAutoConfirm(true);