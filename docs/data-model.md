# 数据模型 v1

模型定义见 src/types/models.ts。业务表 recipes、utensils、diaryEntries、mealPlans、pantryItems 包含稳定 UUID 和 ISO 创建/更新时间；日期字段为本地日历日期 YYYY-MM-DD。preferences/demoState 为 current 单例。

设置主题在计划默认 cream-orange-green 基础上增加 sage-green-cream 与 tomato-orange-cream 两个配色，以落实 PRD 的主题切换；备份版本 1 校验这三种枚举。

diaryEntries 使用唯一复合索引 [date+mealType]，替换必须得到用户确认。图片内嵌 StoredImage（Blob、尺寸、类型、字节数）。演示封面为本地 SVG。用户上传只接受 JPEG/PNG/WebP。

删除被引用菜谱时清除日记与计划引用，保留日记文字与照片；删除厨具不影响其他表。所有页面通过 Repository 访问；备份与类别清空使用事务。
