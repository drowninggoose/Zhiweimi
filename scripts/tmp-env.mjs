/**
 * 构建/测试专用的临时目录引导。
 *
 * 背景：esbuild 会把待转译的代码写进系统临时目录再删除。在部分 Windows
 * 环境（安全软件实时扫描、或终端本身跑在受限沙箱里）这个删除会被拒绝，
 * 表现为 `[vite:esbuild-transpile] remove C:\...\Temp\esbuild-...: Access is denied`。
 *
 * 处理：在 Vite / Vitest 加载之前，把 TMP/TEMP/TMPDIR 指到项目内的 .tmp，
 * 让 esbuild 的中间文件落在工作区里，不依赖系统临时目录的权限。
 * 必须在 import 阶段执行，早于任何 esbuild 调用。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), '.tmp');
mkdirSync(dir, { recursive: true });
process.env.TMP = dir;
process.env.TEMP = dir;
process.env.TMPDIR = dir;
