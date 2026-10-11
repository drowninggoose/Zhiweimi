# 技术决策

2026-10-11：Node 24.19.0、npm 11.17.0；React 19、TypeScript 5.9、Vite 7、React Router 7、Dexie 4，具体安装版本见 package-lock.json。目标为桌面 Chrome/Edge。运行期间全部资源本地提供。

测试工具升级至 Vitest 5.0.3，修复初始 Vitest 3 依赖审计漏洞；Playwright 1.64 使用本机 Chrome 155.0.8059.40。Vite 保留工作区路径（preserveSymlinks），使受限 Windows 环境无需解析沙箱外真实路径即可构建。

IndexedDB 名称 zhiweimi，模式版本 1，版本升级在 database.ts 维护。图片 JPEG/PNG/WebP，原图最多 10 MB，最长边 1600px，WebP 品质 0.82，保存 Blob。备份为 .zhiweimi-backup.json，格式版本 1，图片转 Data URL。演示数据只初始化一次，恢复演示保留用户菜谱。

按阶段执行并测试；浏览器自动化验收与人工验收分别记录，不将模拟数据库测试称为真实浏览器重启测试。
