import { test, expect, type Page } from '@playwright/test';
import { png } from './fixtures';
async function upload(page: Page, label: string) {
  await page
    .getByLabel(label)
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('正在压缩图片…')).toHaveCount(0);
}
test('完整本地闭环：图片、刷新持久化、三周期计划、备份覆盖恢复、离线与导航', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const external: string[] = [];
  page.on('request', (request) => {
    if (
      !request.url().startsWith('http://localhost:4173') &&
      !request.url().startsWith('blob:') &&
      !request.url().startsWith('data:')
    )
      external.push(request.url());
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天想吃点什么？' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  // 首页承载完整的推荐中心：随机 6 道
  await expect(page.getByText(/共 6 道/)).toBeVisible();
  const initial = await page.locator('.rec-strip-title').allTextContents();
  await page.getByRole('button', { name: '🔄 换一批' }).click();
  await expect
    .poll(async () => page.locator('.rec-strip-title').allTextContents(), { timeout: 10000 })
    .not.toEqual(initial);
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.getByRole('link', { name: '新建菜谱', exact: true }).click();
  await page.getByLabel('菜名', { exact: true }).fill('浏览器测试炒蛋');
  await upload(page, '上传封面');
  await expect(page.getByAltText('封面预览')).toBeVisible();
  await page.getByLabel('食材1', { exact: true }).fill('鸡蛋');
  await page.getByLabel('步骤1', { exact: true }).fill('打散鸡蛋并充分加热');
  await page.getByRole('button', { name: '正式保存' }).click();
  await expect(page.getByRole('heading', { name: '浏览器测试炒蛋' })).toBeVisible();
  const recipeUrl = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: '浏览器测试炒蛋' })).toBeVisible();
  expect(
    await page.getByAltText('浏览器测试炒蛋').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await page.getByRole('navigation').getByRole('link', { name: '家用厨具' }).click();
  await page.getByRole('button', { name: '添加厨具' }).click();
  await page.getByLabel('厨具名称').fill('测试量杯');
  await page.getByLabel('容量（ml）').fill('200');
  await upload(page, '上传厨具照片');
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('heading', { name: '测试量杯' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试量杯' })).toBeVisible();
  await page.goto(recipeUrl);
  await page.getByRole('main').getByRole('link', { name: '开始烹饪', exact: true }).click();
  await page.getByRole('button', { name: '准备完成，开始分步烹饪' }).click();
  for (const problem of ['太咸', '太淡', '太辣', '太甜', '太酸', '太油', '太稀', '太稠']) {
    await page.getByRole('button', { name: problem, exact: true }).click();
    await expect(page.getByText(/少量.*充分混合.*再次试味/)).toBeVisible();
  }
  await page.getByRole('button', { name: '完成烹饪' }).click();
  await upload(page, '上传成品照片');
  await page.getByLabel('心得').fill('浏览器闭环日记');
  await page.getByRole('button', { name: '保存到日记' }).click();
  await expect(page.getByRole('heading', { name: '每一餐，都值得记住' })).toBeVisible();
  // 保存后停留在日记总览，刚记的一餐应出现在列表里
  await expect(page.getByRole('button', { name: /查看浏览器测试炒蛋/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /查看浏览器测试炒蛋/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: '饮食计划助手' }).click();
  await page.getByRole('link', { name: '家庭食材', exact: true }).click();
  await page.getByRole('button', { name: '添加食材' }).click();
  await page.getByLabel('食材名称').fill('鸡蛋');
  await page.getByLabel('数量', { exact: true }).fill('6');
  await page.getByRole('button', { name: '保存食材' }).click();
  await expect(page.getByRole('heading', { name: '鸡蛋' })).toBeVisible();
  await page.getByRole('link', { name: '返回饮食计划' }).click();
  // 计划周期改为自由天数：分别生成 1 天与 3 天
  for (const days of ['1', '3']) {
    await page.getByLabel('计划天数（1-30）').fill(days);
    await page.getByRole('button', { name: '生成演示计划' }).click();
    await page.getByRole('button', { name: '保存计划' }).click();
    await expect(page.getByRole('status').filter({ hasText: '计划已保存' })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole('button', { name: '查看计划' })).toHaveCount(2);
  await page.getByRole('navigation').getByRole('link', { name: '数据与设置' }).click();
  // 产品认为日常用不到，入口已移除
  await expect(page.getByRole('button', { name: '恢复菜谱库' })).toHaveCount(0);
  await page.getByLabel('字体大小').selectOption('large');
  await page.getByRole('button', { name: '保存偏好' }).click();
  await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  await page.reload();
  await expect(page.locator('html')).toHaveCSS('font-size', '18px');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出全部数据' }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath('complete-backup.json');
  await download.saveAs(backupPath);
  await page.getByRole('button', { name: '清空全部数据', exact: true }).click();
  // 现在使用应用内对话框，需要显式点确认
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '全部清空' }).click();
  await expect(page.getByRole('status')).toContainText('全部数据已清空');
  await page.getByLabel('导入备份', { exact: true }).setInputFiles(backupPath);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '覆盖并恢复' }).click();
  await expect(page.getByRole('status')).toContainText('备份恢复成功');
  await page.goto(recipeUrl);
  await expect(page.getByRole('heading', { name: '浏览器测试炒蛋' })).toBeVisible();
  expect(
    await page.getByAltText('浏览器测试炒蛋').evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await page
    .context()
    .route('**/*', (route) =>
      route.request().url().startsWith('http://localhost:4173') ? route.continue() : route.abort(),
    );
  await page.goto('/');
  // 日记里记的是刚烹饪的那道自建菜谱
  await expect(page.getByRole('link', { name: /浏览器测试炒蛋.*晚餐/ })).toBeVisible();
  // 首页的「今日推荐」会引用菜谱库的远程图片，离线被中断属于预期；只要求业务接口不外呼
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  const 外部接口请求 = external.filter((url) => !/\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url));
  expect(外部接口请求).toEqual([]);
  // 日记条目在首页可见（离线时只校验本地数据渲染）
  await expect(page.getByRole('link', { name: /浏览器测试炒蛋.*晚餐/ })).toBeVisible();
  await page.getByRole('link', { name: /浏览器测试炒蛋.*晚餐/ }).click();
  await expect(page.getByRole('heading', { name: '日记详情' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('异常与取消：无效图片/表单/备份、菜谱库副本、取消删除、未保存离开', async ({ page }) => {
  await page.goto('/utensils');
  await page.getByRole('button', { name: '添加厨具' }).click();
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('alert')).toContainText('名称');
  await page.getByLabel('厨具名称').fill('异常测试杯');
  await page.getByLabel('容量（ml）').fill('0');
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('alert')).toContainText('容量');
  await page
    .getByLabel('上传厨具照片')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert').filter({ hasText: '仅支持' })).toBeVisible();
  await page.getByLabel('容量（ml）').fill('200');
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('heading', { name: '异常测试杯' })).toBeVisible();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  // 删除确认已改为应用内对话框，点取消后条目仍在
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('heading', { name: '异常测试杯' })).toBeVisible();
  // 菜谱库菜谱：编辑时生成用户副本，不覆盖内置菜谱
  // 菜谱库升级到 structured-v4 后 id 有调整，这里用库里实际存在的一道
  await page.goto('/recipes/lib-3/edit');
  await expect(page.getByRole('heading', { name: '创建用户菜谱副本' })).toBeVisible();
  await page.getByLabel('菜名', { exact: true }).fill('菜谱库副本');
  await page.getByRole('navigation').getByRole('link', { name: '首页总览' }).click();
  // 未保存离开确认：选「留在本页」
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '留在本页' }).click();
  await expect(page.getByLabel('菜名', { exact: true })).toHaveValue('菜谱库副本');
  await page.getByRole('button', { name: '正式保存' }).click();
  await expect(page.getByRole('heading', { name: '菜谱库副本' })).toBeVisible();
  await page.goto('/recipes/lib-3');
  await expect(page.getByRole('heading', { name: '千张结烧肉' })).toBeVisible();
  await page.goto('/settings');
  await page
    .getByLabel('导入备份', { exact: true })
    .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByRole('alert')).toContainText('不是有效');
  await page.getByRole('button', { name: '清空全部数据', exact: true }).click();
  // 取消清空，数据应保持
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '取消' }).click();
  await page.goto('/utensils');
  await expect(page.getByRole('heading', { name: '异常测试杯' })).toBeVisible();
});
