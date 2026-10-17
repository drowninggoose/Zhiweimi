# -*- coding: utf-8 -*-
"""
站点配置。

每加一个网站，就在 SITES 里加一个字典即可，crawl.py 不用改。
选择器如果解析为空，crawl.py 会自动走「文字兜底」逻辑，所以多数情况填空串也能跑。

字段说明：
- name        站点名，会写进每道菜的 source 字段
- base        站点根地址
- category_url 分类列表页第 1 页地址模板（{base} {cat} 会替换）
- page_pattern 分类列表页第 N 页地址模板（{page} 为页码，从 2 开始）
- list_item   列表页里"菜谱详情链接"的 CSS 选择器
- detail      详情页各字段的 CSS 选择器（空串 = 用文字兜底解析）
"""

MEISHICHINA = {
    "name": "美食天下",
    "base": "https://home.meishichina.com",
    "category_url": "{base}/recipe/{cat}/",
    "page_pattern": "{base}/recipe/{cat}/page/{page}/",
    "list_item": "a[href*='/recipe-']",
    "detail": {
        "title": "h1",           # 菜名（解析失败会自动读 <title> 兜底）
        "description": "blockquote",  # 简介
        "cover": "img",          # 封面图（内部还会过滤图片地址）
    },
}

# 要爬的分类：分类名 -> 美食天下的目录路径
# 覆盖你要的：家常菜/八大菜系(热菜凉菜) + 汤羹 + 主食(面食) + 小吃 + 西餐 + 烘焙(甜品)
CATEGORIES = {
    # 常见菜式
    "热菜": "recai",
    "凉菜": "liangcai",
    "汤羹": "tanggeng",
    "主食": "zhushi",
    "小吃": "xiaochi",
    "西餐": "xican",
    "烘焙": "hongbei",
    "家常菜": "jiachang",
    # 八大菜系
    "川菜": "chuancai",
    "粤菜": "yuecai",
    "鲁菜": "lucai",
    "苏菜": "sucai",
    "浙菜": "zhecai",
    "闽菜": "mincai",
    "湘菜": "xiangcai",
    "徽菜": "huicai",
    # 补充
    "早餐": "zaocan",
    "甜品": "tianpin",
    "面食": "mianshi",
}

SITES = {"meishichina": MEISHICHINA}
