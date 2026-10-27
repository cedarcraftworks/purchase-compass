"""Converts the request payload into one pandas DataFrame that every analysis reads."""

from __future__ import annotations

import re
import unicodedata

import pandas as pd

from .categorize import categorize_all
from .schemas import Purchase

COLUMNS = [
    "id",
    "source",
    "ordered_at",
    "title",
    "amount",
    "quantity",
    "store",
    "category",
    "category_method",
    "confidence",
    "item_key",
]


def normalize_title(title: str) -> str:
    """A key that groups repeat purchases of "the same thing".

    NFKC folds full-width letters and digits (ＡＢＣ１ → ABC1); bracketed notes such
    as 【公式】 or (2個セット) are dropped because they vary between listings of
    the same product.
    """
    text = unicodedata.normalize("NFKC", title).lower()
    text = re.sub(r"[【\[(（〔].*?[】\])）〕]", " ", text)
    text = re.sub(r"[\s・/／,、。!！?？]+", " ", text)
    return text.strip()


def build_frame(purchases: list[Purchase], tz: str) -> pd.DataFrame:
    if not purchases:
        return pd.DataFrame(columns=COLUMNS)
    categories = categorize_all(purchases)
    rows = []
    for p in purchases:
        c = categories[p.id]
        rows.append(
            {
                "id": p.id,
                "source": p.source,
                "ordered_at": p.ordered_at,
                "title": p.title,
                "amount": p.amount_yen,
                "quantity": p.quantity,
                "store": p.store,
                "category": c.category,
                "category_method": c.method,
                "confidence": c.confidence,
                "item_key": normalize_title(p.title),
            }
        )
    df = pd.DataFrame(rows, columns=COLUMNS)
    # All habits ("22時以降に買う") are about the user's local clock, not UTC.
    df["ordered_at"] = pd.to_datetime(df["ordered_at"], utc=True).dt.tz_convert(tz)
    return df.sort_values("ordered_at", kind="stable").reset_index(drop=True)
