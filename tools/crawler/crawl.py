# -*- coding: utf-8 -*-
"""
知味咪 菜谱爬虫

用法：
  1) 调试单页（强烈建议先跑这个，看字段解析对不对）：
       python crawl.py --test https://home.meishichina.com/recipe-92500.html

  2) 正式爬某个分类（默认每分类 50 道，可用 --limit 改）：
       python crawl.py --category 热菜 --limit 50 --output data/raw/recipes.jsonl

  3) 爬全部分类（每类 --limit 道）：
       python crawl.py --all --limit 50 --output data/raw/recipes.jsonl

说明：
  - 结果以 JSONL 形式写入 --output（一行一道菜），可断点续爬：
    已经存在于输出文件里的 sourceUrl 会自动跳过。
  - 每道菜之间默认延时 2 秒（--delay 可调），避免给目标站造成压力。
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

import sites

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "zh-CN,zh;q=0.9",
}

# ---------------------------------------------------------------- 抓取

def fetch(url, retries=3):
    """抓取页面，返回 BeautifulSoup；失败返回 None。"""
    for i in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            r.raise_for_status()
            r.encoding = r.apparent_encoding or "utf-8"
            return BeautifulSoup(r.text, "lxml")
        except Exception as e:
            print(f"  [!] 抓取失败({i + 1}/{retries}) {url} : {e}")
            time.sleep(2 + i * 2)
    return None


# ---------------------------------------------------------------- 解析

def _pick(soup, selector):
    """按 CSS 选择器取第一个元素；空串或没命中返回 None。"""
    if not selector:
        return None
    return soup.select_one(selector)


def _find_heading(soup, keyword):
    """找到文本里包含 keyword 的标题元素（用于"食材明细""做法步骤"等定位）。"""
    for tag in soup.find_all(["h2", "h3", "div"]):
        txt = tag.get_text(strip=True)
        if keyword in txt and len(txt) <= 40:
            return tag
    return None


def parse_title(soup, sel):
    # 优先用 <title>，最稳定，格式如 "番茄炒蛋的做法_番茄炒蛋怎么做_菜谱_美食天下"
    t = soup.find("title")
    if t:
        txt = t.get_text(strip=True)
        name = txt.split("_")[0].strip()
        for suffix in ("的家常做法", "的做法大全", "的做法", "怎么做"):
            if name.endswith(suffix):
                name = name[: -len(suffix)].strip()
                break
        if name and name not in ("菜谱", "美食天下"):
            return name
    # 兜底：指向 recipe-{id}.html 链接的标题（页面里真正的菜名标题）
    for h in soup.find_all(["h1", "h2"]):
        a = h.find("a", href=re.compile(r"recipe-\d+\.html"))
        if a and a.get_text(strip=True):
            return a.get_text(strip=True)
    return ""


def parse_description(soup, sel):
    el = _pick(soup, sel)
    if el:
        return el.get_text(" ", strip=True).strip("“”\"' ")
    return ""


def parse_cover(soup):
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if "recipe" in src and "blank.gif" not in src:
            return src if src.startswith("http") else "https:" + src
    return ""


def parse_ingredients(soup):
    """解析食材：主料/辅料/调料 在 <legend>，名称在 .category_s1，用量在 .category_s2。"""
    result = []
    for fs in soup.find_all("fieldset", class_="particulars"):
        legend = fs.find("legend")
        group = legend.get_text(strip=True) if legend else ""
        for li in fs.find_all("li"):
            name_el = li.select_one(".category_s1")
            amount_el = li.select_one(".category_s2")
            name = name_el.get_text(strip=True) if name_el else ""
            amount = amount_el.get_text(strip=True) if amount_el else ""
            if name:
                result.append({"name": name, "amount": amount, "group": group})
    return result


def parse_steps(soup):
    """解析做法步骤：找"做法步骤"标题后的列表，逐条去掉序号。"""
    steps = []
    heading = _find_heading(soup, "做法步骤")
    if not heading:
        return steps
    list_el = heading.find_next(["ul", "ol"])
    if not list_el:
        return steps
    for li in list_el.find_all("li", recursive=False):
        txt = li.get_text(" ", strip=True)
        txt = re.sub(r"^\d+\s*", "", txt)  # 去掉开头的序号数字
        if txt:
            steps.append(txt)
    return steps


def parse_tips(soup):
    """解析小窍门/烹饪技巧（不是每道菜都有）。"""
    for kw in ("小窍门", "烹饪技巧", "小贴士"):
        h = _find_heading(soup, kw)
        if h:
            nxt = h.find_next("div") or h.find_next("p")
            if nxt:
                txt = nxt.get_text(" ", strip=True)
                if txt:
                    return txt
    return ""


_CN_DIGITS = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
              "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def _cn_num(s):
    """把中文/阿拉伯数字（1~99）转成 int；无法解析返回 None。"""
    if not s:
        return None
    if s.isdigit():
        return int(s)
    if s == "十":
        return 10
    if "十" in s:
        left, right = s.split("十", 1)
        l = _CN_DIGITS.get(left, 0) if left else 1
        r = _CN_DIGITS.get(right, 0) if right else 0
        return l * 10 + r
    return _CN_DIGITS.get(s)


def parse_minutes(val):
    if not val:
        return None
    if "半" in val:
        return 30
    m = re.search(r"([一二两三四五六七八九十\d]+)", val)
    if not m:
        return None
    n = _cn_num(m.group(1))
    if n is None:
        return None
    return n * 60 if "小时" in val else n


def parse_difficulty(val):
    if not val:
        return None
    if "高级" in val or "较难" in val or "难" in val:
        return "advanced"
    if "中等" in val or "普通" in val:
        return "normal"
    if "简单" in val or "初级" in val or "容易" in val:
        return "easy"
    return "normal"


def parse_meta(soup):
    """解析 口味/工艺/耗时/难度，返回 (flavor, tech, minutes, difficulty)。"""
    flavor = tech = ""
    minutes = difficulty = None
    for li in soup.find_all("li"):
        txt = li.get_text(" ", strip=True)
        m = re.match(r"^(.*?)\s*(口味|工艺|耗时|难度)\s*$", txt)
        if not m:
            continue
        val, label = m.group(1).strip(), m.group(2)
        if label == "口味":
            flavor = val
        elif label == "工艺":
            tech = val
        elif label == "耗时":
            minutes = parse_minutes(val)
        elif label == "难度":
            difficulty = parse_difficulty(val)
    return flavor, tech, minutes, difficulty


def parse_categories(soup):
    """解析"所属分类"后的标签，返回原始分类列表（如 热菜/家常菜/午餐/晚餐）。"""
    label = soup.find(string=re.compile("所属分类"))
    cats = []
    if label:
        parent = label.find_parent()
        if parent:
            for a in parent.find_all("a"):
                txt = a.get_text(strip=True)
                if txt and txt not in cats:
                    cats.append(txt)
    return cats


MEAL_KEYWORDS = {"早餐": "breakfast", "午餐": "lunch", "晚餐": "dinner"}


def split_categories(raw):
    """把原始分类拆成 菜系(cuisines) 和 餐次(mealTypes)。"""
    cuisines, meal_types = [], []
    for c in raw:
        if c in MEAL_KEYWORDS:
            meal_types.append(MEAL_KEYWORDS[c])
        else:
            cuisines.append(c)
    return cuisines, meal_types


def parse_recipe(soup, site, url):
    """把详情页解析成一条菜谱 dict（对齐 models.ts 的 Recipe 结构）。"""
    sel = site["detail"]
    flavor, tech, minutes, difficulty = parse_meta(soup)
    raw_cats = parse_categories(soup)
    cuisines, meal_types = split_categories(raw_cats)

    steps = parse_steps(soup)
    recipe = {
        "name": parse_title(soup, sel.get("title")),
        "cuisines": cuisines,
        "mealTypes": meal_types,
        "flavorTags": [flavor] if flavor else [],
        "difficulty": difficulty,
        "estimatedMinutes": minutes,
        "description": parse_description(soup, sel.get("description")),
        "ingredients": parse_ingredients(soup),
        "steps": [
            {"order": i + 1, "instruction": s}
            for i, s in enumerate(steps)
        ],
        "tips": parse_tips(soup),
        "coverUrl": parse_cover(soup),
        "source": site["name"],
        "sourceUrl": url,
    }
    return recipe


# ---------------------------------------------------------------- 列表页

def extract_recipe_links(soup, site):
    """从分类列表页提取菜谱详情 URL（去重、去列表页自身）。"""
    links = []
    for a in soup.select(site["list_item"]):
        href = a.get("href") or ""
        if re.search(r"recipe-\d+\.html", href):
            if href.startswith("http"):
                full = href
            else:
                full = site["base"] + href
            if full not in links:
                links.append(full)
    return links


# ---------------------------------------------------------------- 主流程

def load_done_urls(output_path):
    done = set()
    if output_path and Path(output_path).exists():
        with open(output_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if obj.get("sourceUrl"):
                        done.add(obj["sourceUrl"])
                except json.JSONDecodeError:
                    continue
    return done


def save_recipe(output_path, recipe):
    if not output_path:
        print(json.dumps(recipe, ensure_ascii=False, indent=2))
        return
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(recipe, ensure_ascii=False) + "\n")


def crawl_category(site, cat, cat_slug, limit, output_path, delay):
    base_url = site["category_url"].format(base=site["base"], cat=cat_slug)
    done = load_done_urls(output_path)
    page = 1
    collected = 0
    while collected < limit:
        url = base_url if page == 1 else site["page_pattern"].format(
            base=site["base"], cat=cat_slug, page=page
        )
        print(f"[分类 {cat}] 第 {page} 页: {url}")
        soup = fetch(url)
        if not soup:
            break
        links = extract_recipe_links(soup, site)
        if not links:
            print(f"  [!] 没取到菜谱链接，可能到了末页或选择器要核对（停在第 {page} 页）")
            break
        for link in links:
            if collected >= limit:
                break
            if link in done:
                continue
            print(f"  ({collected + 1}/{limit}) {link}")
            rs = fetch(link)
            if not rs:
                continue
            recipe = parse_recipe(rs, site, link)
            if not recipe["name"] or not recipe["steps"]:
                print("    [!] 关键字段为空，跳过并继续")
                continue
            # 把当前分类（如"川菜""早餐"）补进菜系，保证分类覆盖
            if cat not in recipe["cuisines"]:
                recipe["cuisines"].append(cat)
            save_recipe(output_path, recipe)
            done.add(link)
            collected += 1
            time.sleep(delay)
        page += 1
    print(f"[分类 {cat}] 完成，共新爬 {collected} 道")


def cmd_test(url):
    site = sites.SITES.get("meishichina")
    soup = fetch(url)
    if not soup:
        sys.exit(1)
    recipe = parse_recipe(soup, site, url)
    print(json.dumps(recipe, ensure_ascii=False, indent=2))


def cmd_dump(url, out_path):
    r = requests.get(url, headers=HEADERS, timeout=15)
    r.raise_for_status()
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(r.content)
    print(f"已保存 {out_path}（{len(r.content)} 字节）")


def main():
    ap = argparse.ArgumentParser(description="知味咪菜谱爬虫")
    ap.add_argument("--site", default="meishichina", choices=list(sites.SITES))
    ap.add_argument("--category", help="单个分类名，如：热菜")
    ap.add_argument("--all", action="store_true", help="爬全部配置的分类")
    ap.add_argument("--limit", type=int, default=50, help="每分类最多爬几道（默认 50）")
    ap.add_argument("--output", default="data/raw/recipes.jsonl", help="输出 JSONL 文件")
    ap.add_argument("--delay", type=float, default=2.0, help="每道菜间隔秒数（默认 2）")
    ap.add_argument("--test", help="调试单个详情页 URL，打印解析结果后退出")
    ap.add_argument("--dump", help="下载某个 URL 的原始 HTML 保存到 --dump-out，用于排查结构")
    ap.add_argument("--dump-out", default="dump.html", help="--dump 时保存的文件名")
    args = ap.parse_args()

    if args.test:
        cmd_test(args.test)
        return
    if args.dump:
        cmd_dump(args.dump, args.dump_out)
        return

    site = sites.SITES[args.site]

    if args.category:
        slug = sites.CATEGORIES.get(args.category)
        if not slug:
            print(f"未知分类：{args.category}，可选：{list(sites.CATEGORIES)}")
            sys.exit(1)
        crawl_category(site, args.category, slug, args.limit, args.output, args.delay)
    elif args.all:
        for name, slug in sites.CATEGORIES.items():
            crawl_category(site, name, slug, args.limit, args.output, args.delay)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
