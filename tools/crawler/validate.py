# -*- coding: utf-8 -*-
"""
校验脚本：检查菜谱库的数量、分类覆盖、字段完整性、重复。

用法：
  python tools/crawler/validate.py --input data/recipes-v1.0.json
"""
import argparse
import json
from collections import Counter


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="data/recipes-v1.0.json")
    args = ap.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)
    recipes = data["recipes"]

    print(f"总数：{len(recipes)}")

    cuisine_counter = Counter()
    for r in recipes:
        for c in r.get("cuisines", []):
            cuisine_counter[c] += 1
    print("\n=== 菜系/菜型分布 ===")
    for c, n in cuisine_counter.most_common():
        print(f"  {c}: {n}")

    issues = []
    for r in recipes:
        name = r.get("name")
        if not name:
            issues.append(("无菜名", r.get("id")))
        if not r.get("cuisines"):
            issues.append(("无菜系", name))
        if not r.get("steps"):
            issues.append(("无步骤", name))
        elif len(r.get("steps", [])) < 3:
            issues.append(("步骤过少(<3)", name))
        if not r.get("ingredients"):
            issues.append(("无食材", name))
        if not r.get("sourceUrl"):
            issues.append(("无来源链接", name))

    print(f"\n=== 字段问题共 {len(issues)} 条 ===")
    for kind, name in issues[:50]:
        print(f"  [{kind}] {name}")
    if len(issues) > 50:
        print(f"  ... 其余 {len(issues) - 50} 条略")

    names = [r.get("name") for r in recipes]
    dups = [n for n, c in Counter(names).items() if c > 1]
    print(f"\n=== 重复菜名 {len(dups)} 个 ===")
    for n in dups:
        print(f"  {n}")


if __name__ == "__main__":
    main()
