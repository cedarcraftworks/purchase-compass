# Purchase Compass

[![CI](https://github.com/kaisei467/purchase-compass/actions/workflows/ci.yml/badge.svg)](https://github.com/kaisei467/purchase-compass/actions/workflows/ci.yml)

**Purchase Compass brings your purchases from Amazon, Rakuten, Mercari and real-world shops into one place, tells you how you shop in plain sentences, and recommends products based on that — always saying why.**

> 日本語の概要：Amazon・楽天・メルカリ・実店舗の購入履歴をまとめて分析し、購買傾向を文章で示し、その傾向をもとに商品をおすすめするWebアプリです。おすすめには必ず理由を表示します。設計判断の詳細は [技術解説（日本語）](docs/technical-notes.md) にまとめています。

![Trends dashboard: a compass rose of spending by shop and plain-language findings](docs/images/trends.png)

## Why I built it

Shop recommendations only see what you bought *on that shop*. I buy books on Amazon, daily goods on Rakuten, second-hand clothes on Mercari and lunch at a convenience store, so no single service sees my real habits. I wanted to see my own buying patterns across all of them, and to get recommendations that explain themselves instead of a black box.

## What it does

| | |
| --- | --- |
| **Trends** | Spend by shop (the "compass"), by category, by month, and a weekday × hour heatmap. Findings such as *"「ファッション」の100%はメルカリ（中古）で買っています"* are generated only when the signal is strong enough. |
| **Recommendations** | *Buy again*: learns the interval at which you rebuy things (median, so one bulk buy does not skew it) and tells you when it is time. *For you*: fetches candidates from the Rakuten Ichiba API and ranks them by similarity to your recent purchases, naming the past purchase each one resembles. |
| **Signals** | Recurring charges hidden in a card statement (with yearly cost), and purchases that look impulsive (late at night, in a burst, unusually expensive), each with the points that made it so. |
| **Import** | Recognises Amazon's official order-history export; for everything else it guesses which column is the date, title and amount, shows a preview, and lets you fix the mapping. Re-importing a file never double-counts. |

<p>
  <img src="docs/images/recommend.png" alt="Buy-again list and recommended products with reasons" width="49%" />
  <img src="docs/images/signals.png" alt="Recurring payments and impulse-purchase candidates" width="49%" />
</p>

## Architecture

```mermaid
flowchart LR
  B[Browser<br/>React + Vite] -->|/api, same origin| N[nginx]
  N --> A[API<br/>TypeScript · Hono]
  A -->|SQL| D[(PostgreSQL)]
  A -->|HTTP JSON<br/>validated by contract| P[Analyzer<br/>Python · FastAPI<br/>pandas · scikit-learn]
  P -.->|keyword only| R[Rakuten Ichiba<br/>Item Search API]
```

- **The TypeScript API owns the data.** It imports and validates purchases, stores them, and caches analysis results per data version, so the analyzer runs once per change rather than once per page view.
- **The Python analyzer is stateless.** It receives purchases and returns results, so it can be restarted or scaled independently and needs no migrations.
- **A contract keeps the two languages honest.** The analyzer's real responses are recorded as fixtures and validated against the TypeScript schemas in CI; the API also validates every live response and answers `502` instead of rendering broken data.
- **Only a search keyword leaves the system.** Your purchase history is never sent to Rakuten or anyone else.

## Tech stack and why

| Layer | Choice | Why (and what I did not choose) |
| --- | --- | --- |
| Languages | TypeScript + Python | TS shares types between UI and API; Python has the data-analysis ecosystem. One language for everything would give up one of the two. |
| Web | React, Vite, hand-drawn SVG charts | A dashboard behind no SEO needs no SSR, so not Next.js. Three simple charts do not justify a chart library. |
| API | Hono on Node.js, zod, postgres.js | Small, typed, built on web-standard `Request`/`Response`. Express has weak typing; NestJS is heavy for this size. |
| Analyzer | FastAPI, pandas, scikit-learn | Pydantic models generate the OpenAPI document used by the contract test. Django brings an admin and ORM this service does not need. |
| Database | PostgreSQL | Aggregations, constraints and transactions; purchases are relational data. |
| Recommendations | TF-IDF (character n-grams) + cosine similarity | Works with one person's small history and can explain every result. Collaborative filtering needs other users' data; an LLM would cost money, send data out and be hard to test. |
| Tests | pytest, Node's built-in test runner | Standard tools; integration tests run against a real Postgres. |
| CI/CD | GitHub Actions, Docker, Render | CI on every push; deploy only after CI passes on `main`. |

More detail, including the trade-offs, is in [docs/technical-notes.md](docs/technical-notes.md) (Japanese).

## Getting started

Requirements: Docker. Then:

```bash
git clone https://github.com/kaisei467/purchase-compass.git
cd purchase-compass
docker compose up --build
```

Open <http://localhost:8080>. A fictional six-month purchase history (a university student) is loaded on first start. To recommend real Rakuten products, copy `.env.example` to `.env` and set `RAKUTEN_APP_ID`; without it, a bundled sample catalog is used.

To analyse **your own** history, open the **データ** tab and import files. Keep real exports in `private-data/` (git-ignored) so they can never be committed.

### Local development without Docker

```bash
# Database
docker compose up -d db

# Analyzer (Python 3.12+)
cd services/analyzer && pip install -e ".[dev]" && uvicorn compass_analyzer.main:app --reload --port 8000

# API and web (Node 22+), from the repository root
npm install
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/purchase_compass
npm run migrate -w @purchase-compass/api && npm run seed -w @purchase-compass/api
npm run dev:api      # http://localhost:3000
npm run dev:web      # http://localhost:5173
```

## Tests

```bash
cd services/analyzer && pytest                      # 35 tests: analysis rules, recommender, HTTP, contract
npm test -w @purchase-compass/api                   # 26 tests: importers, API, caching, demo mode, contract
```

The API tests need a Postgres database (`TEST_DATABASE_URL`, default `postgres://postgres:postgres@localhost:5432/purchase_compass_test`).

CI runs, in order: Python lint and tests (which regenerate the contract) → TypeScript lint, type check, tests against the fresh contract, and build → Docker image builds. See [.github/workflows](.github/workflows).

## Project layout

```
apps/
  api/            TypeScript API: import pipeline, storage, analysis cache
  web/            React app
packages/
  shared/         zod schemas shared by web and API (the TypeScript side of the contract)
services/
  analyzer/       Python service: categorisation, trends, habits, recommendations
contract/         Recorded analyzer responses and OpenAPI document, checked in CI
samples/          Demo purchase history in each shop's own export format
docs/             Technical notes, deployment, error codes
```

## Data sources and their limits

| Shop | Purchase history | Product recommendations |
| --- | --- | --- |
| Amazon | Official "Request your data" export, recognised automatically | Search links only: the product API requires an Associates account with ongoing qualifying sales |
| Rakuten | Paste the purchase-history table, or any CSV | Official Rakuten Ichiba Item Search API |
| Mercari | Paste or CSV | Search links only: no public product API |
| Shops / cards | CSV or the manual form | — |

Unofficial browser extensions that export purchase histories exist, but they handle your shop login, so this project deliberately does not depend on them.

## Roadmap

- Receipt photos (OCR) for real-world shopping
- More product sources behind the existing `ProductSource` interface
- Measure recommendation quality from clicks

## License

MIT
