from datetime import timedelta

from conftest import frame, jst, p

from compass_analyzer import trends


def test_aggregates_by_source_and_category():
    df = frame(
        [
            p("技術書 入門", jst(2026, 5, 1), 3000, source="amazon"),
            p("古着 パーカー", jst(2026, 5, 2), 2000, source="mercari"),
            p("コーヒー豆", jst(2026, 5, 3), 1000, source="rakuten"),
        ]
    )
    sources = {s.source: s for s in trends.by_source(df)}
    assert sources["amazon"].share == 0.5
    assert [c.category for c in trends.by_category(df)] == ["本・マンガ", "ファッション", "飲料"]
    assert trends.summary(df).average_yen == 2000


def test_heatmap_uses_local_time_not_utc():
    df = frame([p("本", jst(2026, 5, 4, 23, 30))])  # Monday 23:30 JST = Monday 14:30 UTC
    [cell] = trends.heatmap(df)
    assert (cell.weekday, cell.hour) == (0, 23)


def test_finds_a_night_owl(as_of):
    df = frame([p("本", jst(2026, 6, d, 23)) for d in range(1, 5)] + [p("本", jst(2026, 6, 9, 12))])
    texts = [f.text for f in trends.findings(df, as_of)]
    assert any("深夜" in t and "80%" in t for t in texts)


def test_finds_where_each_category_is_bought(as_of):
    books = [p("技術書 入門", jst(2026, 6, d), source="amazon") for d in (1, 2, 3, 4)]
    fashion = [p("古着 シャツ", jst(2026, 6, d), source="mercari") for d in (5, 6, 7)]
    findings = trends.findings(frame(books + fashion), as_of)
    texts = [f.text for f in findings]
    assert "「本・マンガ」は100%をAmazonで買っています。" in texts
    assert any(f.kind == "secondhand" and "ファッション" in f.text for f in findings)


def test_spots_a_category_that_grew_recently(as_of):
    before = [p("技術書 入門", as_of - timedelta(days=45), 1000)]
    recent = [p("技術書 実践", as_of - timedelta(days=d), 1500) for d in (3, 10)]
    filler = [p("コーヒー", as_of - timedelta(days=d), 500) for d in (5, 40, 50)]
    texts = [f.text for f in trends.findings(frame(before + recent + filler), as_of)]
    assert "直近30日の「本・マンガ」への支出は、その前の30日の3.0倍です。" in texts


def test_stays_quiet_with_too_little_data(as_of):
    assert trends.findings(frame([p("本", jst(2026, 6, 1))]), as_of) == []
