import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { transferableAbortController } from 'node:util';
// React Router uses Node's Request in JSDOM; both must use the same native signal realm.
const nativeController = transferableAbortController();
globalThis.AbortController = nativeController.constructor as typeof AbortController;
globalThis.AbortSignal = nativeController.signal.constructor as typeof AbortSignal;
