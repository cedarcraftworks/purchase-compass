"""Content-based recommendations from one person's purchase history.

Why this approach: collaborative filtering ("people like you bought...")
needs many users' data, and Purchase Compass deliberately only has yours. So it
compares *product texts* instead:

1. pick what to search for: keywords from your purchases, recent ones weighted more,
2. fetch candidates from a product source (Rakuten, or the bundled catalog),
3. score each candidate by text similarity to your taste profile, drop near
   copies of what you already own, and say which past purchase it resembles.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

from .categorize import match_keyword
from .schemas import Product, RecommendResponse, SearchLink
from .sources import Candidate, ProductSource, SourceError, search_links

RECENCY_HALF_LIFE_DAYS = 90
KEYWORD_COUNT = 3
HITS_PER_KEYWORD = 10
#: A candidate this similar to something already bought is "the same thing", not a new idea.
OWNED_SIMILARITY = 0.8
#: Below this, "it resembles X" would be a stretch, so no past purchase is named.
EXPLAIN_SIMILARITY = 0.15
SKIP_CATEGORIES = {"サブスク・デジタル"}


def recency_weights(df: pd.DataFrame, as_of: datetime) -> np.ndarray:
    now = pd.Timestamp(as_of).tz_convert(df["ordered_at"].dt.tz)
    age_days = ((now - df["ordered_at"]).dt.total_seconds() / 86400).clip(lower=0)
    return (0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS)).to_numpy()


def pick_keywords(df: pd.DataFrame, as_of: datetime, n: int = KEYWORD_COUNT) -> list[str]:
    usable = df[~df["category"].isin(SKIP_CATEGORIES)]
    if usable.empty:
        return []
    # Recent purchases count more, and so does money spent: twenty 150-yen rice balls
    # say less about your taste than two technical books.
    weights = recency_weights(usable, as_of) * np.sqrt(usable["amount"].clip(lower=1).to_numpy())
    scores: dict[str, float] = defaultdict(float)
    categories_of: dict[str, str] = {}
    for title, weight in zip(usable["title"], weights, strict=True):
        hit = match_keyword(title)
        if hit and hit[0] not in SKIP_CATEGORIES:
            scores[hit[1]] += float(weight)
            categories_of[hit[1]] = hit[0]
    # One keyword per category, so the list spans your interests instead of
    # three flavours of the same drink.
    chosen: list[str] = []
    categories: set[str] = set()
    for keyword, _ in sorted(scores.items(), key=lambda kv: (-kv[1], kv[0])):
        category = categories_of[keyword]
        if category not in categories:
            chosen.append(keyword)
            categories.add(category)
        if len(chosen) == n:
            break
    return chosen


def recommend(
    df: pd.DataFrame,
    source: ProductSource,
    fallback: ProductSource,
    as_of: datetime,
    limit: int,
) -> RecommendResponse:
    keywords = pick_keywords(df, as_of)
    status = "sample" if source.name == "sample" else "live"

    tagged: list[tuple[str, Candidate]] = []
    for keyword in keywords:
        try:
            found = source.search(keyword, HITS_PER_KEYWORD)
        except SourceError:
            status = "fallback"
            found = fallback.search(keyword, HITS_PER_KEYWORD)
        tagged.extend((keyword, c) for c in found)

    products = _rank(df, tagged, as_of, limit)
    links = [SearchLink(site=site, keyword=k, url=url) for k in keywords for site, url in search_links(k)]
    return RecommendResponse(keywords=keywords, products=products, search_links=links, source_status=status)


def _rank(
    df: pd.DataFrame, tagged: list[tuple[str, Candidate]], as_of: datetime, limit: int
) -> list[Product]:
    seen: set[str] = set()
    unique = []
    for keyword, c in tagged:
        if c.url not in seen:
            seen.add(c.url)
            unique.append((keyword, c))
    if not unique or df.empty:
        return []

    past_titles = df["title"].tolist()
    vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 3), sublinear_tf=True)
    vectorizer.fit(past_titles + [c.title for _, c in unique])
    past = vectorizer.transform(past_titles)  # rows are L2-normalised, so dot product = cosine
    candidates = vectorizer.transform([c.title for _, c in unique])

    weights = recency_weights(df, as_of)
    taste = np.asarray(past.T @ weights).ravel()
    norm = np.linalg.norm(taste)
    taste = taste / norm if norm else taste

    to_taste = np.asarray(candidates @ taste).ravel()
    to_past = (candidates @ past.T).toarray()

    scored = []
    for i, (keyword, c) in enumerate(unique):
        nearest = int(to_past[i].argmax())
        if to_past[i, nearest] >= OWNED_SIMILARITY:
            continue
        because = past_titles[nearest] if to_past[i, nearest] >= EXPLAIN_SIMILARITY else None
        reason = _reason(keyword, c.title, because)
        scored.append(
            Product(
                title=c.title,
                price_yen=c.price_yen,
                url=c.url,
                image_url=c.image_url,
                shop=c.shop,
                origin=c.origin,
                score=round(float(to_taste[i]), 4),
                keyword=keyword,
                reason=reason,
                because_of=because,
            )
        )
    return _interleave(scored, limit)


def _reason(keyword: str, title: str, because: str | None) -> str:
    hit = match_keyword(keyword)
    topic = f"「{keyword}」" if keyword in title or not hit else f"「{hit[0]}」カテゴリ"
    tail = f"過去に買った「{because}」に近い商品です。" if because else "好みの傾向に近い商品です。"
    return f"よく買う{topic}から。{tail}"


def _interleave(products: list[Product], limit: int) -> list[Product]:
    """Best first within each keyword, then take turns, so one keyword cannot fill the list."""
    by_keyword: dict[str, list[Product]] = defaultdict(list)
    for p in sorted(products, key=lambda p: p.score, reverse=True):
        by_keyword[p.keyword].append(p)
    queues = sorted(by_keyword.values(), key=lambda q: q[0].score, reverse=True)
    out: list[Product] = []
    for round_ in range(max((len(q) for q in queues), default=0)):
        for q in queues:
            if round_ < len(q) and len(out) < limit:
                out.append(q[round_])
    return out
