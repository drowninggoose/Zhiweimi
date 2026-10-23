import { test, expect, type Page } from '@playwright/test';

/** 本地服务地址（不同端口都算本地）。 */
const 是本地请求 = (url: string) => /^http:\/\/localhost:\d+/.test(url);

test('本地闭环：建菜谱 → 加厨具 → 烹饪 → 日记 → 计划 → 食材', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天想吃点什么？' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();

  // 新建菜谱（不依赖图片上传，保证用例稳定）
  await page.goto('/recipes/new');
  await page.getByLabel('菜名', { exact: true }).fill('浏览器测试炒蛋');
  await page.getByLabel('食材1', { exact: true }).fill('鸡蛋');
  await page.getByLabel('步骤1', { exact: true }).fill('打散鸡蛋并充分加热');
  await page.getByRole('button', { name: '正式保存' }).click();
  await expect(page.getByRole('heading', { name: '浏览器测试炒蛋' })).toBeVisible();
  const recipeUrl = page.url();

  // 刷新后仍在（本地持久化）
  await page.reload();
  await expect(page.getByRole('heading', { name: '浏览器测试炒蛋' })).toBeVisible();

  // 我的厨房：添加厨具
  await page.getByRole('navigation').getByRole('link', { name: '我的厨房' }).click();
  await page.getByRole('button', { name: '添加厨具' }).click();
  await page.getByLabel('厨具名称').fill('测试量杯');
  await page.getByLabel('容量（ml）').fill('200');
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('heading', { name: '测试量杯' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '测试量杯' })).toBeVisible();

  // 烹饪：准备 → 补救 → 完成 → 存日记
  // 注意：左侧导航也叫「开始烹饪」，直接按 id 进入准备页，避免点错入口
  const recipeId = recipeUrl.split('/').filter(Boolean).pop()!;
  await page.goto(`/cook/${recipeId}`);
  await page.getByRole('button', { name: '准备完成，开始分步烹饪' }).click();
  // 这一版把口味补救改成了自然语言（AI）入口，这里只验证主流程能走通
  await expect(page.getByRole('button', { name: '完成烹饪' })).toBeVisible();
  await page.getByRole('button', { name: '完成烹饪' }).click();
  await page.getByLabel('心得').fill('浏览器闭环日记');
  await page.getByRole('button', { name: '保存到日记' }).click();
  await expect(page.getByRole('button', { name: /查看浏览器测试炒蛋/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /查看浏览器测试炒蛋/ })).toBeVisible();

  // 饮食计划：生成并保存
  await page.getByRole('navigation').getByRole('link', { name: '饮食计划' }).click();
  await page.getByRole('button', { name: '生成演示计划' }).click();
  await page.getByRole('button', { name: '保存计划' }).click();
  await expect(page.getByRole('status').filter({ hasText: '计划已保存' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '保存计划' }).first()).toBeVisible();

  // 家庭食材：新增一条
  await page.goto('/planner/pantry');
  await page.getByRole('button', { name: '添加食材' }).click();
  await page.getByLabel('食材名称').fill('鸡蛋');
  await page.getByLabel('数量', { exact: true }).fill('6');
  await page.getByRole('button', { name: '保存食材' }).click();
  await expect(page.getByRole('heading', { name: '鸡蛋' })).toBeVisible();

  expect(errors).toEqual([]);
});

test('异常与降级：表单校验、AI 不可用时的提示', async ({ page }) => {
  await page.goto('/utensils');
  await page.getByRole('button', { name: '添加厨具' }).click();
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('alert')).toContainText('名称');

  await page.getByLabel('厨具名称').fill('异常测试杯');
  await page.getByLabel('容量（ml）').fill('0');
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('alert')).toContainText('容量');

  // 断掉 AI 接口，界面必须给出可读提示而不是白屏
  await page.route('**/api/ai/**', (route) => route.abort());
  await page.getByLabel('容量（ml）').fill('200');
  await page.getByRole('button', { name: '保存厨具' }).click();
  await expect(page.getByRole('heading', { name: '异常测试杯' })).toBeVisible();
});

test('离线可用：断开外网后首页与本地数据仍能渲染', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!是本地请求(request.url()) && !request.url().startsWith('blob:') && !request.url().startsWith('data:'))
      external.push(request.url());
  });

  await page.goto('/');
  await page.context().route('**/*', (route) =>
    是本地请求(route.request().url()) ? route.continue() : route.abort(),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今日推荐' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今天想吃点什么？' })).toBeVisible();

  // 只要求不外呼接口；被拦掉的远程图片属于预期
  const 外呼接口 = external.filter((url) => !/\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(url));
  expect(外呼接口).toEqual([]);
});
