export const PORTAL_STORAGE_KEY = 'zhiweimi:entered:v1';

export function hasEnteredPortal() {
  try {
    return window.sessionStorage.getItem(PORTAL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markEnteredPortal() {
  try {
    window.sessionStorage.setItem(PORTAL_STORAGE_KEY, '1');
  } catch {
    // 隐私模式下忽略存储失败，不影响进入。
  }
}

export function clearEnteredPortal() {
  try {
    window.sessionStorage.removeItem(PORTAL_STORAGE_KEY);
  } catch {
    // 同上。
  }
}
