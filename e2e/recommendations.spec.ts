import { expect, test } from '@playwright/test';

/** 从卡片流里取出当前这批推荐对应的菜谱 id。 */
async function shownRecipeIds(page: import('@playwright/test').Page) {
  return page
    .locator('.rec-strip-link')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
}

test('首页推荐中心：随机 6 道、换一批给新组合、卡片流可翻页', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  // 改成随机推荐后不再有时段信息，也没有演示标识
  await expect(page.getByText(/距离换时段还有/)).toHaveCount(0);
  await expect(page.getByText('演示推荐')).toHaveCount(0);
  await expect(page.getByText('按类型看')).toHaveCount(0);
  // 一批固定 6 道
  await expect(page.getByText(/共 6 道/)).toBeVisible();

  // 一屏一道的卡片流 + 换一批
  const first = await shownRecipeIds(page);
  expect(first.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: /换一批/ }).first().click();
  await expect
    .poll(async () => (await shownRecipeIds(page)).join(','), { timeout: 10000 })
    .not.toBe(first.join(','));

  // 翻页：下一道按钮能把卡片换成另一道菜
  const afterRefresh = await shownRecipeIds(page);
  await page.getByRole('button', { name: '下一道推荐' }).click();
  const afterNext = await shownRecipeIds(page);
  expect(afterNext[0]).not.toBe(afterRefresh[0]);
  await page.getByRole('button', { name: '上一道推荐' }).click();
  expect(await shownRecipeIds(page)).toEqual(afterRefresh);

  // 换一批之后刷新页面，推荐仍在，不会变成空白
  await page.reload();
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  expect((await shownRecipeIds(page)).length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('首页推荐中心：轮播可翻页、可进入菜谱详情，且保留换一批', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  const strip = page.getByRole('region', { name: '今日推荐图片轮播' });
  await expect(strip).toBeVisible();

  // 轮播翻页
  const first = await page.locator('.rec-strip-title').innerText();
  await page.getByRole('button', { name: '下一道推荐' }).click();
  await expect
    .poll(async () => page.locator('.rec-strip-title').innerText(), { timeout: 5000 })
    .not.toBe(first);

  // 需求：保留「换一批」
  await expect(page.getByRole('button', { name: /换一批/ })).toBeVisible();

  // 条幅可以进入菜谱详情
  await page.locator('.rec-strip-link').click();
  await expect(page).toHaveURL(/\/recipes\//);
});

test('推荐已合并进首页：左侧不再有独立入口，也没有「查看全部推荐」跳转', async ({ page }) => {
  await page.goto('/');
  const 导航 = page.getByRole('navigation');
  await expect(导航.getByRole('link')).toHaveCount(7);
  await expect(导航.getByRole('link', { name: '今日推荐' })).toHaveCount(0);
  // 首页本身就是推荐页，不再需要跳转
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  await expect(page.getByRole('link', { name: '查看全部推荐' })).toHaveCount(0);
});
