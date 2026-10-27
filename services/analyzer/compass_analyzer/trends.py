"""Aggregates and plain-language findings about *how* the user buys."""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from .schemas import CategoryTotal, Finding, HeatCell, MonthTotal, SourceTotal, Summary

SOURCE_LABEL = {
    "amazon": "Amazon",
    "rakuten": "楽天",
    "mercari": "メルカリ",
    "store": "実店舗",
    "other": "その他",
}
WEEKDAY_LABEL = ["月", "火", "水", "木", "金", "土", "日"]
#: (label, first hour, last hour exclusive). The night band wraps past midnight.
TIME_BANDS = [("朝（6〜11時）", 6, 11), ("昼（11〜17時）", 11, 17), ("夕方（17〜22時）", 17, 22)]
NIGHT_LABEL = "深夜（22〜翌6時）"


def summary(df: pd.DataFrame) -> Summary:
    if df.empty:
        return Summary(total_yen=0, purchase_count=0, average_yen=0, period_start=None, period_end=None)
    return Summary(
        total_yen=int(df["amount"].sum()),
        purchase_count=len(df),
        average_yen=round(df["amount"].mean()),
        period_start=df["ordered_at"].min().to_pydatetime(),
        period_end=df["ordered_at"].max().to_pydatetime(),
    )


def by_source(df: pd.DataFrame) -> list[SourceTotal]:
    total = df["amount"].sum() or 1
    grouped = df.groupby("source")["amount"].agg(["sum", "count"]).sort_values("sum", ascending=False)
    return [
        SourceTotal(
            source=s, total_yen=int(r["sum"]), count=int(r["count"]), share=round(r["sum"] / total, 4)
        )
        for s, r in grouped.iterrows()
    ]


def by_category(df: pd.DataFrame) -> list[CategoryTotal]:
    total = df["amount"].sum() or 1
    grouped = df.groupby("category")["amount"].agg(["sum", "count"]).sort_values("sum", ascending=False)
    return [
        CategoryTotal(
            category=c, total_yen=int(r["sum"]), count=int(r["count"]), share=round(r["sum"] / total, 4)
        )
        for c, r in grouped.iterrows()
    ]


def monthly(df: pd.DataFrame) -> list[MonthTotal]:
    if df.empty:
        return []
    months = df["ordered_at"].dt.strftime("%Y-%m")
    grouped = df.groupby(months)["amount"].agg(["sum", "count"]).sort_index()
    return [
        MonthTotal(month=m, total_yen=int(r["sum"]), count=int(r["count"])) for m, r in grouped.iterrows()
    ]


def heatmap(df: pd.DataFrame) -> list[HeatCell]:
    if df.empty:
        return []
    keys = pd.DataFrame({"weekday": df["ordered_at"].dt.weekday, "hour": df["ordered_at"].dt.hour})
    counts = keys.value_counts().sort_index()
    return [HeatCell(weekday=int(w), hour=int(h), count=int(n)) for (w, h), n in counts.items()]


def findings(df: pd.DataFrame, as_of: datetime) -> list[Finding]:
    """Each rule speaks only when its signal is strong enough to be worth reading."""
    if len(df) < 5:
        return []
    out: list[Finding] = []
    out.extend(_time_of_day(df))
    out.extend(_weekday(df))
    out.extend(_category_trend(df, as_of))
    out.extend(_site_preference(df))
    out.extend(_secondhand(df))
    out.extend(_basket(df))
    return out


def _band(hour: int) -> str:
    for label, start, end in TIME_BANDS:
        if start <= hour < end:
            return label
    return NIGHT_LABEL


def _time_of_day(df: pd.DataFrame) -> list[Finding]:
    bands = df["ordered_at"].dt.hour.map(_band).value_counts(normalize=True)
    night = float(bands.get(NIGHT_LABEL, 0.0))
    if night >= 0.2:
        return [
            Finding(kind="time", text=f"購入の{night:.0%}が深夜（22時〜翌6時）です。", value=round(night, 4))
        ]
    top, share = bands.index[0], float(bands.iloc[0])
    return [
        Finding(kind="time", text=f"{top}の購入が最も多く、全体の{share:.0%}です。", value=round(share, 4))
    ]


def _weekday(df: pd.DataFrame) -> list[Finding]:
    shares = df["ordered_at"].dt.weekday.value_counts(normalize=True)
    day, share = int(shares.index[0]), float(shares.iloc[0])
    # With 7 days an even spread is ~14%; only call out a clear favourite.
    if share < 0.22:
        return []
    return [
        Finding(
            kind="weekday",
            text=f"{WEEKDAY_LABEL[day]}曜日の購入が最も多く、{share:.0%}を占めます。",
            value=round(share, 4),
        )
    ]


def _category_trend(df: pd.DataFrame, as_of: datetime) -> list[Finding]:
    now = pd.Timestamp(as_of).tz_convert(df["ordered_at"].dt.tz)
    recent = df[(df["ordered_at"] > now - timedelta(days=30)) & (df["ordered_at"] <= now)]
    before = df[
        (df["ordered_at"] > now - timedelta(days=60)) & (df["ordered_at"] <= now - timedelta(days=30))
    ]
    if recent.empty or before.empty:
        return []
    cur = recent.groupby("category")["amount"].sum()
    prev = before.groupby("category")["amount"].sum()
    best: tuple[str, float] | None = None
    for category, amount in cur.items():
        base = float(prev.get(category, 0))
        if amount < 1000 or base <= 0:
            continue
        ratio = amount / base
        if ratio >= 1.5 and (best is None or ratio > best[1]):
            best = (str(category), ratio)
    if not best:
        return []
    return [
        Finding(
            kind="category_trend",
            text=f"直近30日の「{best[0]}」への支出は、その前の30日の{best[1]:.1f}倍です。",
            value=round(best[1], 2),
        )
    ]


def _site_preference(df: pd.DataFrame) -> list[Finding]:
    rows = []
    for category, group in df.groupby("category"):
        if len(group) < 3 or category == "その他":
            continue
        shares = group["source"].value_counts(normalize=True)
        source, share = str(shares.index[0]), float(shares.iloc[0])
        if share >= 0.6:
            rows.append((len(group), str(category), source, share))
    rows.sort(reverse=True)
    return [
        Finding(
            kind="site_preference",
            text=f"「{c}」は{share:.0%}を{SOURCE_LABEL[s]}で買っています。",
            value=round(share, 4),
        )
        for _, c, s, share in rows[:2]
    ]


def _secondhand(df: pd.DataFrame) -> list[Finding]:
    candidates = []
    for category, group in df.groupby("category"):
        if len(group) < 3:
            continue
        share = float((group["source"] == "mercari").mean())
        if share >= 0.4:
            candidates.append((share, str(category)))
    if not candidates:
        return []
    share, category = max(candidates)
    return [
        Finding(
            kind="secondhand",
            text=f"「{category}」の{share:.0%}はメルカリ（中古）で買っています。",
            value=round(share, 4),
        )
    ]


def _basket(df: pd.DataFrame) -> list[Finding]:
    overall = df["amount"].mean()
    averages = df.groupby("source")["amount"].agg(["mean", "count"])
    averages = averages[averages["count"] >= 3]
    if averages.empty or overall <= 0:
        return []
    source = str(averages["mean"].idxmax())
    mean = float(averages.loc[source, "mean"])
    if mean < overall * 1.5:
        return []
    return [
        Finding(
            kind="basket",
            text=f"{SOURCE_LABEL[source]}では1回あたり平均{round(mean):,}円と、まとめ買いの傾向があります。",
            value=round(mean),
        )
    ]
