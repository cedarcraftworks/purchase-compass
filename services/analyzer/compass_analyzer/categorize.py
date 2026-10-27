"""Assigns a category to every purchase, in three explainable steps:

1. the user's own choice, if they set one,
2. the keyword dictionary (fast, predictable, easy to fix by adding a word),
3. a small model trained on labelled titles, for what the dictionary misses.

The model uses character n-grams rather than words. Japanese has no spaces
between words, and character 2-3-grams capture "コーヒ", "ーヒー" and the like
without a morphological analyser (MeCab etc.), which keeps the service small.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from functools import lru_cache
from importlib import resources

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from .data.keywords import CATEGORY_KEYWORDS
from .schemas import Purchase

FALLBACK = "その他"
#: Below this probability the model's guess is not trusted.
MODEL_MIN_CONFIDENCE = 0.35


@dataclass(frozen=True)
class CategoryResult:
    category: str
    method: str  # given | keyword | model | fallback
    confidence: float
    matched: str | None = None


def match_keyword(title: str) -> tuple[str, str] | None:
    lowered = title.lower()
    for category, words in CATEGORY_KEYWORDS.items():
        for word in words:
            if word.lower() in lowered:
                return category, word
    return None


@lru_cache(maxsize=1)
def _model() -> Pipeline:
    rows = _training_rows()
    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 3), sublinear_tf=True)),
            ("clf", LogisticRegression(max_iter=2000, C=4.0)),
        ]
    )
    pipeline.fit([t for t, _ in rows], [c for _, c in rows])
    return pipeline


def _training_rows() -> list[tuple[str, str]]:
    text = resources.files("compass_analyzer.data").joinpath("training.csv").read_text(encoding="utf-8")
    return [(r["title"], r["category"]) for r in csv.DictReader(text.splitlines())]


def categorize(purchase: Purchase) -> CategoryResult:
    if purchase.category:
        return CategoryResult(purchase.category, "given", 1.0)

    hit = match_keyword(purchase.title)
    if hit:
        return CategoryResult(hit[0], "keyword", 1.0, matched=hit[1])

    model = _model()
    probabilities = model.predict_proba([purchase.title])[0]
    best = int(probabilities.argmax())
    confidence = float(probabilities[best])
    if confidence >= MODEL_MIN_CONFIDENCE:
        return CategoryResult(str(model.classes_[best]), "model", round(confidence, 3))
    return CategoryResult(FALLBACK, "fallback", round(confidence, 3))


def categorize_all(purchases: list[Purchase]) -> dict[str, CategoryResult]:
    return {p.id: categorize(p) for p in purchases}
