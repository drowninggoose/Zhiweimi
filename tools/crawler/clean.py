# -*- coding: utf-8 -*-
"""
清洗脚本：把爬虫输出的 raw JSONL 变成干净的菜谱库 JSON。

做的事：
1. 过滤无效条目（没菜名 / 没步骤 / 没食材）
2. 过滤人群标签（孕妇/老人/学生等），只保留菜系/菜型
3. 按菜名去重（重复的合并菜系/餐次/口味）
4. 推断餐次 mealTypes（早餐类 -> breakfast；甜品烘焙类 -> 空；其余 -> lunch+dinner）
5. 补全 library 元数据，对齐 models.ts 的 Recipe 结构

用法：
  python tools/crawler/clean.py --input data/raw/recipes.jsonl --output data/recipes-v1.0.json
"""
import argparse
import json
from pathlib import Path

# 保留的菜系/菜型白名单；其余标签（孕妇、老人、学生、瘦身…）会被丢弃
CUISINE_WHITELIST = {
    "家常菜", "川菜", "粤菜", "鲁菜", "苏菜", "浙菜", "闽菜", "湘菜", "徽菜",
    "京菜", "上海菜", "本帮菜", "东北菜", "西北菜", "云贵菜", "湖北菜",
    "山西菜", "陕西菜", "新疆菜", "台湾菜", "港式菜", "潮汕菜", "素菜", "清真菜",
    "热菜", "凉菜", "汤羹", "主食", "小吃", "西餐", "烘焙", "泡酱腌菜", "自制食材",
    "卤酱菜", "火锅", "烧烤", "面食", "甜点", "甜品", "早餐", "粥", "饼",
    "饺子", "包子", "饮品",
}

# 归入早餐的标签
BREAKFAST_CUISINES = {"早餐"}
# 不归入早/午/晚正餐的标签
NON_MEAL_CUISINES = {
    "甜品", "甜点", "烘焙", "饮品", "冰品", "糖水", "零食", "果冻", "布丁",
    "冰淇淋", "蛋糕", "面包", "饼干", "慕斯", "曲奇",
}


def load_raw(path):
    recipes = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                recipes.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return recipes


def infer_meal_types(cuisines, existing):
    if existing:
        return list(dict.fromkeys(existing))
    if any(c in BREAKFAST_CUISINES for c in cuisines):
        return ["breakfast"]
    if any(c in NON_MEAL_CUISINES for c in cuisines):
        return []
    return ["lunch", "dinner"]


def clean_recipe(r):
    name = (r.get("name") or "").strip()
    steps = r.get("steps") or []
    ingredients = r.get("ingredients") or []
    if not name or not steps or not ingredients:
        return None
    cuisines = [c for c in (r.get("cuisines") or []) if c in CUISINE_WHITELIST]
    meal_types = infer_meal_types(cuisines, r.get("mealTypes"))
    return {
        "name": name,
        "cuisines": cuisines,
        "mealTypes": meal_types,
        "flavorTags": r.get("flavorTags") or [],
        "difficulty": r.get("difficulty"),
        "estimatedMinutes": r.get("estimatedMinutes"),
        "description": (r.get("description") or "").strip(),
        "ingredients": ingredients,
        "steps": steps,
        "tips": (r.get("tips") or "").strip(),
        "coverUrl": r.get("coverUrl") or "",
        "source": r.get("source") or "",
        "sourceUrl": r.get("sourceUrl") or "",
        "sourceType": "library",
        "status": "published",
        "favorite": False,
    }


def merge(a, b):
    """合并两条重名菜谱：列表字段取并集。"""
    for key in ("cuisines", "mealTypes", "flavorTags"):
        a[key] = list(dict.fromkeys(a[key] + b[key]))
    return a


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="data/raw/recipes.jsonl")
    ap.add_argument("--output", default="data/recipes-v1.0.json")
    args = ap.parse_args()

    raw = load_raw(args.input)
    by_name = {}
    order = []
    dropped = 0
    for r in raw:
        c = clean_recipe(r)
        if c is None:
            dropped += 1
            continue
        name = c["name"]
        if name in by_name:
            by_name[name] = merge(by_name[name], c)
            dropped += 1
            continue
        by_name[name] = c
        order.append(name)

    cleaned = [by_name[n] for n in order]
    for i, c in enumerate(cleaned):
        c["id"] = f"lib-{i + 1}"

    out = {"version": "1.0", "count": len(cleaned), "recipes": cleaned}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"清洗完成：原始 {len(raw)} 道 -> 有效 {len(cleaned)} 道，丢弃/合并 {dropped} 道")
    print(f"已输出：{args.output}")


if __name__ == "__main__":
    main()
