---
name: chinese-antique-typography
description: 给中式、古风、纸本类界面选中文标题字与正文搭配，控制书法字的使用密度，避免全站都在“写毛笔字”。
---

# 中文古风字体

## 选字

| 角色 | 字体 | 用法 |
| --- | --- | --- |
| 封面 / 主视觉 | Ma Shan Zheng（马善政毛笔楷书） | 只给一个页面最大的那一句，最多 8–12 字 |
| 页面标题 / 卡片标题 | ZCOOL XiaoWei（站酷小薇） | h1、h2、按钮、印章旁的小标题 |
| 正文 / 表单 / 表格 | Microsoft YaHei / PingFang SC | 保持可读性，不参与古风表演 |
| 数字 / 英文 | Georgia 或正文无衬线 | 与中文标题形成粗细对比 |

## 三条硬规则

1. **一屏只允许一种书法字做主角。** 封面用 Ma Shan Zheng，页面内标题用 ZCOOL XiaoWei；不要把两种书法字叠在同一屏。
2. **书法字不排长段落。** 超过 14 个字就换回正文体，否则阅读速度会明显下降。
3. **标题越大，字距越松。** 大标题 `letter-spacing: 0.02em–0.08em`，小标题 `0.08em–0.16em`；正文保持 0。

## 本项目的 token

```css
--font-display: 'Ma Shan Zheng', 'FZShuTi', 'STKaiti', serif;
--font-title: 'ZCOOL XiaoWei', 'Noto Serif SC', 'STKaiti', serif;
--font-body: 'Microsoft YaHei', 'PingFang SC', sans-serif;
```

标题字重只用 400。需要强调时加字号、加字距、加印章色，不要加粗。

## 自检

- 首屏是否能一眼看出“这是一本食谱本”，而不是“所有字都换了字体”？
- 正文是否仍然像正文，而不是书法作品？
- 英文与数字是否有一个安静的、非书法的对照字体？
