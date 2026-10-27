from datetime import timedelta

from conftest import frame, jst, p

from compass_analyzer import habits


def test_buy_again_uses_the_median_interval_and_flags_due_items(as_of):
    # Every ~30 days, plus one bulk buy 5 days after another (an outlier the median ignores).
    days = [jst(2026, 6, 1), jst(2026, 7, 1), jst(2026, 7, 6), jst(2026, 8, 5), jst(2026, 9, 4)]
    df = frame([p("コーヒー豆 500g", d, 2000, source="rakuten") for d in days])

    [item] = habits.replenishment(df, as_of, exclude_keys=set())

    assert item.median_interval_days == 30
    assert item.status == "due"  # 46 days since the last purchase
    assert "約30日ごと" in item.reason


def test_buy_again_needs_three_purchases(as_of):
    df = frame([p("洗剤", jst(2026, 8, 1)), p("洗剤", jst(2026, 9, 1))])
    assert habits.replenishment(df, as_of, exclude_keys=set()) == []


def test_buy_again_says_how_long_until_the_next_purchase(as_of):
    days = [as_of - timedelta(days=d) for d in (95, 65, 35, 5)]
    df = frame([p("トイレットペーパー", d) for d in days])
    [item] = habits.replenishment(df, as_of, exclude_keys=set())
    assert item.status == "ok"
    assert "あと約25日" in item.reason


def test_monthly_subscription_is_detected_with_yearly_cost():
    charges = [jst(2026, 5, 3, 4), jst(2026, 6, 2, 4), jst(2026, 7, 3, 4), jst(2026, 8, 2, 4)]
    df = frame([p("動画配信 月額", d, 990, source="other", store="動画配信 月額") for d in charges])

    [sub] = habits.subscriptions(df)

    assert sub.cadence == "monthly"
    assert sub.yearly_cost_yen == 990 * 12
    assert sub.occurrences == 4


def test_irregular_repeat_purchases_are_not_subscriptions():
    days = [jst(2026, 5, 1), jst(2026, 5, 20), jst(2026, 7, 2), jst(2026, 7, 9)]
    df = frame([p("コンビニ弁当", d, 500, store="コンビニ") for d in days])
    assert habits.subscriptions(df) == []


def test_late_night_spree_scores_as_impulse_with_reasons():
    history = [p("USB ケーブル", jst(2026, 5, d), 1000) for d in (1, 10, 20)]
    spree = [
        p("ワイヤレスイヤホン", jst(2026, 9, 26, 1, 12), 19800),
        p("イヤホンケース", jst(2026, 9, 26, 1, 21), 1280),
    ]
    df = frame(history + spree)

    found = {c.title: c for c in habits.impulse(df, exclude_keys=set())}

    earbuds = found["ワイヤレスイヤホン"]
    assert {r.code for r in earbuds.reasons} >= {"late_night", "unusual_amount"}
    assert found["イヤホンケース"].reasons[1].code == "burst"
    assert "USB ケーブル" not in found


def test_subscriptions_are_never_called_impulsive():
    charges = [p("音楽 月額", jst(2026, m, 2, 1), 1080, store="音楽 月額") for m in (5, 6, 7, 8)]
    df = frame(charges)
    assert habits.impulse(df, exclude_keys={"音楽 月額"}) == []
