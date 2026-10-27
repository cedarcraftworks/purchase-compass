import json
from urllib.parse import parse_qs, urlparse

import pytest

from compass_analyzer.sources import RakutenSource, SourceError, parse_rakuten_items

# Recorded shape of a Rakuten response (formatVersion=2), trimmed to the fields we use.
RECORDED = {
    "count": 2,
    "Items": [
        {
            "itemName": "コーヒー豆 エチオピア 200g",
            "itemPrice": 1980,
            "itemUrl": "https://item.rakuten.co.jp/a/1/",
            "shopName": "珈琲店",
            "mediumImageUrls": ["https://thumbnail.image.rakuten.co.jp/a.jpg"],
        },
        {"itemName": "名前だけでURLが無い商品", "itemPrice": 100},
    ],
}


def test_parses_both_response_formats():
    v2 = parse_rakuten_items(RECORDED)
    v1 = parse_rakuten_items(
        {
            "Items": [
                {"Item": {**RECORDED["Items"][0], "mediumImageUrls": [{"imageUrl": "https://img/a.jpg"}]}}
            ]
        }
    )
    assert [i.title for i in v2] == ["コーヒー豆 エチオピア 200g"]  # the incomplete item is skipped
    assert v2[0].image_url == "https://thumbnail.image.rakuten.co.jp/a.jpg"
    assert v1[0].image_url == "https://img/a.jpg"


def test_sends_only_the_keyword_and_caches_results():
    urls: list[str] = []

    def fetch(url, timeout):
        urls.append(url)
        return json.dumps(RECORDED).encode()

    now = [0.0]
    source = RakutenSource("app-id", "https://api.example/search", fetch=fetch, clock=lambda: now[0])
    source.search("コーヒー", 5)
    source.search("コーヒー", 5)
    assert len(urls) == 1
    query = parse_qs(urlparse(urls[0]).query)
    assert query["keyword"] == ["コーヒー"]
    assert set(query) == {"applicationId", "keyword", "hits", "format", "formatVersion", "availability"}

    now[0] = 601  # past the cache TTL
    source.search("コーヒー", 5)
    assert len(urls) == 2


def test_turns_any_failure_into_source_error():
    def broken(url, timeout):
        raise TimeoutError

    with pytest.raises(SourceError):
        RakutenSource("app-id", "https://api.example/search", fetch=broken).search("x", 1)
    with pytest.raises(SourceError):
        parse_rakuten_items({"error": "wrong_parameter"})
