import { test, expect, chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';

/**
 * 浏览器关闭重开 + 本地服务重启后，本地数据仍然在。
 *
 * 这一版没有「导入备份」入口，所以数据全部通过界面创建，
 * 验证的是 IndexedDB 在真实 Chrome 里跨进程持久化。
 */
test('浏览器关闭重开与本地服务重启：菜谱、厨具、食材都还在', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(180000);

  const address = 'http://localhost:4174';
  let server: ChildProcess | undefined;

  async function startServer() {
    server = spawn(
      process.execPath,
      ['node_modules/vite/bin/vite.js', 'preview', '--host', 'localhost', '--port', '4174', '--strictPort'],
      { cwd: process.cwd(), stdio: 'ignore', windowsHide: true },
    );
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error('持久化验收服务启动失败');
      try {
        const result = await fetch(address);
        if (result.ok) return;
      } catch {
        // 服务还没监听，继续等
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('持久化验收服务未就绪');
  }

  async function stopServer() {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
    server = undefined;
  }

  const profile = testInfo.outputPath('persistent-browser');
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true,
      viewport: { width: 1440, height: 1000 },
    });

  let context: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    await startServer();
    context = await launch();
    let page = context.pages()[0];
    page.on('dialog', (dialog) => dialog.accept());
    // 开场页只在自动化浏览器里跳过；这里手动标记为已进入，避免挡住后续断言
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem('zhiweimi:entered:v1', '1');
      } catch {
        /* 忽略 */
      }
    });
    await page.goto(`${address}/`);
    await page.waitForTimeout(1500);

    // 1) 建一道菜谱
    await page.goto(`${address}/recipes/new`);
    await page.getByLabel('菜名', { exact: true }).fill('重启持久化菜谱');
    await page.getByLabel('食材1', { exact: true }).fill('鸡蛋');
    await page.getByLabel('步骤1', { exact: true }).fill('打散后炒熟');
    await page.getByRole('button', { name: '正式保存' }).click();
    await expect(page.getByRole('heading', { name: '重启持久化菜谱' })).toBeVisible();

    // 2) 加一件厨具
    await page.goto(`${address}/utensils`);
    await page.getByRole('button', { name: '添加厨具' }).click();
    await page.getByLabel('厨具名称').fill('持久化杯');
    await page.getByLabel('容量（ml）').fill('200');
    await page.getByRole('button', { name: '保存厨具' }).click();
    await expect(page.getByRole('heading', { name: '持久化杯' })).toBeVisible();

    // 3) 记一样食材
    await page.goto(`${address}/planner/pantry`);
    await page.getByRole('button', { name: '添加食材' }).click();
    await page.getByLabel('食材名称').fill('持久化番茄');
    await page.getByLabel('数量', { exact: true }).fill('2');
    await page.getByRole('button', { name: '保存食材' }).click();
    await expect(page.getByRole('heading', { name: '持久化番茄' })).toBeVisible();

    // 关闭浏览器 + 重启本地服务
    await context.close();
    context = undefined;
    await stopServer();
    await startServer();

    context = await launch();
    page = context.pages()[0];
    await page.addInitScript(() => {
      try {
        window.sessionStorage.setItem('zhiweimi:entered:v1', '1');
      } catch {
        /* 忽略 */
      }
    });

    await page.goto(`${address}/recipes`);
    await expect(page.getByText('重启持久化菜谱')).toBeVisible();
    await page.goto(`${address}/utensils`);
    await expect(page.getByRole('heading', { name: '持久化杯' })).toBeVisible();
    await page.goto(`${address}/planner/pantry`);
    await expect(page.getByRole('heading', { name: '持久化番茄' })).toBeVisible();
  } finally {
    await context?.close();
    await stopServer();
  }
});
