from conftest import jst, p

from compass_analyzer.categorize import categorize, match_keyword


def test_keyword_match_reports_the_word_that_matched():
    result = categorize(p("スペシャルティコーヒー豆 500g", jst(2026, 5, 1)))
    assert (result.category, result.method, result.matched) == ("飲料", "keyword", "コーヒー")


def test_more_specific_categories_win_over_generic_words():
    # 詰め替え is a household word, but a shampoo refill is beauty & health.
    assert match_keyword("シャンプー 詰め替え 大容量") == ("美容・健康", "シャンプー")


def test_keywords_do_not_hide_inside_unrelated_words():
    # "パン" must not turn trousers into bread.
    assert categorize(p("ワイドパンツ 黒", jst(2026, 5, 1))).category == "ファッション"


def test_the_users_own_choice_always_wins():
    result = categorize(p("コーヒー豆", jst(2026, 5, 1), category="食品"))
    assert (result.category, result.method) == ("食品", "given")


def test_model_handles_titles_without_any_keyword():
    result = categorize(p("北海道産 玉ねぎ 10kg", jst(2026, 5, 1)))
    assert result.method == "model"
    assert result.category == "食品"


def test_unrecognisable_titles_fall_back_instead_of_guessing():
    result = categorize(p("XQ-7 Z", jst(2026, 5, 1)))
    assert result.category == "その他"
    assert result.method == "fallback"
