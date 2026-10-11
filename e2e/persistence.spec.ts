import { test, expect, chromium } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { demoRecipes, defaultPreferences } from '../src/db/seed';
import { stamp, today, type DataSnapshot } from '../src/types/models';
import { exportBackup } from '../src/services/backupService';
import { png } from './fixtures';
test('浏览器关闭重开与本地服务重启：五类记录和Blob照片保持', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  test.setTimeout(90000);
  const address = 'http://localhost:4174';
  let server: ChildProcess | undefined;
  async function startServer() {
    server = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        'preview',
        '--host',
        'localhost',
        '--port',
        '4174',
        '--strictPort',
      ],
      { cwd: process.cwd(), stdio: 'ignore', windowsHide: true },
    );
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error('持久化验收服务启动失败');
      try {
        const result = await fetch(address);
        if (result.ok) return;
      } catch {
        // The server may not be listening yet; retry until the bounded readiness deadline.
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
  const imageBlob = new Blob([new Uint8Array(png)], { type: 'image/png' });
  const image = {
    id: 'persistent-image',
    blob: imageBlob,
    mimeType: 'image/png',
    width: 32,
    height: 24,
    size: imageBlob.size,
  };
  const recipe = {
    ...demoRecipes()[0],
    ...stamp(),
    name: '重启持久化菜谱',
    sourceType: 'user' as const,
    coverImage: image,
    coverUrl: undefined,
  };
  const snapshot: DataSnapshot = {
    recipes: [...demoRecipes(), recipe],
    utensils: [
      { ...stamp(), name: '持久化杯', type: 'cup', capacity: 200, capacityUnit: 'ml', image },
    ],
    diaryEntries: [
      {
        ...stamp(),
        date: today(),
        mealType: 'dinner',
        dishName: '持久化日记',
        recipeId: recipe.id,
        image,
      },
    ],
    mealPlans: [
      {
        ...stamp(),
        period: 'today',
        startDate: today(),
        endDate: today(),
        conditions: { flavors: [], avoidIngredients: [], preferPantry: false },
        days: [
          {
            date: today(),
            breakfastRecipeId: recipe.id,
            lunchRecipeId: recipe.id,
            dinnerRecipeId: recipe.id,
          },
        ],
      },
    ],
    pantryItems: [{ ...stamp(), name: '持久化番茄', category: '蔬菜', status: 'available' }],
    preferences: defaultPreferences,
    demoState: { id: 'current', version: 1, recentRecipeIds: [], recentRecommendationIds: [] },
  };
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
    page.on('dialog', (d) => d.accept());
    await page.goto(`${address}/settings`);
    await page.getByLabel('导入备份', { exact: true }).setInputFiles({
      name: 'persistent.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await exportBackup(snapshot)),
    });
    await expect(page.getByRole('status')).toContainText('备份恢复成功');
    await context.close();
    context = undefined;
    await stopServer();
    await startServer();
    context = await launch();
    page = context.pages()[0];
    await page.goto(`${address}/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: '重启持久化菜谱' })).toBeVisible();
    expect(
      await page
        .getByAltText('重启持久化菜谱')
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    ).toBe(32);
    await page.goto(`${address}/utensils`);
    await expect(page.getByRole('heading', { name: '持久化杯' })).toBeVisible();
    await page.goto(`${address}/diary`);
    await expect(page.getByRole('button', { name: /查看持久化日记/ })).toBeVisible();
    await page.goto(`${address}/planner`);
    await expect(page.getByRole('button', { name: '查看计划' })).toHaveCount(1);
    await page.goto(`${address}/planner/pantry`);
    await expect(page.getByRole('heading', { name: '持久化番茄' })).toBeVisible();
  } finally {
    await context?.close();
    await stopServer();
  }
});
