"""HTTP surface of the analyzer.

The service is stateless: it receives purchases, returns results and stores
nothing. The TypeScript API owns the database, so this service can be scaled
out, restarted or replaced without any data migration.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import FastAPI

from . import habits, trends
from .frame import build_frame
from .recommend import recommend
from .schemas import AnalyzeRequest, Categorized, InsightsResponse, RecommendRequest, RecommendResponse
from .sources import ProductSource, RakutenSource, SampleCatalogSource

DEFAULT_RAKUTEN_ENDPOINT = "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601"


@dataclass(frozen=True)
class Settings:
    timezone: str = "Asia/Tokyo"
    rakuten_app_id: str | None = None
    rakuten_access_key: str | None = None
    rakuten_endpoint: str = DEFAULT_RAKUTEN_ENDPOINT

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            timezone=os.getenv("ANALYSIS_TIMEZONE", "Asia/Tokyo"),
            rakuten_app_id=os.getenv("RAKUTEN_APP_ID") or None,
            rakuten_access_key=os.getenv("RAKUTEN_ACCESS_KEY") or None,
            rakuten_endpoint=os.getenv("RAKUTEN_ENDPOINT", DEFAULT_RAKUTEN_ENDPOINT),
        )


def default_source(settings: Settings) -> ProductSource:
    if settings.rakuten_app_id:
        return RakutenSource(settings.rakuten_app_id, settings.rakuten_endpoint, settings.rakuten_access_key)
    return SampleCatalogSource()


def create_app(settings: Settings | None = None, source: ProductSource | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    product_source = source or default_source(settings)
    fallback = SampleCatalogSource()

    app = FastAPI(
        title="Purchase Compass Analyzer",
        version="0.1.0",
        description="Turns purchase history into trends, findings and recommendations.",
    )

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok", "productSource": product_source.name}

    @app.post("/v1/insights", response_model=InsightsResponse, response_model_by_alias=True)
    def insights(body: AnalyzeRequest) -> InsightsResponse:
        as_of = body.as_of or datetime.now(UTC)
        df = build_frame(body.purchases, settings.timezone)
        subs = habits.subscriptions(df)
        sub_keys = {s.key for s in subs}
        sub_items = set(df.loc[habits.group_key(df).isin(sub_keys), "item_key"]) if not df.empty else set()
        return InsightsResponse(
            summary=trends.summary(df),
            by_source=trends.by_source(df),
            by_category=trends.by_category(df),
            monthly=trends.monthly(df),
            heatmap=trends.heatmap(df),
            findings=trends.findings(df, as_of),
            categorized=[
                Categorized(
                    purchase_id=r.id, category=r.category, method=r.category_method, confidence=r.confidence
                )
                for r in df.itertuples()
            ],
            replenishment=habits.replenishment(df, as_of, exclude_keys=sub_items),
            impulse=habits.impulse(df, exclude_keys=sub_keys),
            subscriptions=subs,
        )

    @app.post("/v1/recommendations", response_model=RecommendResponse, response_model_by_alias=True)
    def recommendations(body: RecommendRequest) -> RecommendResponse:
        as_of = body.as_of or datetime.now(UTC)
        df = build_frame(body.purchases, settings.timezone)
        return recommend(df, product_source, fallback, as_of, body.limit)

    return app


app = create_app()
