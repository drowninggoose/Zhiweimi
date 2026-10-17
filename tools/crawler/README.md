# 菜谱爬虫（知味咪）

从「美食天下」抓取真实菜谱，输出结构化 JSONL，供后续清洗、导入应用使用。

## 一、首次准备

在项目根目录（`tools/crawler/` 的上一级是项目，建议 cd 到项目根）打开 PowerShell：

```powershell
pip install -r tools/crawler/requirements.txt
```

> 需要本机有 Python 3.9+。

## 二、先调试一个页面（强烈建议先做这一步）

```powershell
python tools/crawler/crawl.py --test https://home.meishichina.com/recipe-92500.html
```

它会打印出解析出来的 JSON。重点看这几项对不对：

- `name` 菜名
- `ingredients` 里有没有「主料/辅料/调料」和用量
- `steps` 里是不是真正的做法步骤（不是广告/无关文字）
- `sourceUrl` 是否是当前页地址

**如果某字段是空的或抓错了**，用浏览器打开那个网页 → 右键「检查」看真实 HTML，然后去改 `tools/crawler/sites.py` 里对应的选择器。

## 三、正式爬取

爬单个分类（比如先爬 50 道热菜试试）：

```powershell
python tools/crawler/crawl.py --category 热菜 --limit 50 --output data/raw/recipes.jsonl
```

爬全部分类（每个分类 `--limit` 道）：

```powershell
python tools/crawler/crawl.py --all --limit 50 --output data/raw/recipes.jsonl
```

可选分类：`热菜 / 凉菜 / 汤羹 / 主食 / 小吃 / 西餐 / 烘焙`。

## 四、说明

- **断点续爬**：结果按行写入 JSONL，已爬过的 `sourceUrl` 会自动跳过。中断后重复同一命令即可继续。
- **限速**：默认每道菜间隔 2 秒（`--delay` 可调），请勿设成 0，避免给目标站压力、避免被封。
- **输出格式**：每行一道菜的 JSON，字段对齐 `src/types/models.ts` 里的 `Recipe` 结构（`source` / `sourceUrl` 用于比赛时的「数据来源说明」）。
- **图片**：只存图片 URL（`coverUrl`），不下载图片本身。

## 五、500 道怎么凑

7 个分类，每类爬 70~75 道 ≈ 500 道。例如：

```powershell
python tools/crawler/crawl.py --all --limit 72
```

之后再用 `clean.py`（清洗）和 `validate.py`（校验）脚本处理，那两个脚本下一步再写。
