# 知味咪 Web App V0.1 开发计划

## 1. 计划目标

本计划用于把 `PRD.md` 转化为可以逐项执行、检查和验收的开发任务。目标是在不接入网络、云服务和真实AI的前提下，完成一个可在个人电脑浏览器中本地运行、数据可持久保存、核心流程完整的桌面端网页应用。

第一版完成后，用户应能够完成以下主流程：

```text
启动应用
→ 浏览推荐或搜索菜谱
→ 查看菜谱详情
→ 录入家用厨具
→ 查看模拟厨具换算
→ 分步骤烹饪
→ 保存美食日记
→ 制定模拟饮食计划
→ 导出和恢复全部本地数据
```

## 2. 实施原则

1. 先保证数据和业务流程正确，再完善视觉效果。
2. 先完成一条端到端主流程，再扩展全部模块。
3. 每个阶段都必须有可运行结果，不集中到最后联调。
4. 真实功能和模拟AI功能在代码、界面和测试中明确分开。
5. 所有业务数据统一通过数据访问层读写，页面不得直接操作 IndexedDB。
6. 用户上传图片统一存入 IndexedDB，不依赖本地绝对文件路径。
7. 删除、清空和覆盖恢复等高风险操作必须二次确认。
8. 每完成一个模块，立即按照 PRD 验收标准进行检查。

## 3. 推荐技术方案

### 3.1 技术栈

- 构建工具：Vite
- 前端框架：React
- 开发语言：TypeScript
- 页面路由：React Router
- 本地数据库：IndexedDB
- IndexedDB 封装：Dexie.js
- 少量界面偏好：localStorage
- 状态管理：优先使用 React Context 与自定义 Hooks；确有复杂共享状态时再引入 Zustand
- 样式：CSS Modules 或统一的全局 CSS 变量，不在第一版引入大型UI框架
- 图标：本地图标包或自制 SVG，运行时不得依赖网络CDN
- 测试：Vitest + React Testing Library
- 代码质量：ESLint + Prettier

### 3.2 选择理由

- React 适合页面模块多、表单多、状态交互多的应用。
- TypeScript 可以提前发现数据字段和函数参数错误。
- Dexie.js 能降低直接使用 IndexedDB 的复杂度。
- Vite 启动快，适合本地开发和最终本地运行。
- 所有依赖安装完成后，应用运行不需要联网。

### 3.3 本地运行方式

开发阶段：

```text
npm install
npm run dev
```

验收阶段：

```text
npm run build
npm run preview
```

最终提供 Windows 启动脚本，负责启动本地服务并打开浏览器。脚本不得删除、移动或覆盖用户数据。

## 4. 推荐项目目录

```text
知味咪/
├─ PRD.md
├─ DEVELOPMENT_PLAN.md
├─ README.md
├─ package.json
├─ vite.config.ts
├─ public/
│  ├─ app-icon.svg
│  └─ demo-images/
├─ src/
│  ├─ app/
│  │  ├─ App.tsx
│  │  ├─ router.tsx
│  │  └─ AppShell.tsx
│  ├─ assets/
│  │  ├─ mascot/
│  │  └─ illustrations/
│  ├─ components/
│  │  ├─ common/
│  │  ├─ recipe/
│  │  ├─ utensil/
│  │  ├─ diary/
│  │  └─ plan/
│  ├─ pages/
│  │  ├─ HomePage/
│  │  ├─ RecommendationsPage/
│  │  ├─ RecipesPage/
│  │  ├─ RecipeDetailPage/
│  │  ├─ RecipeEditorPage/
│  │  ├─ UtensilsPage/
│  │  ├─ CookingPage/
│  │  ├─ DiaryPage/
│  │  ├─ MealPlannerPage/
│  │  └─ SettingsPage/
│  ├─ db/
│  │  ├─ database.ts
│  │  ├─ schema.ts
│  │  ├─ repositories/
│  │  ├─ migrations/
│  │  └─ seed.ts
│  ├─ services/
│  │  ├─ recommendationMock.ts
│  │  ├─ conversionMock.ts
│  │  ├─ remedyMock.ts
│  │  ├─ mealPlanMock.ts
│  │  ├─ backupService.ts
│  │  └─ imageService.ts
│  ├─ hooks/
│  ├─ types/
│  ├─ utils/
│  ├─ styles/
│  │  ├─ tokens.css
│  │  ├─ global.css
│  │  └─ animations.css
│  └─ test/
├─ scripts/
│  └─ start-local.ps1
└─ docs/
   ├─ data-model.md
   ├─ test-checklist.md
   └─ decisions.md
```

## 5. 页面路由规划

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | 首页总览 | 默认入口，内含今日推荐（按时段推荐、换一批、卡片流） |
| `/recipes` | 菜谱总览 | 搜索、分类、筛选 |
| `/recipes/new` | 新建菜谱 | 创建用户菜谱 |
| `/recipes/:id` | 菜谱详情 | 查看、收藏、开始烹饪 |
| `/recipes/:id/edit` | 编辑菜谱 | 用户菜谱直接编辑；菜谱库菜谱创建副本 |
| `/utensils` | 家用厨具 | 厨具列表与新增编辑 |
| `/cook` | 开始烹饪 | 菜谱选择 |
| `/cook/:recipeId` | 烹饪准备 | 食材和模拟换算 |
| `/cook/:recipeId/steps` | 分步烹饪 | 一屏一步与计时器 |
| `/diary` | DIY美食日记 | 每行一天、早中晚餐盘 |
| `/planner` | 饮食计划助手 | 计划生成与查看 |
| `/planner/pantry` | 家庭食材 | 食材维护 |
| `/settings` | 数据与设置 | 偏好、统计、备份和恢复 |

## 6. 数据模型

所有数据对象必须包含稳定ID。日期统一存储为 ISO 8601 字符串；界面展示时再格式化。

### 6.1 Recipe 菜谱

```ts
type Recipe = {
  id: string;
  name: string;
  coverImage?: StoredImage;
  cuisines: string[];
  ingredientTags: string[];
  mealTypes: Array<'breakfast' | 'lunch' | 'dinner'>;
  flavorTags: string[];
  difficulty?: 'easy' | 'normal' | 'advanced';
  estimatedMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  notes?: string;
  sourceType: 'library' | 'user';
  status: 'draft' | 'published';
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
};
```

### 6.2 RecipeIngredient 食材项

```ts
type RecipeIngredient = {
  id: string;
  name: string;
  amount?: number;
  unit?: string;
  note?: string;
};
```

### 6.3 RecipeStep 烹饪步骤

```ts
type RecipeStep = {
  id: string;
  order: number;
  instruction: string;
  image?: StoredImage;
  timerSeconds?: number;
};
```

### 6.4 Utensil 厨具

```ts
type Utensil = {
  id: string;
  name: string;
  type: 'seasoning-spoon' | 'tablespoon' | 'bowl' | 'cup' | 'rice-cup' | 'other';
  image?: StoredImage;
  capacity: number;
  capacityUnit: 'ml';
  createdAt: string;
  updatedAt: string;
};
```

### 6.5 DiaryEntry 美食日记

```ts
type DiaryEntry = {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  dishName: string;
  image?: StoredImage;
  recipeId?: string;
  tasteRating?: string;
  notes?: string;
  adjustmentNotes?: string;
  createdAt: string;
  updatedAt: string;
};
```

同一天、同一餐次第一版最多保存一条日记。保存第二条时必须提示替换原记录或取消。

### 6.6 MealPlan 饮食计划

```ts
type MealPlan = {
  id: string;
  period: 'today' | 'week' | 'month';
  startDate: string;
  endDate: string;
  conditions: PlanConditions;
  days: Array<{
    date: string;
    breakfastRecipeId?: string;
    lunchRecipeId?: string;
    dinnerRecipeId?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};
```

### 6.7 PantryItem 家庭食材

```ts
type PantryItem = {
  id: string;
  name: string;
  category: string;
  quantity?: number;
  unit?: string;
  status: 'available' | 'used-up' | 'discarded';
  createdAt: string;
  updatedAt: string;
};
```

### 6.8 Preferences 设置

```ts
type Preferences = {
  id: 'current';
  flavorPreferences: string[];
  avoidIngredients: string[];
  defaultDifficulty?: string;
  theme: 'cream-orange-green';
  fontScale: 'small' | 'normal' | 'large';
  dataVersion: number;
};
```

### 6.9 StoredImage 图片

第一版建议保存压缩后的 Blob，并记录：

```ts
type StoredImage = {
  id: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  size: number;
};
```

上传时限制文件类型为 JPEG、PNG 或 WebP；单张原图建议不超过 10 MB；保存前压缩到最长边约 1600 像素，并设置合理质量，避免 IndexedDB 快速膨胀。

## 7. 模拟能力设计

### 7.1 模拟推荐

- 输入：餐次、用户偏好、忌口、已有食材、近期推荐记录。
- 输出：本地菜谱库ID列表。
- 第一版实现：过滤不符合条件的菜谱后随机排序。
- 界面标记：“演示推荐”。

### 7.2 模拟厨具换算

- 输入：食材数量、单位和厨具容量。
- 仅对 `ml` 或演示规则明确支持的数据进行换算。
- 优先选择结果最接近 0.25、0.5、1、1.5、2 等易操作份数的厨具。
- 无法换算时显示原始单位，不伪造结果。
- 界面标记：“模拟换算”。

### 7.3 模拟口味补救

- 为太咸、太淡、太辣、太甜、太酸、太油、太稀、太稠分别准备本地建议。
- 建议必须使用“少量调整、充分混合、再次试味”的保守表述。
- 界面标记：“模拟建议，不替代实际判断”。

### 7.4 模拟饮食计划

- 先过滤忌口和不符合难度、用时的菜谱。
- 开启“优先使用家庭食材”时，提高相关菜谱的排序权重。
- 尽量避免连续两餐或连续两天重复同一道菜。
- 菜谱不足时允许重复，但需显示提示。
- 界面标记：“演示计划”。

## 8. 开发阶段总览

建议按 15 个有效开发日安排。若团队成员较少，可以按阶段顺延，不应跳过验证。

| 阶段 | 建议时间 | 交付结果 |
|---|---:|---|
| 0. 准备和技术验证 | 1天 | 技术方案确认，本地存储和图片验证通过 |
| 1. 项目骨架与设计系统 | 1天 | 可运行外壳、路由、导航、主题变量 |
| 2. 数据层与菜谱库 | 2天 | IndexedDB、Repository、菜谱库导入 |
| 3. 菜谱核心 | 2天 | 菜谱总览、详情、新建编辑 |
| 4. 厨具模块 | 1天 | 厨具上传和CRUD |
| 5. 烹饪核心闭环 | 2天 | 准备、换算、步骤、计时、完成 |
| 6. 美食日记 | 1.5天 | 每行一天、早中晚餐盘与详情 |
| 7. 推荐、计划和食材 | 2天 | 推荐、家庭食材、今日/周/月计划 |
| 8. 首页整合 | 1天 | 首页摘要和跨模块跳转 |
| 9. 数据设置与备份 | 1.5天 | 设置、统计、导入导出恢复 |
| 10. 联调、测试和交付 | 1天 | 验收通过、README、启动脚本 |

## 9. 分阶段执行任务

## 阶段0：准备和技术验证

### 任务 0.1：确认开发环境

- 安装并记录 Node.js LTS 版本。
- 确认 npm 可用。
- 确认目标浏览器，第一版以当前最新版 Chrome 或 Edge 为准。
- 创建 Git 仓库和 `.gitignore`。

完成标准：

- `node --version` 和 `npm --version` 正常输出。
- Git 仓库可提交。

### 任务 0.2：完成三个技术小实验

建立临时验证页面，依次验证：

1. 向 IndexedDB 写入一条文本数据，刷新后仍存在。
2. 上传一张图片并保存 Blob，刷新后仍可显示。
3. 导出 JSON/备份文件并重新读取。

完成标准：三个实验全部通过后才进入正式页面开发。

### 任务 0.3：固定第一版技术决策

在 `docs/decisions.md` 记录：

- 技术栈版本。
- 浏览器支持范围。
- IndexedDB 库名称和版本。
- 图片压缩规则。
- 备份文件格式和扩展名。
- 菜谱库重新导入策略。

## 阶段1：项目骨架与设计系统

### 任务 1.1：初始化项目

- 创建 Vite + React + TypeScript 项目。
- 配置 ESLint、Prettier、Vitest。
- 增加 `dev`、`build`、`preview`、`test` 和 `lint` 命令。

### 任务 1.2：建立全局设计变量

定义：

- 奶油白、番茄橙、鼠尾草绿及文本颜色。
- 字号、行高、间距、圆角、阴影。
- 卡片、按钮、输入框、标签和弹窗的基础样式。
- 正常、悬停、聚焦、禁用和错误状态。

### 任务 1.3：完成应用外壳

- 固定左侧导航。
- 顶部显示页面标题和全局搜索。
- 创建七个页面的占位路由。
- 当前路由高亮。
- 顶部不出现设置按钮。

完成标准：七个页面可切换，无白屏和控制台错误。

## 阶段2：数据层与菜谱库

### 任务 2.1：建立数据库

- 创建 Dexie 数据库。
- 建立 recipes、utensils、diaryEntries、mealPlans、pantryItems、preferences、demoState 表。
- 建立数据库版本和迁移入口。

### 任务 2.2：建立 Repository 层

每类数据至少提供：

- `list`
- `getById`
- `create`
- `update`
- `delete`
- 该模块特有的查询函数

页面组件不得直接调用 Dexie 表。

### 任务 2.3：准备菜谱库数据

建议首批准备 12 至 18 道虚构菜谱，覆盖：

- 早餐、午餐、晚餐。
- 家常菜、川菜、粤菜、面食、汤羹、甜品等类别。
- 鸡蛋、番茄、土豆、鸡肉、猪肉、豆腐和蔬菜等常见食材。
- 简单、普通、进阶难度。
- 15分钟、30分钟和较长用时。

每道菜必须具备封面图、食材和至少3个步骤。演示图片放在项目本地，不使用远程链接。

### 任务 2.4：首次启动初始化

- 数据库为空时导入 517 道真实菜谱库和默认设置。
- 已存在用户数据时不得重复写入。
- 记录数据版本，支持菜谱库重新导入。

完成标准：刷新和重启后数据不重复、不丢失。

## 阶段3：菜谱核心

### 任务 3.1：菜谱总览

- 菜谱卡片。
- 菜名和食材搜索。
- 菜系分类。
- 食材多选分类。
- 餐次、口味、难度、用时筛选。
- 我的菜谱和收藏切换。
- 无结果状态与清除筛选。

### 任务 3.2：菜谱详情

- 大图、名称、标签、食材和步骤。
- 收藏切换。
- 开始烹饪。
- 编辑或创建副本。

### 任务 3.3：新建和编辑菜谱

- 菜名、封面、食材、步骤、步骤图片和备注。
- 食材与步骤的新增、删除、排序。
- 草稿和正式保存。
- 表单校验。
- 未保存离开提示。
- 菜谱库菜谱编辑时复制为用户菜谱。

完成标准：用户能够创建一份菜谱，刷新后仍存在，并可再次编辑和删除。

## 阶段4：家用厨具

### 任务 4.1：厨具列表

- 卡片展示照片、名称、类型和容量。
- 空状态引导添加。

### 任务 4.2：厨具新增与编辑

- 图片上传、预览、更换和删除。
- 名称、类型和容量校验。
- 容量必须大于0。
- 明确提示“当前版本需要手动确认容量”。

### 任务 4.3：厨具删除

- 二次确认。
- 删除后不能影响现有菜谱和日记。

完成标准：至少创建两件厨具并在刷新后正常显示。

## 阶段5：烹饪核心闭环

### 任务 5.1：菜谱选择

- 展示最近查看、已收藏和全部菜谱。
- 支持搜索。

### 任务 5.2：烹饪准备页

- 展示食材清单。
- 调用模拟换算服务。
- 默认使用全部厨具进行最佳匹配。
- 支持为单项食材临时切换厨具。
- 无可用换算时保留原始单位。

### 任务 5.3：分步烹饪

- 一屏一步。
- 显示步骤序号、说明和图片。
- 上一步和下一步。
- 计时器启动、暂停和重置。
- 离开页面自动保存进度，再次进入恢复。

### 任务 5.4：问题与补救

- 八种问题入口。
- 显示对应本地模拟建议。
- 明确标记模拟性质。

### 任务 5.5：完成页

- 上传成品照片。
- 选择味道评价。
- 填写心得。
- 仅完成或保存到日记。

完成标准：至少用一份菜谱库菜谱从选择走到日记保存，全程无断点。

## 阶段6：DIY美食日记

### 任务 6.1：日记总览

- 每一行对应一天。
- 每一行固定早餐、午餐、晚餐三列。
- 有记录显示圆盘裁剪图片和菜名。
- 无记录显示空盘子和“添加记录”。
- 默认最新日期在最上方。
- 支持日期或时间范围选择。

### 任务 6.2：新建日记

- 从空盘子进入时自动带入日期和餐次。
- 支持菜名、图片、关联菜谱、评价、心得和调整备注。
- 同日同餐已有记录时提示替换或取消。

### 任务 6.3：日记详情

- 查看、编辑、删除。
- 有关联菜谱时支持再次烹饪。

完成标准：建立两天的日记数据，验证有记录餐盘、空盘、详情和再次烹饪。

## 阶段7：推荐、饮食计划和家庭食材

### 任务 7.1：今日推荐

- 全部、早餐、午餐、晚餐筛选。
- 每次展示3至5条。
- 换一批。
- 收藏、详情和开始烹饪。
- 演示推荐标识。

### 任务 7.2：家庭食材

- 添加、编辑和查看。
- 标记已用完或不要了。
- 默认列表只显示现有食材。
- 支持按已有食材进入菜谱筛选。

### 任务 7.3：饮食计划条件

- 周期、口味、忌口、时间、难度和优先家庭食材。
- 校验至少存在可用于生成的正式菜谱。

### 任务 7.4：计划生成与展示

- 今日计划使用三餐卡片。
- 一周计划使用7天表格或日历。
- 一月计划使用月历，点击日期查看三餐。
- 支持替换某一餐、重新生成、保存和删除。
- 从菜品进入详情或开始烹饪。

完成标准：三种周期都能生成并保存；刷新后仍存在。

## 阶段8：首页整合

首页依赖前面模块的数据，不应最先开发业务内容。

### 任务 8.1：推荐摘要

- 展示3至5条演示推荐。
- 换一批和查看全部。

### 任务 8.2：开始烹饪窗口

- 最近查看。
- 收藏菜谱。
- 选择其他。
- 开始烹饪。
- 有未完成进度时显示“继续烹饪”。

### 任务 8.3：日记与计划摘要

- 展示最近日记餐盘。
- 展示今日早、中、晚计划。
- 没有数据时提供创建入口。

### 任务 8.4：快捷入口

- 新建菜谱。
- 添加厨具。
- 添加食材。
- 制定饮食计划。

完成标准：首页所有卡片均展示真实本地数据，并可正确跳转。

## 阶段9：数据与设置

### 任务 9.1：统计与偏好

- 展示五类业务数据数量。
- 修改并保存口味、忌口、难度、主题和字体大小。

### 任务 9.2：备份格式

建议备份文件结构：

```json
{
  "format": "zhiweimi-backup",
  "backupVersion": 1,
  "appVersion": "0.1.0",
  "exportedAt": "ISO_DATE",
  "data": {
    "recipes": [],
    "utensils": [],
    "diaryEntries": [],
    "mealPlans": [],
    "pantryItems": [],
    "preferences": {}
  }
}
```

图片可转换为 Data URL 后包含在备份中。导入完成后再转换回 Blob。

### 任务 9.3：导出

- 读取全部数据。
- 生成单一备份文件。
- 文件名包含日期。
- 导出后数据库不发生变化。

### 任务 9.4：导入

- 验证文件标识、版本和必要字段。
- 在临时内存中完整解析和校验。
- 校验成功后再请求覆盖确认。
- 使用事务写入。
- 任一步骤失败时回滚并保留原数据。

### 任务 9.5：清空与恢复菜谱库

- 分类别清空。
- 全部清空。
- 重新导入完整菜谱库。
- 每项均二次确认。

完成标准：导出备份、清空全部、重新导入后，数据和图片与导出前一致。

## 阶段10：联调、测试与交付

### 任务 10.1：自动化测试

至少覆盖：

- Repository 的增删改查。
- 菜谱搜索和筛选。
- 模拟换算选择厨具。
- 模拟计划避免直接重复。
- 日记日期与餐次映射。
- 备份校验与错误文件拒绝。

### 任务 10.2：人工验收

逐条执行 `PRD.md` 第18章的验收标准，并在 `docs/test-checklist.md` 记录：

- 测试日期。
- 浏览器版本。
- 操作步骤。
- 预期结果。
- 实际结果。
- 是否通过。
- 问题截图和修复记录。

### 任务 10.3：异常测试

必须测试：

- 空表单提交。
- 数量为负数或容量为0。
- 超大图片和不支持的文件格式。
- 删除正在引用的菜谱或厨具。
- 同一天同一餐次重复建立日记。
- 菜谱不足时生成一个月计划。
- 导入错误JSON、错误版本和缺少字段的备份。
- IndexedDB 写入失败时的错误提示。

### 任务 10.4：交付文件

- 完整源码。
- `README.md`。
- 本地启动脚本。
- 构建说明。
- 数据备份说明。
- 演示操作步骤。
- 已知问题清单。
- PRD 和开发计划。

## 10. 每日执行建议

| 开发日 | 当日目标 | 当天结束前必须可演示 |
|---:|---|---|
| 1 | 环境与技术验证 | IndexedDB文本、图片、导出实验 |
| 2 | 项目骨架 | 七个页面可导航 |
| 3 | 数据模型和Repository | 数据可增删改查 |
| 4 | 菜谱库和初始化 | 首次启动有内容，重复启动不重复 |
| 5 | 菜谱总览和筛选 | 可搜索、分类和收藏 |
| 6 | 详情和菜谱编辑 | 可创建并持久保存菜谱 |
| 7 | 厨具模块 | 可上传、编辑、删除厨具 |
| 8 | 烹饪准备与换算 | 可选择菜谱并看到模拟换算 |
| 9 | 分步烹饪与完成 | 可完整走到完成页 |
| 10 | 美食日记 | 每行一天、早中晚餐盘可用 |
| 11 | 今日推荐与家庭食材 | 推荐换一批，食材可维护 |
| 12 | 饮食计划 | 今日、周、月计划可生成 |
| 13 | 首页整合 | 所有摘要来自本地数据 |
| 14 | 设置与备份 | 可导出、清空和恢复 |
| 15 | 测试与交付 | PRD验收通过，启动说明完整 |

## 11. 团队分工建议

若团队有4人，可以如下分工：

### 成员A：页面框架与视觉

- 应用外壳、导航、设计变量和公共组件。
- 首页（含今日推荐）、卡片和弹窗样式。
- 吉祥物、图标和演示图片管理。

### 成员B：菜谱与烹饪

- 菜谱总览、详情和编辑器。
- 烹饪准备、模拟换算、步骤和计时器。
- 完成页与日记草稿传递。

### 成员C：日记与计划

- 美食日记。
- 家庭食材。
- 今日、一周和一月饮食计划。
- 模拟推荐与补救建议。

### 成员D：数据与质量

- IndexedDB 和 Repository。
- 图片处理。
- 数据与设置、备份和恢复。
- 自动化测试、人工验收和启动脚本。

团队少于4人时，按照阶段顺序串行执行；不要让多人同时修改数据库模型文件。所有数据结构变更必须先更新 `docs/data-model.md`。

## 12. Git协作规则

- 主分支保持可运行。
- 每个功能使用独立分支，例如 `feature/recipe-list`。
- 每次提交只解决一个明确问题。
- 提交信息示例：`feat: add utensil creation form`。
- 合并前至少执行 `npm run lint`、`npm run test` 和 `npm run build`。
- 不提交 `node_modules`、本地缓存、临时图片和个人备份文件。
- 用户数据和开发测试数据分开。
- API密钥不得写入代码；第一版原则上不需要任何密钥。

## 13. 阶段完成门槛

一个阶段只有同时满足以下条件才算完成：

1. 功能可以通过界面实际操作。
2. 刷新页面后数据结果符合预期。
3. 没有未处理的控制台错误。
4. 空状态、错误状态和正常状态均有展示。
5. 相关自动化测试或人工检查已执行。
6. 新增模拟能力具有明确标识。
7. 文档与实际实现一致。

## 14. 最终完成定义

V0.1 只有在以下条件全部满足时才视为完成：

- PRD 的21项必须实现功能全部可用。
- PRD 第18章验收标准逐条通过。
- 完成菜谱到日记的端到端演示。
- 今日、一周和一月计划均能生成并持久保存。
- 用户上传的图片刷新后仍存在。
- 导出、清空、导入后数据和图片能够完整恢复。
- 所有模拟AI内容都有明显标识。
- 断网状态下可以正常运行已安装的应用。
- `npm run build`、`npm run test` 和 `npm run lint` 通过。
- 新成员仅阅读 README、PRD 和本计划即可启动项目并完成一次演示。

## 15. 建议的首次开发任务

正式编码开始后，只执行以下三个任务，不同时铺开全部页面：

1. 初始化 React + TypeScript + Vite 项目和七个占位路由。
2. 验证 IndexedDB 能够持久保存文本和上传图片。
3. 建立 Recipe 数据结构，并展示菜谱库菜谱卡片。

这三个任务完成并验证后，再进入菜谱总览和其他模块开发。

