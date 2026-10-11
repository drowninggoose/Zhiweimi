# 知味咪 V0.1

本地桌面网页烹饪助手。菜谱、家用厨具、烹饪日记、家庭食材和饮食计划保存在浏览器 IndexedDB，上传图片压缩为 Blob。推荐、换算、补救和计划由本地规则演示。

## 启动

需要 Windows、Node.js 24 LTS 与最新版 Chrome/Edge。首次安装依赖需要网络，安装后运行无网络依赖。

```powershell
npm install
npm run build
npm run preview -- --host localhost --port 4173 --strictPort
```

打开 http://localhost:4173。也可双击 `start-local.cmd`；启动脚本先构建，再启动隐藏的本地服务并打开浏览器。重复启动复用同一地址，不清理或移动用户数据。已有构建可运行 `powershell -File scripts/start-local.ps1 -SkipBuild`。`-NoBrowser` 用于检查服务启动。

开发运行 `npm run dev`。开发地址与验收地址的浏览器数据分开，因此长期使用请固定 `http://localhost:4173`，不要混用 127.0.0.1、不同端口或不同浏览器。正常刷新、关闭浏览器和重启服务不会清空数据。

## 演示流程

1. 首页浏览“演示推荐”，或菜谱总览搜索番茄/鸡蛋并组合筛选。
2. 查看菜谱，收藏；编辑演示菜谱会建立用户副本。也可新建菜谱，添加图片、食材与步骤，草稿或正式保存。
3. 家用厨具添加杯子和勺子，上传照片并手动确认毫升容量。
4. 开始烹饪选择菜谱，查看“模拟换算”，进入一屏一步，使用计时器和八种“模拟建议”。退出后进度不保存。
5. 完成后上传照片、评价与心得，保存日记。日记按日期和早中晚餐盘展示，可编辑或再次烹饪。
6. 家庭食材添加现有食材；计划助手生成今日、一周、一个月计划，单餐替换并保存。
7. 数据与设置调整偏好、主题和字号，导出备份；确认清空后导入恢复。

## 数据备份

“导出全部数据”生成 `知味咪-日期.zhiweimi-backup.json`，包含全部结构化数据、图片、偏好和演示状态。导出不改变数据。导入完整校验格式、版本、类型、引用和图片后才要求覆盖确认；数据库事务失败回滚。无效文件显示原因。

清空用户菜谱会保留演示菜谱，并清除关联日记和计划的菜谱引用，保留日记文字与图片。恢复初始演示数据只重置演示菜谱与最近记录，不覆盖用户菜谱及其他业务数据。全部清空后不会自动重新填充演示菜谱，可手动恢复。

浏览器“清除站点数据”、隐私模式或更换浏览器不能保留原数据库。定期把导出文件保存到自己的备份目录。

## 测试与构建

```powershell
npm test
npm run test:e2e
npm run test:all
npm run lint
npm run build
```

真实浏览器测试使用本机 Chrome（路径见 playwright.config.ts），自动启动生产预览服务，需要先构建且 4173 端口空闲。测试使用独立浏览器配置，与个人应用数据隔离。测试失败截图、trace 和报告位于 test-results/ 与 playwright-report/。PRD 验收映射、实际执行记录和已知限制见 docs/test-checklist.md 与 docs/known-issues.md。

技术与模型说明见 docs/decisions.md、docs/data-model.md。完整需求见 PRD.md 和 DEVELOPMENT_PLAN.md。
