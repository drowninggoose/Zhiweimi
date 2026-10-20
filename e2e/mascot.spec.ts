import { expect, test } from '@playwright/test';

/** 小猫说话气泡的文本。 */
async function bubbleText(page: import('@playwright/test').Page) {
  return (await page.locator('.mascot-bubble').first().textContent())?.trim() ?? '';
}

test('首页小猫：首屏主动问候，点击必换一句', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天想吃点什么？' })).toBeVisible();

  const cat = page.getByRole('button', { name: '和知味咪说句话' });
  await expect(cat).toBeVisible();

  // 首屏问候会自动出现
  await expect(page.locator('.mascot-bubble')).toBeVisible({ timeout: 5000 });
  const greeting = await bubbleText(page);
  expect(greeting.length).toBeGreaterThan(0);

  const seen = new Set<string>([greeting]);
  for (let index = 0; index < 3; index += 1) {
    await cat.click();
    // 点一次必须换一句：等到文本与之前都不同
    await expect
      .poll(async () => (seen.has(await bubbleText(page)) ? '' : await bubbleText(page)), {
        timeout: 5000,
      })
      .not.toBe('');
    const current = await bubbleText(page);
    expect(seen.has(current)).toBe(false);
    seen.add(current);
  }
});

test('侧边栏小猫不可点击', async ({ page }) => {
  await page.goto('/');
  // 只有首页英雄区那只是按钮
  await expect(page.getByRole('button', { name: '和知味咪说句话' })).toHaveCount(1);
  // 侧边栏的小猫是纯图片
  await expect(page.locator('.brand-cat')).toHaveCount(1);
  await expect(page.locator('.brand-cat').evaluate((el) => el.closest('button'))).resolves.toBeNull();
});
