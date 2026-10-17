import { expect, test } from '@playwright/test';

/** 从开始烹饪页挑第一道菜，进入准备页再进入分步烹饪。 */
async function startCooking(page: import('@playwright/test').Page) {
  await page.goto('/cook');
  await page.getByRole('main').getByRole('link', { name: '开始烹饪' }).first().click();
  await page.getByRole('button', { name: '准备完成，开始分步烹饪' }).click();
  await expect(page.getByText(/步骤 1 \/ \d+/)).toBeVisible();
}

test('烹饪进度：中途去浏览别的功能，回来还在原来那一步', async ({ page }) => {
  await startCooking(page);
  const recipeUrl = page.url();
  const 菜名 = await page.locator('.cooking-step h2').innerText();

  // 翻到第 2 步并选一个补救建议
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('步骤 2 /', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '太咸', exact: true }).click();
  await expect(page.getByText(/少量.*充分混合.*再次试味/)).toBeVisible();

  // 用等待时间去浏览别的模块（以前这里会弹「进度不会保存」并丢掉进度）
  await page.getByRole('navigation').getByRole('link', { name: '菜谱总览' }).click();
  await expect(page.getByRole('heading', { name: /找到想做的那道菜/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: '首页总览' }).click();
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();

  // 回到烹饪页：自动恢复步骤与补救选择
  await page.goto(recipeUrl);
  await expect(page.getByText('步骤 2 /', { exact: false })).toBeVisible();
  await expect(page.getByText(/已恢复上次进度/)).toBeVisible();
  await expect(page.getByText(/少量.*充分混合.*再次试味/)).toBeVisible();
  await expect(page.locator('.cooking-step h2')).toHaveText(菜名);
});

test('烹饪进度：首页与开始烹饪页都提供「继续烹饪」入口', async ({ page }) => {
  await startCooking(page);
  await page.getByRole('button', { name: '下一步' }).click();

  // 离开后首页立刻能看到没做完的菜
  await page.getByRole('navigation').getByRole('link', { name: '首页总览' }).click();
  await expect(page.getByRole('heading', { name: '继续上次的烹饪' })).toBeVisible();
  await expect(page.getByText(/第 2 \/ \d+ 步/)).toBeVisible();
  await expect(page.getByRole('link', { name: '继续烹饪' })).toBeVisible();

  // 开始烹饪页也有
  await page.getByRole('navigation').getByRole('link', { name: '开始烹饪' }).click();
  await expect(page.getByRole('heading', { name: '继续上次的烹饪' })).toBeVisible();
  await page.getByRole('link', { name: '继续烹饪' }).click();
  await expect(page.getByText('步骤 2 /', { exact: false })).toBeVisible();
});

test('烹饪进度：日记草稿写一半离开，回来草稿还在；保存后进度清空', async ({ page }) => {
  // 同一天同一餐已有日记时会弹替换确认，这里统一接受
  page.on('dialog', (dialog) => dialog.accept());
  await startCooking(page);
  const recipeUrl = page.url();

  // 快速走到「填写日记」阶段
  const steps = await page.getByText(/步骤 \d+ \/ (\d+)/).innerText();
  const total = Number(steps.match(/\/ (\d+)/)?.[1] ?? '1');
  for (let i = 1; i < total; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '完成烹饪' }).click();
  await page.locator('input[type="date"]').fill('2026-10-11');
  await page.getByLabel('心得').fill('别忘了关火');
  await expect(page.getByLabel('心得')).toHaveValue('别忘了关火');

  // 离开一会儿再回来，草稿仍在
  await page.getByRole('navigation').getByRole('link', { name: '菜谱总览' }).click();
  await expect(page.getByRole('heading', { name: /找到想做的那道菜/ })).toBeVisible();
  await page.goto(recipeUrl);
  await expect(page.getByRole('heading', { name: '完成啦，记录这一餐' })).toBeVisible();
  await expect(page.getByLabel('心得')).toHaveValue('别忘了关火');
  await expect(page.locator('input[type="date"]')).toHaveValue('2026-10-11');

  // 保存到日记后进度应被清除，开始烹饪页不再提示继续
  await page.getByRole('button', { name: '保存到日记' }).click();
  await expect(page.getByRole('heading', { name: '每一餐，都值得记住' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: '开始烹饪' }).click();
  await expect(page.getByRole('heading', { name: '继续上次的烹饪' })).toHaveCount(0);
});
