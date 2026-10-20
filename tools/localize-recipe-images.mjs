import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const libraryPath = join(process.cwd(), 'public', 'recipes-library.json');
const imageDir = join(process.cwd(), 'public', 'recipe-images');
const reportPath = join(process.cwd(), 'docs', 'recipe-image-localization-report.json');
const library = JSON.parse(await readFile(libraryPath, 'utf8'));
const run = promisify(execFile);
const proxy = process.env.RECIPE_IMAGE_PROXY;

await mkdir(imageDir, { recursive: true });
await mkdir(join(process.cwd(), 'docs'), { recursive: true });

const extensionByType = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function extensionFor(url, contentType) {
  const normalizedType = contentType.split(';')[0].trim().toLowerCase();
  if (extensionByType[normalizedType]) return extensionByType[normalizedType];
  const extension = extname(new URL(url).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension) ? extension : '.jpg';
}

async function download(recipe) {
  const candidates = [recipe.coverUrl, recipe.coverUrl.replace(/\?.*$/, '')];
  let lastError;
  for (const url of [...new Set(candidates)]) {
    try {
      if (proxy) {
        const fileName = `${safeName(recipe.id)}.jpg`;
        const outputPath = join(imageDir, fileName);
        const temporaryPath = `${outputPath}.download`;
        await rm(temporaryPath, { force: true });
        await run(
          'curl.exe',
          [
            '--fail-with-body',
            '--location',
            '--max-time',
            '30',
            '--retry',
            '2',
            '--proxy',
            proxy,
            '--referer',
            recipe.sourceUrl ?? 'https://home.meishichina.com/',
            '--user-agent',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36',
            '--output',
            temporaryPath,
            url,
          ],
          { windowsHide: true },
        );
        const bytes = await readFile(temporaryPath);
        if (bytes.length < 256 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
          await rm(temporaryPath, { force: true });
          throw new Error(`下载内容不是有效 JPEG：${bytes.length} bytes`);
        }
        await rename(temporaryPath, outputPath);
        return { localUrl: `/recipe-images/${fileName}`, bytes: bytes.length };
      }
      const response = await fetch(url, {
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          Referer: recipe.sourceUrl ?? 'https://home.meishichina.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141 Safari/537.36',
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.toLowerCase().startsWith('image/')) {
        throw new Error(`响应不是图片：${contentType || '未知类型'}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 256) throw new Error(`图片文件过小：${bytes.length} bytes`);
      const fileName = `${safeName(recipe.id)}${extensionFor(url, contentType)}`;
      await writeFile(join(imageDir, fileName), bytes);
      return { localUrl: `/recipe-images/${fileName}`, bytes: bytes.length };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const targets = library.recipes.filter((recipe) => /^https?:\/\//.test(recipe.coverUrl ?? ''));
const localized = [];
const failed = [];

for (const [index, recipe] of targets.entries()) {
  try {
    const originalUrl = recipe.coverUrl;
    const result = await download(recipe);
    recipe.coverUrl = result.localUrl;
    localized.push({ id: recipe.id, name: recipe.name, originalUrl, ...result });
    globalThis.console.log(`[${index + 1}/${targets.length}] 已保存 ${recipe.name}`);
  } catch (error) {
    failed.push({
      id: recipe.id,
      name: recipe.name,
      url: recipe.coverUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    globalThis.console.error(`[${index + 1}/${targets.length}] 下载失败 ${recipe.name}`);
  }
}

await writeFile(libraryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: targets.length,
      localized: localized.length,
      failed: failed.length,
      localizedRecipes: localized,
      failedRecipes: failed,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

globalThis.console.log(`完成：成功 ${localized.length}，失败 ${failed.length}`);
if (failed.length > 0) process.exitCode = 1;
