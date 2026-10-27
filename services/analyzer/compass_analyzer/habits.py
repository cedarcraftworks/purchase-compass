"""Patterns found in *when* and *how often* things are bought:
buy-again timing, likely impulse purchases and recurring charges.

Every threshold is a named constant so it is visible, testable and easy to
argue about, rather than buried in an expression.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pandas as pd

from .schemas import ImpulseCandidate, ImpulseReason, Replenishment, Subscription

# ---- buy again ------------------------------------------------------------------------------
REPLENISH_MIN_PURCHASES = 3
REPLENISH_MIN_INTERVAL_DAYS = 3  # ignore items bought several times in one shopping trip
DUE_RATIO = 0.9  # "due" once 90% of the usual interval has passed
SOON_RATIO = 0.75

# ---- impulse --------------------------------------------------------------------------------
NIGHT_START, NIGHT_END = 22, 4
BURST_WINDOW = timedelta(minutes=30)
UNUSUAL_AMOUNT_RATIO = 2.0
IMPULSE_THRESHOLD = 50
POINTS = {"late_night": 30, "burst": 25, "unusual_amount": 30, "new_category": 15}

# ---- subscriptions --------------------------------------------------------------------------
SUB_MIN_OCCURRENCES = 3
SUB_AMOUNT_TOLERANCE = 0.05
#: Only charges that are not physical goods can be subscriptions. Coffee beans bought
#: monthly at the same price are a buy-again item, not a forgotten subscription;
#: unknown card-statement merchants ("その他") stay eligible.
SUB_CATEGORIES = {"サブスク・デジタル", "その他"}
CADENCES = {  # name: (median interval range in days, allowed deviation of each interval)
    "monthly": ((26, 35), 5),
    "yearly": ((350, 380), 15),
}


def group_key(df: pd.DataFrame) -> pd.Series:
    """Recurring charges are best grouped by merchant; goods by normalised title."""
    return df["store"].fillna("").str.strip().where(df["store"].fillna("").str.strip() != "", df["item_key"])


def subscriptions(df: pd.DataFrame) -> list[Subscription]:
    if df.empty:
        return []
    out: list[Subscription] = []
    eligible = df[df["category"].isin(SUB_CATEGORIES)]
    for key, group in eligible.groupby(group_key(eligible)):
        median_amount = group["amount"].median()
        if median_amount <= 0:
            continue
        same_price = group[(group["amount"] - median_amount).abs() <= median_amount * SUB_AMOUNT_TOLERANCE]
        if len(same_price) < SUB_MIN_OCCURRENCES:
            continue
        times = same_price["ordered_at"].sort_values()
        intervals = times.diff().dropna().dt.total_seconds() / 86400
        median_interval = float(intervals.median())
        for cadence, ((low, high), slack) in CADENCES.items():
            if low <= median_interval <= high and (intervals - median_interval).abs().max() <= slack:
                last = times.iloc[-1]
                amount = round(median_amount)
                yearly = amount * (12 if cadence == "monthly" else 1)
                out.append(
                    Subscription(
                        key=str(key),
                        title=str(same_price["title"].iloc[-1]),
                        amount_yen=amount,
                        cadence=cadence,
                        occurrences=len(same_price),
                        last_charged_at=last.to_pydatetime(),
                        next_expected_at=(last + timedelta(days=median_interval)).to_pydatetime(),
                        yearly_cost_yen=yearly,
                        reason=(
                            f"同じ金額（{amount:,}円）の支払いが約{median_interval:.0f}日ごとに"
                            f"{len(same_price)}回続いています。年間で約{yearly:,}円です。"
                        ),
                    )
                )
                break
    return sorted(out, key=lambda s: s.yearly_cost_yen, reverse=True)


def replenishment(df: pd.DataFrame, as_of: datetime, exclude_keys: set[str]) -> list[Replenishment]:
    if df.empty:
        return []
    now = pd.Timestamp(as_of).tz_convert(df["ordered_at"].dt.tz)
    out: list[Replenishment] = []
    for key, group in df.groupby("item_key"):
        if key in exclude_keys:
            continue
        # One entry per day, so a multi-pack bought as two lines counts once.
        days = group["ordered_at"].dt.normalize().drop_duplicates().sort_values()
        if len(days) < REPLENISH_MIN_PURCHASES:
            continue
        intervals = days.diff().dropna().dt.days
        # The median, not the mean: one bulk buy should not stretch the cycle.
        median_interval = float(intervals.median())
        if median_interval < REPLENISH_MIN_INTERVAL_DAYS:
            continue
        last = group["ordered_at"].max()
        days_since = (now - last).total_seconds() / 86400
        ratio = days_since / median_interval
        status = "due" if ratio >= DUE_RATIO else "soon" if ratio >= SOON_RATIO else "ok"
        remaining = median_interval - days_since
        timing = "そろそろ買い時です" if remaining <= 0 else f"あと約{remaining:.0f}日で買い時です"
        out.append(
            Replenishment(
                item_key=str(key),
                title=str(group["title"].iloc[-1]),
                category=str(group["category"].iloc[-1]),
                times_bought=len(days),
                median_interval_days=round(median_interval, 1),
                last_purchased_at=last.to_pydatetime(),
                days_since=round(days_since, 1),
                status=status,
                reason=f"いつもは約{median_interval:.0f}日ごとに購入。前回から{days_since:.0f}日経ち、{timing}。",
            )
        )
    order = {"due": 0, "soon": 1, "ok": 2}
    return sorted(out, key=lambda r: (order[r.status], -r.days_since / r.median_interval_days))


def impulse(df: pd.DataFrame, exclude_keys: set[str]) -> list[ImpulseCandidate]:
    if df.empty:
        return []
    keys = group_key(df)
    medians = df.groupby("category")["amount"].median()
    counts = df.groupby("category")["amount"].count()
    first_seen = df.groupby("category")["ordered_at"].min()
    history_start = df["ordered_at"].min()
    times = df["ordered_at"].tolist()

    out: list[ImpulseCandidate] = []
    for i, row in df.iterrows():
        if keys.iloc[i] in exclude_keys:  # a subscription is planned, not impulsive
            continue
        reasons: list[ImpulseReason] = []
        hour = row["ordered_at"].hour
        if hour >= NIGHT_START or hour < NIGHT_END:
            reasons.append(
                ImpulseReason(code="late_night", label=f"深夜{hour}時台の購入", points=POINTS["late_night"])
            )
        previous = [t for t in times[:i] if timedelta(0) <= row["ordered_at"] - t <= BURST_WINDOW]
        if previous:
            reasons.append(
                ImpulseReason(
                    code="burst", label=f"直前30分以内に{len(previous)}件購入", points=POINTS["burst"]
                )
            )
        category = row["category"]
        if counts[category] >= 3 and medians[category] > 0:
            ratio = row["amount"] / medians[category]
            if ratio >= UNUSUAL_AMOUNT_RATIO:
                reasons.append(
                    ImpulseReason(
                        code="unusual_amount",
                        label=f"このカテゴリのいつもの{ratio:.1f}倍の金額",
                        points=POINTS["unusual_amount"],
                    )
                )
        # A first-ever category only counts once there is enough history to know "usual".
        if row["ordered_at"] == first_seen[category] and row["ordered_at"] - history_start > timedelta(
            days=30
        ):
            reasons.append(
                ImpulseReason(
                    code="new_category", label=f"初めての「{category}」の購入", points=POINTS["new_category"]
                )
            )
        score = sum(r.points for r in reasons)
        if score >= IMPULSE_THRESHOLD:
            out.append(
                ImpulseCandidate(
                    purchase_id=row["id"],
                    title=row["title"],
                    amount_yen=int(row["amount"]),
                    ordered_at=row["ordered_at"].to_pydatetime(),
                    score=score,
                    reasons=reasons,
                )
            )
    return sorted(out, key=lambda c: (c.score, c.amount_yen), reverse=True)
