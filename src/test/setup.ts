import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { transferableAbortController } from 'node:util';
import { beforeEach } from 'vitest';

// 组件测试默认从工作台开始；封面本身用 portal.test.tsx 单独覆盖。
beforeEach(() => {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem('zhiweimi:entered:v1', '1');
  }
});
// React Router uses Node's Request in JSDOM; both must use the same native signal realm.
const nativeController = transferableAbortController();
globalThis.AbortController = nativeController.constructor as typeof AbortController;
globalThis.AbortSignal = nativeController.signal.constructor as typeof AbortSignal;
