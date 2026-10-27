"""End-to-end tests over HTTP, plus the contract shared with the TypeScript API.

The contract files under /contract are generated here and checked in. The
TypeScript side validates them against its own schemas, so a change in one
language that the other does not expect fails CI instead of production.
Regenerate after an intended change:  UPDATE_CONTRACT=1 pytest
"""

import json
import os
from datetime import timedelta
from pathlib import Path

from conftest import AS_OF, jst
from fastapi.testclient import TestClient

from compass_analyzer.main import Settings, create_app
from compass_analyzer.sources import SampleCatalogSource

CONTRACT = Path(__file__).resolve().parents[3] / "contract"
UPDATE = os.getenv("UPDATE_CONTRACT") == "1"

client = TestClient(create_app(Settings(), SampleCatalogSource()))


def body(purchases, **extra):
    return {"purchases": purchases, "asOf": AS_OF.isoformat(), **extra}


def purchase(i, title, when, amount, source="amazon", store=None):
    return {
        "id": f"p{i}",
        "source": source,
        "orderedAt": when.isoformat(),
        "title": title,
        "amountYen": amount,
        "quantity": 1,
        "store": store,
    }


EXAMPLE = [
    *[
        purchase(i, "スペシャルティコーヒー豆 500g", AS_OF - timedelta(days=30 * i + 2), 2380, "rakuten")
        for i in range(1, 5)
    ],
    *[purchase(10 + i, "技術書 入門", jst(2026, 9, i + 1, 23, 30), 3080) for i in range(4)],
    *[purchase(50 + i, "USB-C ケーブル 1m", jst(2026, 5 + i, 10, 13), 980) for i in range(3)],
    purchase(20, "ワイヤレスイヤホン ノイズキャンセリング", jst(2026, 9, 26, 1, 12), 19800),
    purchase(21, "イヤホンケース", jst(2026, 9, 26, 1, 21), 1280),
    *[purchase(30 + i, "古着 パーカー", jst(2026, 6 + i, 3, 18), 2500, "mercari") for i in range(3)],
    *[
        purchase(40 + i, "動画配信 月額", jst(2026, 5 + i, 2, 4), 990, "other", "動画配信 月額")
        for i in range(5)
    ],
]


def shape(value):
    """The structure of a JSON value (keys and types), ignoring the values themselves.

    Scores and confidences can shift slightly between library versions; what the
    other side depends on is which fields exist and what type they are.
    """
    if isinstance(value, dict):
        return {k: shape(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [shape(value[0])] if value else []
    if isinstance(value, bool) or value is None:
        return type(value).__name__
    return "number" if isinstance(value, int | float) else type(value).__name__


def check_contract(name: str, data: dict) -> None:
    path = CONTRACT / "fixtures" / f"{name}.json"
    if UPDATE or not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    stored = json.loads(path.read_text(encoding="utf-8"))
    assert shape(stored) == shape(data), f"{path.name} is stale: run UPDATE_CONTRACT=1 pytest"


def test_health():
    assert client.get("/healthz").json() == {"status": "ok", "productSource": "sample"}


def test_insights_end_to_end():
    res = client.post("/v1/insights", json=body(EXAMPLE))
    assert res.status_code == 200
    data = res.json()
    assert data["summary"]["purchaseCount"] == len(EXAMPLE)
    assert data["subscriptions"][0]["cadence"] == "monthly"
    assert any(r["title"].startswith("スペシャルティコーヒー豆") for r in data["replenishment"])
    assert any(c["title"].startswith("ワイヤレスイヤホン") for c in data["impulse"])
    assert data["findings"], "expected at least one finding"
    check_contract("insights.response", data)


def test_empty_history_is_fine():
    data = client.post("/v1/insights", json=body([])).json()
    assert data["summary"]["purchaseCount"] == 0
    assert data["findings"] == []


def test_recommendations_end_to_end():
    res = client.post("/v1/recommendations", json=body(EXAMPLE, limit=6))
    assert res.status_code == 200
    data = res.json()
    assert data["sourceStatus"] == "sample"
    assert data["keywords"]
    assert 0 < len(data["products"]) <= 6
    check_contract("recommendations.response", data)


def test_rejects_invalid_input_with_details():
    res = client.post("/v1/insights", json=body([{**EXAMPLE[0], "amountYen": -1}]))
    assert res.status_code == 422


def test_openapi_document_is_up_to_date():
    check_contract("openapi", client.get("/openapi.json").json())
