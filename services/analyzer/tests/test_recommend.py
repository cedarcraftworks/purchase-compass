from datetime import timedelta

from conftest import frame, p

from compass_analyzer.recommend import pick_keywords, recommend
from compass_analyzer.sources import Candidate, SampleCatalogSource, SourceError


class FakeSource:
    name = "rakuten"

    def __init__(self, items: dict[str, list[Candidate]] | None = None, fail: bool = False):
        self.items = items or {}
        self.fail = fail
        self.calls: list[str] = []

    def search(self, keyword, hits):
        self.calls.append(keyword)
        if self.fail:
            raise SourceError("down")
        return self.items.get(keyword, [])[:hits]


def c(title: str, url: str) -> Candidate:
    return Candidate(title, 1000, url, None, "shop", "rakuten")


def test_keywords_prefer_recent_purchases(as_of):
    old = [p("コーヒー豆", as_of - timedelta(days=300)) for _ in range(3)]
    new = [p("ワイヤレスイヤホン", as_of - timedelta(days=5))]
    assert pick_keywords(frame(old + new), as_of)[0] == "イヤホン"


def test_ranks_by_similarity_and_explains_why(as_of):
    df = frame([p("スペシャルティコーヒー豆 ブラジル 中煎り", as_of - timedelta(days=d)) for d in (5, 35)])
    source = FakeSource(
        {
            "コーヒー": [
                c("コーヒー豆 エチオピア 中煎り 500g", "https://x/1"),
                c("コーヒーカップ 陶器", "https://x/2"),
            ]
        }
    )

    result = recommend(df, source, SampleCatalogSource(), as_of, limit=5)

    assert result.source_status == "live"
    assert [pr.url for pr in result.products] == ["https://x/1", "https://x/2"]
    top = result.products[0]
    assert top.because_of == "スペシャルティコーヒー豆 ブラジル 中煎り"
    assert "コーヒー" in top.reason


def test_skips_what_you_already_own(as_of):
    df = frame([p("ホエイプロテイン チョコ味 1kg", as_of - timedelta(days=3))])
    source = FakeSource(
        {
            "プロテイン": [
                c("ホエイプロテイン チョコ味 1kg", "https://x/same"),
                c("ソイプロテイン 抹茶味", "https://x/new"),
            ]
        }
    )
    urls = [pr.url for pr in recommend(df, source, SampleCatalogSource(), as_of, 5).products]
    assert urls == ["https://x/new"]


def test_falls_back_to_the_catalog_when_the_shop_api_fails(as_of):
    df = frame([p("コーヒー豆 500g", as_of - timedelta(days=3))])
    result = recommend(df, FakeSource(fail=True), SampleCatalogSource(), as_of, 5)
    assert result.source_status == "fallback"
    assert result.products and all(pr.origin == "sample" for pr in result.products)


def test_offers_search_links_for_shops_without_an_api(as_of):
    df = frame([p("コーヒー豆", as_of - timedelta(days=3))])
    result = recommend(df, SampleCatalogSource(), SampleCatalogSource(), as_of, 5)
    sites = {link.site for link in result.search_links}
    assert sites == {"amazon", "rakuten", "mercari"}
    assert result.source_status == "sample"


def test_one_keyword_cannot_fill_the_whole_list(as_of):
    df = frame(
        [p("コーヒー豆", as_of - timedelta(days=1)), p("ワイヤレスイヤホン", as_of - timedelta(days=2))]
    )
    source = FakeSource(
        {
            "コーヒー": [c(f"コーヒー豆 {i}", f"https://c/{i}") for i in range(6)],
            "イヤホン": [c(f"イヤホン {i}", f"https://e/{i}") for i in range(6)],
        }
    )
    products = recommend(df, source, SampleCatalogSource(), as_of, limit=4).products
    assert sorted(pr.keyword for pr in products) == ["イヤホン", "イヤホン", "コーヒー", "コーヒー"]


def test_keywords_cover_different_categories(as_of):
    drinks = [
        p(t, as_of - timedelta(days=2), 3000) for t in ("コーヒー豆", "紅茶 ティーバッグ", "プロテイン")
    ]
    books = [p("技術書 入門", as_of - timedelta(days=3), 2000)]
    keywords = pick_keywords(frame(drinks + books), as_of)
    assert len(keywords) == 2  # one drink keyword and one book keyword, not three drinks
    assert "技術書" in keywords
