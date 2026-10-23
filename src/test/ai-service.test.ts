import { afterEach, expect, test, vi } from 'vitest';
import { adaptRecipe, analyzeUtensil } from '../services/aiService';

const image = {
  id: 'img',
  blob: { arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer) } as unknown as Blob,
  mimeType: 'image/png',
  width: 1,
  height: 1,
  size: 3,
} as never;

const recipe = {
  id: 'r1',
  name: '番茄炒蛋',
  servings: 2,
  ingredients: [],
  steps: [],
} as never;

const utensil = { id: 'u1', name: '碗', type: 'bowl', capacity: 300 } as never;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('AI 超时：中止后给出可重试的中文提示，而不是原始报错', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
  );
  await expect(analyzeUtensil(image)).rejects.toThrow(/超过 \d+ 秒/);
});

test('AI 密钥失效：翻译成可操作提示，不把 invalid key 抛给用户', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'invalid key: 1683A4' }),
      } as unknown as Response),
    ),
  );
  await expect(analyzeUtensil(image)).rejects.toThrow('密钥无效或已过期');
});

test('AI 未配置：提示去 .env 配置，并说明核心功能不受影响', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: '服务端未配置 AI_API_KEY' }),
      } as unknown as Response),
    ),
  );
  await expect(adaptRecipe(recipe, utensil, ['少盐'])).rejects.toThrow('AI 服务未配置');
});

test('网络抖动：自动重试一次，两次都失败才提示无法连接', async () => {
  const fetchMock = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
  vi.stubGlobal('fetch', fetchMock);
  await expect(adaptRecipe(recipe, utensil, [])).rejects.toThrow('无法连接 AI 服务');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('网络抖动：第一次失败、第二次成功时不影响结果', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ summary: 'ok', warnings: [], steps: [] }),
    } as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  const result = await adaptRecipe(recipe, utensil, []);
  expect(result.summary).toBe('ok');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
