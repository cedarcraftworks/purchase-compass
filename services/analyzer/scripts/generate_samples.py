"""Generates the demo purchase history in each site's *own* export format.

The persona: a university student who studies programming. The data is
fictional but shaped like real habits, so every analysis has something to
find: a coffee-bean cycle, late-night book buying, second-hand fashion on
Mercari, forgotten monthly subscriptions on a card statement.

Run from the repository root:  python services/analyzer/scripts/generate_samples.py
Output is deterministic (fixed seed), so the committed samples never drift.
"""

from __future__ import annotations

import csv
import random
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))
START = datetime(2026, 4, 20, tzinfo=JST)
END = datetime(2026, 10, 20, tzinfo=JST)
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "samples"
#: The web app offers the same files for download from its import screen.
WEB_COPY = ROOT / "apps" / "web" / "public" / "samples"
rng = random.Random(20261027)


def at(day: datetime, hour: int, minute: int | None = None) -> datetime:
    return day.replace(
        hour=hour, minute=rng.randrange(60) if minute is None else minute, second=rng.randrange(60)
    )


def every(days: float, jitter: int, start_offset: int = 0):
    t = START + timedelta(days=start_offset)
    while t < END:
        yield t
        t += timedelta(days=days + rng.randint(-jitter, jitter))


amazon: list[dict] = []
rakuten: list[dict] = []
mercari: list[dict] = []
store: list[dict] = []
card: list[dict] = []

# ---- repeat purchases (buy-again cycles) ----------------------------------------------------
for t in every(25, 2, 3):
    rakuten.append(
        {
            "at": at(t, rng.choice([20, 21, 22])),
            "title": "スペシャルティコーヒー豆 ブラジル 中煎り 500g",
            "price": 2380,
            "qty": 1,
            "shop": "珈琲問屋サンプル店",
        }
    )
for t in every(46, 3, 10):
    rakuten.append(
        {
            "at": at(t, 21),
            "title": "衣料用洗剤 ジェル 詰め替え 超特大",
            "price": 1480,
            "qty": 2,
            "shop": "ドラッグストアサンプル",
        }
    )
for t in every(34, 3, 6):
    rakuten.append(
        {
            "at": at(t, 21),
            "title": "トイレットペーパー 3倍巻 12ロール",
            "price": 1980,
            "qty": 1,
            "shop": "ドラッグストアサンプル",
        }
    )
for t in every(30, 2, 1):
    amazon.append(
        {"at": at(t, rng.choice([19, 20])), "title": "ホエイプロテイン チョコ味 1kg", "price": 3980, "qty": 1}
    )

# ---- books: mostly late at night, and more of them lately (job hunting season) --------------
books = [
    "リーダブルコード",
    "プログラミングTypeScript 第2版",
    "Webを支える技術",
    "達人プログラマー 第2版",
    "SQL実践入門",
    "ゼロから作るDeep Learning",
    "Pythonではじめるデータ分析 入門",
    "システム設計の面接試験",
    "就活 面接対策 2028年度版",
    "エンジニアの知的生産術",
    "技術書 Docker実践ガイド",
    "コミック 最新巻",
    "Kindle版 アルゴリズム図鑑",
    "新書 データ思考入門",
]
for i, title in enumerate(books):
    recent = i >= 8
    day = END - timedelta(days=rng.randint(1, 28)) if recent else START + timedelta(days=rng.randint(5, 140))
    hour = rng.choice([23, 23, 0, 1, 22]) if rng.random() < 0.75 else rng.choice([12, 18])
    amazon.append(
        {
            "at": at(day, hour),
            "title": title,
            "price": rng.choice([2640, 2860, 3080, 3520, 528, 990]),
            "qty": 1,
        }
    )

# ---- gadgets, including one late-night spree ------------------------------------------------
for title, price in [
    ("USB-C ケーブル 1m", 980),
    ("ノートPCスタンド アルミ", 3280),
    ("ワイヤレスマウス 静音", 2480),
    ("モバイルバッテリー 10000mAh", 2980),
    ("USB-C 充電器 30W", 1980),
]:
    amazon.append(
        {
            "at": at(START + timedelta(days=rng.randint(0, 170)), rng.choice([13, 20, 21])),
            "title": title,
            "price": price,
            "qty": 1,
        }
    )
spree = datetime(2026, 9, 26, 1, 12, tzinfo=JST)
amazon.append({"at": spree, "title": "ワイヤレスイヤホン ノイズキャンセリング", "price": 19800, "qty": 1})
amazon.append(
    {"at": spree + timedelta(minutes=9), "title": "イヤホンケース シリコン", "price": 1280, "qty": 1}
)
amazon.append(
    {"at": spree + timedelta(minutes=17), "title": "メカニカルキーボード 茶軸", "price": 12980, "qty": 1}
)

# ---- Mercari: second-hand fashion and games -------------------------------------------------
for title, price in [
    ("古着 デニムジャケット", 3200),
    ("スニーカー 白 26.5cm", 4800),
    ("ニットベスト", 1800),
    ("古着 スウェット パーカー", 2500),
    ("ワイドパンツ 黒", 2200),
    ("リュック 通学用", 3500),
    ("Switch ソフト 中古", 3800),
    ("ポケモンカード まとめ売り", 1500),
    ("ボードゲーム 中古", 2400),
    ("キャップ ベージュ", 1200),
]:
    mercari.append(
        {
            "at": at(START + timedelta(days=rng.randint(0, 180)), rng.choice([12, 18, 22, 23])),
            "title": title,
            "price": price,
        }
    )

# ---- convenience store & supermarket (entered by hand) --------------------------------------
day = START
while day < END:
    if day.weekday() < 5 and rng.random() < 0.45:
        store.append(
            {
                "at": at(day, 12, rng.randrange(0, 40)),
                "store": "コンビニ",
                "title": rng.choice(["おにぎり 2個", "弁当 のり弁", "サラダチキン", "カップ麺"]),
                "price": rng.choice([298, 398, 498, 548]),
            }
        )
    if day.weekday() >= 5 and rng.random() < 0.6:
        store.append(
            {
                "at": at(day, rng.choice([15, 16, 17])),
                "store": "スーパー",
                "title": rng.choice(
                    ["食パン 6枚切り", "卵 10個", "鶏むね肉", "ヨーグルト 4個", "冷凍うどん 5食"]
                ),
                "price": rng.choice([158, 238, 298, 398, 458]),
            }
        )
    if rng.random() < 0.15:
        store.append(
            {
                "at": at(day, rng.choice([9, 15])),
                "store": "コンビニ",
                "title": "エナジードリンク",
                "price": 210,
            }
        )
    day += timedelta(days=1)

# ---- card statement: the subscriptions nobody remembers -------------------------------------
for name, amount, offset in [
    ("動画配信サービス 月額", 990, 2),
    ("音楽配信 月額プラン", 1080, 9),
    ("クラウドストレージ 月額", 250, 15),
    ("語学アプリ プレミアム会員 月額", 1200, 21),
]:
    t = START + timedelta(days=offset)
    while t < END:
        card.append({"at": t.replace(hour=4, minute=0, second=0), "store": name, "price": amount})
        t += timedelta(days=30 + rng.choice([0, 1, 0, -1]))


def write(name: str, header: list[str], rows: list[list], delimiter: str = ",") -> None:
    for folder in (OUT, WEB_COPY):
        folder.mkdir(parents=True, exist_ok=True)
        with open(folder / name, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f, delimiter=delimiter)
            w.writerow(header)
            w.writerows(rows)


def key(r: dict) -> datetime:
    return r["at"]


# Amazon "Request Your Data" order history (a subset of its columns, same names).
write(
    "amazon_Retail.OrderHistory.1.csv",
    [
        "Website",
        "Order ID",
        "Order Date",
        "Currency",
        "Unit Price",
        "Total Owed",
        "Quantity",
        "Order Status",
        "Product Name",
    ],
    [
        [
            "Amazon.co.jp",
            f"250-{1000000 + i:07d}-{rng.randrange(10**7):07d}",
            r["at"].astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "JPY",
            r["price"],
            r["price"] * r["qty"],
            r["qty"],
            "Closed",
            r["title"],
        ]
        for i, r in enumerate(sorted(amazon, key=key))
    ],
)
# Rakuten: the purchase-history table copied from the browser (tab-separated).
write(
    "rakuten_purchase_history.tsv",
    ["注文日時", "商品名", "ショップ名", "数量", "支払金額"],
    [
        [r["at"].strftime("%Y/%m/%d %H:%M"), r["title"], r["shop"], r["qty"], f"{r['price'] * r['qty']:,}円"]
        for r in sorted(rakuten, key=key)
    ],
    delimiter="\t",
)
# Mercari: the purchase list typed or copied into a spreadsheet.
write(
    "mercari_purchases.csv",
    ["購入日", "商品名", "価格"],
    [
        [r["at"].strftime("%Y年%m月%d日 %H:%M"), r["title"], f"¥{r['price']:,}"]
        for r in sorted(mercari, key=key)
    ],
)
write(
    "store_receipts.csv",
    ["日付", "店名", "品名", "金額"],
    [
        [r["at"].strftime("%Y-%m-%d %H:%M"), r["store"], r["title"], r["price"]]
        for r in sorted(store, key=key)
    ],
)
write(
    "card_statement.csv",
    ["利用日", "利用店名", "利用金額"],
    [[r["at"].strftime("%Y/%m/%d"), r["store"], r["price"]] for r in sorted(card, key=key)],
)
total = len(amazon) + len(rakuten) + len(mercari) + len(store) + len(card)
print(f"wrote {total} purchases to {OUT}")
