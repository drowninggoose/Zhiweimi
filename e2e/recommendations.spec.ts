import { expect, test } from '@playwright/test';

/** 从卡片流里取出当前这批推荐对应的菜谱 id。 */
async function shownRecipeIds(page: import('@playwright/test').Page) {
  return page
    .locator('.rec-card h3 a')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
}

test('首页推荐中心：按时段推荐、换一批给新组合、卡片流可翻页', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /现在推荐/ })).toBeVisible();
  // 时段提示：9 点前早餐、9–14 点午餐、14 点后晚餐
  await expect(page.getByText(/距离换时段还有/)).toBeVisible();
  // 说明菜谱库（517 道）已导入，而不是只有 16 道演示菜
  await expect(page.getByText(/候选 \d+ 道/)).toBeVisible();
  const 候选文案 = await page.getByText(/候选 \d+ 道/).innerText();
  const 候选数 = Number(候选文案.match(/候选 (\d+) 道/)?.[1] ?? '0');
  expect(候选数).toBeGreaterThan(16);

  // 一屏一道的卡片流 + 换一批
  const first = await shownRecipeIds(page);
  expect(first.length).toBeGreaterThan(0);
  await page
    .getByRole('button', { name: /换一批/ })
    .first()
    .click();
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

  // 换一批之后刷新页面，推荐仍在（种子已持久化），不会变成空白
  await page.reload();
  await expect(page.getByRole('heading', { name: /现在推荐/ })).toBeVisible();
  expect((await shownRecipeIds(page)).length).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('首页推荐中心：手动切到晚餐、按类型看、收藏可用', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /现在推荐/ })).toBeVisible();

  await page.getByRole('button', { name: '晚餐' }).click();
  await expect(page.getByText('手动选择餐次')).toBeVisible();
  await expect(page.getByRole('heading', { name: /现在推荐 · 晚餐/ })).toBeVisible();

  await page.getByRole('button', { name: '按类型看' }).click();
  await expect(page.getByRole('heading', { name: '今晚主菜' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '暖身汤羹' })).toBeVisible();

  // 收藏按钮可用
  await page.getByRole('button', { name: /^收藏/ }).first().click();
  await expect(page.getByRole('button', { name: /^取消收藏/ }).first()).toBeVisible();
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
