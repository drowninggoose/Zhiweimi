import { test, expect } from '@playwright/test';

/**
 * 语音助手悬浮球：
 * - 可以拖到任意位置；
 * - 拖到左/右边缘松手会吸附，隐藏约三分之二，只留一小条；
 * - 点击露出的小条可以唤醒并展开面板。
 */
test('语音助手悬浮球：拖动、贴边隐藏与点击唤醒', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();

  const fab = page.getByRole('button', { name: /语音助手/ });
  await expect(fab).toBeVisible();
  const viewport = page.viewportSize()!;
  const FAB = 64;
  const VISIBLE = 22;

  // ---- 拖到右边缘 ----
  const box = (await fab.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width - 2, 500, { steps: 20 });
  await page.mouse.up();
  // 等吸附动画结束，避免读到过渡中的中间值
  await page.waitForTimeout(400);

  const right = (await fab.boundingBox())!;
  // 球被推到视口右外侧：只剩 VISIBLE 像素可见
  expect(Math.round(viewport.width - right.x)).toBe(VISIBLE);
  expect(Math.round(right.x + right.width - viewport.width)).toBe(FAB - VISIBLE);

  // 点露出的那条，应该唤醒并展开面板
  await page.mouse.click(viewport.width - 6, right.y + right.height / 2);
  await expect(page.getByLabel('语音助手面板')).toBeVisible();

  // ---- 收起面板后拖到左边缘 ----
  // 唤醒时球会位移，等动画结束后再用 locator 点击（自动定位到元素中心）
  await page.waitForTimeout(400);
  await fab.click();
  await expect(page.getByLabel('语音助手面板')).toHaveCount(0);

  const box2 = (await fab.boundingBox())!;
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.mouse.down();
  await page.mouse.move(1, 520, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  const left = (await fab.boundingBox())!;
  expect(Math.round(left.x)).toBe(-(FAB - VISIBLE));
  expect(Math.round(left.x + left.width)).toBe(VISIBLE);

  // 贴边状态下不显示面板
  await expect(page.getByLabel('语音助手面板')).toHaveCount(0);
});
