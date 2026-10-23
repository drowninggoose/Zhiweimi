import { expect, test } from '@playwright/test';

/** 当前轮播显示的菜名。 */
const deckTitle = (page: import('@playwright/test').Page) => page.locator('.rec-strip-title');

test('首页推荐中心：轮播给出一批推荐，带匹配度与理由', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();

  const 轮播 = page.getByRole('region', { name: '今日推荐图片轮播' });
  await expect(轮播).toBeVisible();
  // 悬停暂停自动轮播，让箭头断言稳定
  await 轮播.hover();

  // 可解释性：匹配度 + 至少一条理由
  await expect(轮播.getByText(/匹配度 \d+%/)).toBeVisible();
  const 理由 = 轮播.locator('.rec-explain span').nth(1);
  expect((await 理由.innerText()).trim().length).toBeGreaterThan(0);

  const 圆点 = 轮播.getByRole('button', { name: /查看第 \d+ 道推荐/ });
  expect(await 圆点.count()).toBeGreaterThanOrEqual(2);
  await expect(轮播.getByRole('link')).toHaveAttribute('href', /\/recipes\/.+/);

  const 初始 = await deckTitle(page).innerText();
  await 轮播.getByRole('button', { name: '下一道推荐' }).click();
  await expect(deckTitle(page)).not.toHaveText(初始);
  await 轮播.getByRole('button', { name: '上一道推荐' }).click();
  await expect(deckTitle(page)).toHaveText(初始);

  // 刷新后推荐仍在，不退化成空态
  await page.reload();
  await expect(page.getByRole('region', { name: '今日推荐图片轮播' })).toBeVisible();
  await expect(deckTitle(page)).not.toHaveText('');

  expect(errors).toEqual([]);
});

test('推荐卡可跳到菜谱详情，并能收藏与取消收藏', async ({ page }) => {
  await page.goto('/');
  const 轮播 = page.getByRole('region', { name: '今日推荐图片轮播' });
  await expect(轮播).toBeVisible();
  await 轮播.hover();

  await 轮播.getByRole('link').click();
  await expect(page).toHaveURL(/\/recipes\/.+/);

  await page.getByRole('button', { name: /^收藏/ }).first().click();
  await expect(page.getByRole('button', { name: /^取消收藏/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /^取消收藏/ }).first().click();
  await expect(page.getByRole('button', { name: /^收藏/ }).first()).toBeVisible();
});

test('导航结构：七个入口，首页本身就是推荐页', async ({ page }) => {
  await page.goto('/');
  const 导航 = page.getByRole('navigation');
  await expect(导航.getByRole('link')).toHaveCount(7);
  await expect(导航.getByRole('link', { name: '今日推荐' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
});
