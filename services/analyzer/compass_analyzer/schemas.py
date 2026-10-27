"""Request/response models. They double as the API contract: FastAPI turns them into
OpenAPI, and the TypeScript API validates every response against the same shape."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Source = Literal["amazon", "rakuten", "mercari", "store", "other"]
Category = Literal[
    "食品",
    "飲料",
    "日用品",
    "美容・健康",
    "ファッション",
    "家電・ガジェット",
    "本・マンガ",
    "ゲーム・ホビー",
    "サブスク・デジタル",
    "その他",
]
CATEGORIES: tuple[str, ...] = Category.__args__  # type: ignore[attr-defined]


class Model(BaseModel):
    """camelCase on the wire, snake_case in Python."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)


class Purchase(Model):
    id: str
    source: Source
    ordered_at: datetime = Field(description="Timezone-aware purchase time")
    title: str = Field(min_length=1, max_length=500)
    amount_yen: int = Field(ge=0, description="Total paid for this line, in yen")
    quantity: int = Field(default=1, ge=1)
    store: str | None = None
    category: Category | None = Field(default=None, description="Set when the user chose it explicitly")


class AnalyzeRequest(Model):
    purchases: list[Purchase] = Field(max_length=20_000)
    as_of: datetime | None = Field(default=None, description="Treat this as 'now' (defaults to the clock)")


class RecommendRequest(AnalyzeRequest):
    limit: int = Field(default=8, ge=1, le=30)


# ---- insights -------------------------------------------------------------------------------


class Summary(Model):
    total_yen: int
    purchase_count: int
    average_yen: int
    period_start: datetime | None
    period_end: datetime | None


class SourceTotal(Model):
    source: Source
    total_yen: int
    count: int
    share: float


class CategoryTotal(Model):
    category: Category
    total_yen: int
    count: int
    share: float


class MonthTotal(Model):
    month: str = Field(description="YYYY-MM in the analysis time zone")
    total_yen: int
    count: int


class HeatCell(Model):
    weekday: int = Field(ge=0, le=6, description="0 = Monday")
    hour: int = Field(ge=0, le=23)
    count: int


class Finding(Model):
    """One plain-language observation about the user's buying habits."""

    kind: Literal["time", "weekday", "category_trend", "site_preference", "secondhand", "basket"]
    text: str
    value: float | None = None


class Categorized(Model):
    purchase_id: str
    category: Category
    method: Literal["given", "keyword", "model", "fallback"]
    confidence: float


class Replenishment(Model):
    item_key: str
    title: str
    category: Category
    times_bought: int
    median_interval_days: float
    last_purchased_at: datetime
    days_since: float
    status: Literal["due", "soon", "ok"]
    reason: str


class ImpulseReason(Model):
    code: Literal["late_night", "burst", "unusual_amount", "new_category"]
    label: str
    points: int


class ImpulseCandidate(Model):
    purchase_id: str
    title: str
    amount_yen: int
    ordered_at: datetime
    score: int
    reasons: list[ImpulseReason]


class Subscription(Model):
    key: str
    title: str
    amount_yen: int
    cadence: Literal["monthly", "yearly"]
    occurrences: int
    last_charged_at: datetime
    next_expected_at: datetime
    yearly_cost_yen: int
    reason: str


class InsightsResponse(Model):
    summary: Summary
    by_source: list[SourceTotal]
    by_category: list[CategoryTotal]
    monthly: list[MonthTotal]
    heatmap: list[HeatCell]
    findings: list[Finding]
    categorized: list[Categorized]
    replenishment: list[Replenishment]
    impulse: list[ImpulseCandidate]
    subscriptions: list[Subscription]


# ---- recommendations ------------------------------------------------------------------------


class Product(Model):
    title: str
    price_yen: int | None
    url: str
    image_url: str | None = None
    shop: str | None = None
    origin: Literal["rakuten", "sample"]
    score: float
    keyword: str
    reason: str
    because_of: str | None = Field(default=None, description="The past purchase this one resembles most")


class SearchLink(Model):
    site: Literal["amazon", "rakuten", "mercari"]
    keyword: str
    url: str


class RecommendResponse(Model):
    keywords: list[str]
    products: list[Product]
    search_links: list[SearchLink]
    source_status: Literal["live", "fallback", "sample"] = Field(
        description="live = Rakuten API answered; fallback = it failed and samples were used; "
        "sample = no API key configured"
    )
