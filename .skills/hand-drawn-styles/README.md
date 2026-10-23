# hand-drawn-styles

一套工具无关的手绘画风提示词配方，包含 20 种整数编号画风和 3.1 变体，共 21 套。适用于能读取自定义指令的 AI Agent。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 这是什么

本项目负责选择画风、填入内容、处理比例，并输出完整 prompt 或带参考图和工作流的正式 JSON 调用包。**普通使用只输出提示词或调用包，不生图。** 图像执行由支持相应参考图和流程的调用端完成。

配方只有 [STYLES.md](STYLES.md) 一份真源，渲染器原样提取；选型说明帮助判断用途，不覆盖配方。工程检查通过、视觉审核通过和用户认可分别记录，不能互相替代。

## 内置画风

先看 [有来源的选型说明](docs/style-selection.md)，或查询全部画风：

```bash
python3 -B scripts/render_prompt.py --catalog
```

结果包含适用任务、识别差异、限制、相近画风及证据范围。查询只读本地文本，无需图片缓存；必须单独使用，不能与生成参数混用。原菜单与参数查询保持不变：

```bash
python3 -B scripts/render_prompt.py --list
```

| 入口 | 解决的问题 |
| --- | --- |
| [选型说明](docs/style-selection.md) | 根据用途缩小候选，区分编辑建议与配方约束 |
| [三组差异与三个失败案例](docs/style-comparison.md) | 为什么 14/18、3.1/20、19/20 不能只换颜色套用 |
| [全部编号样例](examples/README.md) | 按编号查看既有展示和输入示例 |
| [完整协议](PROTOCOL.md) | 明确编号、自然语言映射、参数和生产要求 |

以下复用既有展示，不是同题实验，也不表示本轮重新生图或完成视觉验收：

| 14 北欧绘本水粉 | 18 暖色扁平绘本 | 20 暖黄墨线 |
| :--: | :--: | :--: |
| <img src="https://gentle-starburst-99bd99.netlify.app/hand-drawn/examples/14-nordic-storybook.png" width="220"> | <img src="https://gentle-starburst-99bd99.netlify.app/hand-drawn/examples/18-warm-flat-storybook.png" width="220"> | <img src="https://gentle-starburst-99bd99.netlify.app/hand-drawn/assets/style-20/anchor-warm-yellow-ink-story.png" width="220"> |

样例页保留各编号与历史隐私状态说明。更多画风见 [全部样例](examples/README.md)；本次整理不承诺远端图片可用性已重新验证。

## 用法要点

### 不指定画风 → 列菜单让你选

用途和视觉意图足够明确时，Agent 提供 2–3 个候选，说明匹配理由和重要限制，等待你选择；信息不足时展示完整菜单。不会替你选，也不会编造匹配分数。

例如“用图解释三个工作步骤，风格没想好”可先比较 1 的细线网格与 4 的黑豆人竖向分格。完整风景与单动作白底等需求发生冲突时，先说明取舍，不静默删改配方。五个情境演练见 [选型说明](docs/style-selection.md)。

### 显式指定 → 中文名 / 编号 / 英文别名,任一即可

```text
用吉卜力风画一只在下雨天打伞的猫
用 3 号画风画一只在下雨天打伞的猫
用 ghibli 画一只在下雨天打伞的猫
```

指定编号、名称、已登记别名时直接采用；“家庭蜡笔画”“亲子手绘”等已有自然语言映射直接采用 3.1，不重新要求选择。

### 出图比例(不硬锁)

传入比例时使用你的比例。不传时，纯风格不注入数字比例；1 和 4 只保留网格或竖向堆叠等软版式。

### 占位符自动推断

Agent 根据内容填写主体、动作、标题词、主色调或分镜等参数，脚本用 `--var 名称=内容` 接收其余占位符。可选胡茬可用 `--var '胡茬='` 删空；用户文案中的 `【短句】` 按原文保留。所有必需参数见 `--list`，不要把新的画风规则塞进主体或文案。

普通 prompt 示例：

```bash
python3 -B scripts/render_prompt.py \
  --style ink-wash \
  --subject '一只鸟停在细枝上'
```

### 稳定生产调用(推荐)

3.1、19、20 默认返回正式 JSON，调用端须完整消费参考图和合同：

```bash
python3 -B scripts/render_prompt.py \
  --style 3.1 \
  --subject '爸爸把零食袋放回柜子,男孩站在旁边看着' \
  --text '不加任何文字' \
  --aspect 3:4 \
  --format json
```

3.1 的无字页使用上述文字参数；标题使用独立 `--title '准确标题原文'`。v4 的记录、验收命令和迁移方式见 [3.1 验收说明](docs/style-3.1-review.md)。

```bash
python3 -B scripts/render_prompt.py \
  --style roundhead-redline \
  --subject 'a small elephant calf lifting one coral-red paper lantern with its trunk' \
  --aspect 3:4 \
  --format json

python3 -B scripts/render_prompt.py \
  --style warm-yellow-ink-story \
  --subject 'a grandmother and child repairing one mustard-yellow kite together' \
  --aspect 3:4 \
  --format json
```

以上命令只渲染调用包，不执行图像模型。正式参考图首次使用需要下载并通过文件与像素校验；有效缓存可离线复用。

## 安装 Skill

[下载已发布的轻量包](https://github.com/threerocks/hand-drawn-styles/releases/latest/download/hand-drawn-skill.zip)，解压后保留 `hand-drawn/` 完整目录，并执行 `python3 -B scripts/check_skill.py`。发布包校验文件见 [SHA256SUMS](https://github.com/threerocks/hand-drawn-styles/releases/latest/download/SHA256SUMS)，详细安装方式见 [INSTALL.md](INSTALL.md)。

Release 对应已发布版本；源码的新变更须本地构建，构建成功不会自动发布 Release。轻量包含全部配方、运行脚本、选型与验收说明、图片清单，不含 Git 历史、展示图库或整套研发材料。运行图片保存在独立缓存，不进入包内。

## 接入各 Agent 工具

| 工具 | 接入方式 |
| --- | --- |
| Claude Code | 将完整 `hand-drawn/` 放入 `~/.claude/skills/` |
| Codex | 将完整 `hand-drawn/` 放入 `~/.codex/skills/` |
| Cursor / Gemini CLI / Jules | 保留完整安装目录，让项目规则指向其中的 `AGENTS.md` 和 `PROTOCOL.md` |
| Cline / Windsurf / Continue | 将 rules / custom instructions 指向完整安装目录中的协议与配方 |
| 直接对话 | 普通文本配方可复制；需要锚点的正式调用须保留参考图及完整调用包 |

从源码安装可浅克隆，避免下载 Git 历史中的旧图片：

```bash
git clone --depth 1 https://github.com/threerocks/hand-drawn-styles.git
python3 -B hand-drawn-styles/scripts/check_skill.py
```

## 生产限制

| 画风 | 候选与放行条件 |
| --- | --- |
| 3.1 | `family-crayon-card-v4`：基础生成加两次递进编辑，第三次只得到 `final-candidate`；独立验收核对阶段证据和八项视觉审核，报告 pass 才可成为 final |
| 19 | 原创锚点、模型快照与高保真参考输入；基础图为 `candidate-only`，按既有七项审核及硬失败条件放行 |
| 20 | 原创锚点直接生成 `final-candidate`，运行既有验收器，核对像素指标、内容锁、八项评分和硬失败条件；失败候选拒收，不以通用风格编辑修补 |

19 和 20 的精确模型快照与能力要求以正式调用包为准；实际通道不能满足时停止正式生产，不能从产品名称推断快照或把其他模型结果冒充正式验证。图片、流程或审核证据缺失时，不能绕过对应合同。

验收脚本检查文件、记录与审核声明，不证明模型确实使用了声明的输入，也不代替实际看图。3.1 历史三阶段样图仍为内部通过、待用户复核；合同升级没有把它们改为用户认可。详细历史边界见 [失败案例](docs/style-comparison.md)。

业务项目只提供内容、准确文字、比例和可选角色参考，不维护第二套线条、五官、色板或纸面规则。3.1/19/20 的纯文本仅允许显式 `--text-only-preview` 的非生产预览。

### 维护者构建与验收

Python 3.10 或更高版本即可运行，无第三方 Python 依赖。首次准备缓存需要网络；缓存已有时可跳过下载：

```bash
python3 -B scripts/hosted_images.py fetch
python3 -B -m unittest discover -s scripts -p 'test_*.py'
python3 -B scripts/check_skill.py
python3 -B scripts/build_skill_package.py
```

构建脚本在独立目录解压并验证全部画风，成功才标为 `verified`。默认产物为 `dist/hand-drawn-skill.zip`，上限 1 MiB；`--skip-verify` 只能得到候选包。`PACKAGE-MANIFEST.json` 登记运行文件摘要，`assets/image-manifest.json` 登记图片地址、大小和 SHA-256。

用 `HAND_DRAWN_IMAGE_CACHE` 指定图片缓存，`HAND_DRAWN_OFFLINE=1` 使用已校验缓存离线运行。新图片入库须依次完成隐私清理、登记、完整站点部署和匿名下载校验，见 [图片托管规则](docs/image-hosting.md)。部署和公开发布需要相应授权。

[小规模同题实验](docs/style-comparison.md) 已定义 12 次候选尝试、最多 20 次图像调用的首批预算，**当前未执行**。工程检查或历史精选图不能代替该实验结果。

## 设计原则

- 配方从唯一真源原样渲染，选型说明不变成新的生成规则。
- 保留各画风的材料、形体、色板和版式差异；1/4 的多格版式与 19/20 的单动作表达不混用。
- 样例登记、内部审核、用户认可分别记载；没有可靠记录就写明。
- 保留历史来源与编号迁移说明，不用目录名猜当前画风身份。

## 目录结构

```text
hand-drawn-styles/
├── PROTOCOL.md        # 选择、参数与输出协议
├── STYLES.md          # 21 套配方的唯一真源
├── SKILL.md           # Skill 入口
├── AGENTS.md          # 跨工具入口
├── INSTALL.md         # 安装与检查说明
├── catalog/           # 有来源的选型数据
├── assets/            # 图片清单与既有隐私审计
├── docs/              # 选型、对照、验收与托管说明
├── scripts/           # 渲染、验收、安装、打包与测试
├── examples/          # 全部编号样例，不进入轻量包
└── benchmarks/        # 历史研发记录，不进入轻量包
```

## 贡献新画风

按 [AGENTS.md](AGENTS.md) 的维护者验证规则准备固定参考、同构与跨主体场景、判定依据和可复核候选。新增或删除画风须同步配方、选型数据与安装检查；新增图片还须遵循托管规则。不要只凭单张满意图宣称画风已稳定。

## License

[MIT](LICENSE) © liulei
