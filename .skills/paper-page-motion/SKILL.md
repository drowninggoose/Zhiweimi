---
name: paper-page-motion
description: 纸本 / 古风界面的页面切换与卡片入场动画，重点是“翻页、抽纸、墨迹展开”，而不是通用淡入。
---

# 纸页转场

## 页面切换

1. 路由变化时给页面容器一个稳定的 `key`（pathname + search），让入场动画重新播放。
2. 第一层：旧内容立即卸载，新内容以 `opacity + translateY(10px)` 进入，420–560ms。
3. 第二层：一层纸色遮罩从左侧或下侧扫过，`clip-path` 在 520–680ms 内退场；纸边带 1–2px 朱砂线。
4. 只做一次，不叠加缩放、旋转、模糊三种以上效果。

```css
@keyframes paper-lift {
  from { clip-path: inset(0 0 0 0); }
  to { clip-path: inset(0 0 0 100%); }
}
@keyframes page-rise {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

## 内容入场

- 页面内直接子元素按 50–70ms 递增延迟，最多 5 个；后面的不要再延迟。
- 卡片只做 `translateY(12px) + opacity`，不要做 3D 翻转。
- 列表筛选变化不做整页转场，只给结果区一个 180ms 的淡入。

## 关键约束

- **fixed 元素的祖先不能带 transform。** 侧栏、悬浮球要固定在视口上时，入场动画只能用 `opacity`，否则 `position: fixed` 会退化成随页面滚动。
- 动画期间 `pointer-events: none` 的遮罩不能挡住点击。
- `prefers-reduced-motion: reduce` 时全部降为 1ms，并保留最终状态。
- 转场不能改变滚动位置；页面切换后回到顶部由路由层决定，不在动画层做 `scrollTo`。
