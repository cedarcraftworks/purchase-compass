"""Where recommended products come from.

Each source is a small class with one method, `search(keyword, hits)`, so a
new shop (Yahoo!ショッピング, or Amazon once its API terms can be met) is one
new class, not a change to the recommender.

- RakutenSource: the official Rakuten Ichiba item search API.
- SampleCatalogSource: a bundled catalog, used without an API key (CI, an
  interviewer's laptop, the public demo) and as a fallback when Rakuten fails.
- Amazon and Mercari are linked to as searches only: Amazon's product API
  requires an Associates account with ongoing qualifying sales, and Mercari
  has no public product API. Scraping either would break their terms.
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources
from typing import Literal, Protocol

from .categorize import match_keyword


@dataclass(frozen=True)
class Candidate:
    title: str
    price_yen: int | None
    url: str
    image_url: str | None
    shop: str | None
    origin: Literal["rakuten", "sample"]


class SourceError(Exception):
    """The upstream shop could not answer; callers fall back instead of failing."""


class ProductSource(Protocol):
    name: Literal["rakuten", "sample"]

    def search(self, keyword: str, hits: int) -> list[Candidate]: ...


# ---- bundled catalog ------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _catalog() -> list[dict]:
    text = (
        resources.files("compass_analyzer.data").joinpath("sample_catalog.json").read_text(encoding="utf-8")
    )
    return json.loads(text)


class SampleCatalogSource:
    name: Literal["sample"] = "sample"

    def search(self, keyword: str, hits: int) -> list[Candidate]:
        hit = match_keyword(keyword)
        category = hit[0] if hit else None
        matches = [
            item
            for item in _catalog()
            if keyword.lower() in item["title"].lower() or (category and item["category"] == category)
        ]
        return [
            Candidate(item["title"], item["priceYen"], item["url"], None, item["shop"], "sample")
            for item in matches[:hits]
        ]


# ---- Rakuten --------------------------------------------------------------------------------

Fetch = Callable[[str, float], bytes]


def _http_get(url: str, timeout: float) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "purchase-compass-analyzer/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


class RakutenSource:
    """Calls the Rakuten Ichiba item search API.

    Only the search keyword leaves the service; the purchase history never does.
    Results are cached for a few minutes because the API is rate limited and
    the same keywords repeat on every dashboard load.
    """

    name: Literal["rakuten"] = "rakuten"

    def __init__(
        self,
        app_id: str,
        endpoint: str,
        access_key: str | None = None,
        timeout: float = 3.0,
        cache_ttl: float = 600.0,
        fetch: Fetch = _http_get,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._app_id = app_id
        self._endpoint = endpoint
        self._access_key = access_key
        self._timeout = timeout
        self._ttl = cache_ttl
        self._fetch = fetch
        self._clock = clock
        self._cache: dict[tuple[str, int], tuple[float, list[Candidate]]] = {}

    def search(self, keyword: str, hits: int) -> list[Candidate]:
        cache_key = (keyword, hits)
        cached = self._cache.get(cache_key)
        if cached and self._clock() - cached[0] < self._ttl:
            return cached[1]

        params = {
            "applicationId": self._app_id,
            "keyword": keyword,
            "hits": str(hits),
            "format": "json",
            "formatVersion": "2",
            "availability": "1",
        }
        if self._access_key:
            params["accessKey"] = self._access_key
        url = f"{self._endpoint}?{urllib.parse.urlencode(params)}"
        try:
            payload = json.loads(self._fetch(url, self._timeout))
        except Exception as exc:  # network error, timeout, non-JSON body, HTTP error
            raise SourceError(f"Rakuten request failed: {exc.__class__.__name__}") from exc

        items = parse_rakuten_items(payload)
        self._cache[cache_key] = (self._clock(), items)
        return items


def parse_rakuten_items(payload: dict) -> list[Candidate]:
    """Accepts both response shapes: formatVersion=2 (flat) and 1 (wrapped in "Item")."""
    if "error" in payload:
        raise SourceError(f"Rakuten error: {payload.get('error')}")
    out = []
    for raw in payload.get("Items", []):
        item = raw.get("Item", raw)
        images = item.get("mediumImageUrls") or []
        first = images[0] if images else None
        image = first.get("imageUrl") if isinstance(first, dict) else first
        if not item.get("itemName") or not item.get("itemUrl"):
            continue
        out.append(
            Candidate(
                title=str(item["itemName"])[:200],
                price_yen=int(item["itemPrice"]) if item.get("itemPrice") is not None else None,
                url=str(item["itemUrl"]),
                image_url=image,
                shop=item.get("shopName"),
                origin="rakuten",
            )
        )
    return out


# ---- search links ---------------------------------------------------------------------------


def search_links(keyword: str) -> list[tuple[str, str]]:
    q = urllib.parse.quote(keyword)
    return [
        ("amazon", f"https://www.amazon.co.jp/s?k={q}"),
        ("rakuten", f"https://search.rakuten.co.jp/search/mall/{q}/"),
        ("mercari", f"https://jp.mercari.com/search?keyword={q}"),
    ]
