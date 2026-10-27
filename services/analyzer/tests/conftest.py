from __future__ import annotations

import itertools
from datetime import datetime, timedelta, timezone

import pytest

from compass_analyzer.frame import build_frame
from compass_analyzer.schemas import Purchase

JST = timezone(timedelta(hours=9))
AS_OF = datetime(2026, 10, 20, 12, 0, tzinfo=JST)
_ids = itertools.count(1)


def p(title: str, when: datetime, amount: int = 1000, source: str = "amazon", **kw) -> Purchase:
    return Purchase(id=f"p{next(_ids)}", source=source, ordered_at=when, title=title, amount_yen=amount, **kw)


def jst(y: int, m: int, d: int, h: int = 12, minute: int = 0) -> datetime:
    return datetime(y, m, d, h, minute, tzinfo=JST)


def frame(purchases: list[Purchase]):
    return build_frame(purchases, "Asia/Tokyo")


@pytest.fixture
def as_of() -> datetime:
    return AS_OF
