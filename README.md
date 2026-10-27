# Purchase Compass

**English** | [日本語](README.ja.md)

[![CI](https://github.com/kaisei467/purchase-compass/actions/workflows/ci.yml/badge.svg)](https://github.com/kaisei467/purchase-compass/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-2f6f5e)](https://kaisei467.github.io/purchase-compass/)
![TypeScript](https://img.shields.io/badge/TypeScript-API%20%26%20web-3178c6)
![Python](https://img.shields.io/badge/Python-analysis-3776ab)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

**Your purchases from Amazon, Rakuten, Mercari and real shops in one place: how you shop, written in plain sentences, and recommendations that always say why.**

**[▶ Open the live demo](https://kaisei467.github.io/purchase-compass/)** — no sign-up; it shows six months of a fictional student's purchases.

![A 20-second tour: spending compass, findings, buy-again list, recommendations with reasons, recurring charges](docs/images/tour.gif)

## Highlights

- **Two languages, one contract.** The UI and API are TypeScript; the analysis is Python. The analyzer's real responses are recorded and validated against the TypeScript schemas in CI, so a field renamed on one side fails the build, not the dashboard.
- **Explainable by design.** Every finding, recommendation and warning shows its reason: *"you usually rebuy this every 24 days; it has been 6, so about 18 to go"*, *"late at night +30, 4.8× your usual spend +30"*. No black box, so every rule is also unit-tested.
- **Built like a team project.** 61 automated tests against a real PostgreSQL, a CI pipeline (Python → contract → TypeScript → Docker) and deployment gated on green CI.

## For reviewers: a 3-minute tour

1. **Try it**: open the [live demo](https://kaisei467.github.io/purchase-compass/) and switch between 傾向 (trends), おすすめ (recommendations) and 気づき (signals).
2. **See the shape**: the [architecture](#architecture) diagram and the reasons behind each [technology choice](#tech-stack-and-why).
3. **Read the core logic**: [`recommend.py`](services/analyzer/compass_analyzer/recommend.py) (how products are picked and explained) and [`importers/`](apps/api/src/importers/) (turning five shops' formats into one).
4. **Check the safety nets**: the [contract test](apps/api/test/contract.test.ts), the [import de-duplication and analysis cache](apps/api/src/repository.ts) and the [CI workflow](.github/workflows/ci.yml).

## Contents

[Why I built it](#why-i-built-it) · [What it does](#what-it-does) · [Architecture](#architecture) · [Tech stack and why](#tech-stack-and-why) · [Engineering challenges](#engineering-challenges) · [Getting started](#getting-started) · [Tests and CI/CD](#tests-and-cicd) · [Data sources and their limits](#data-sources-and-their-limits) · [Roadmap](#roadmap)

## Why I built it

I wanted to know what I actually buy and get recommendations based on that. But every shop's recommendations only see what I bought *there*: I buy books on Amazon, daily goods on Rakuten, second-hand clothes on Mercari and lunch at a convenience store, so no single service sees my real habits. Purchase Compass collects all of it in one place, analyses the patterns, and recommends products with the reasoning shown.

## What it does

| | |
| --- | --- |
| **Trends** | Spend by shop (the "compass"), by category, by month, and a weekday × hour heatmap, plus findings in plain Japanese such as *「ファッション」の100%はメルカリ（中古）で買っています*. A finding only appears when its signal is strong enough. |
| **Recommendations** | *Buy again*: learns how often you rebuy each item (the median, so one bulk buy does not skew it) and says when it is time. *For you*: fetches candidates from the Rakuten Ichiba API and ranks them by similarity to your recent purchases, naming the past purchase each one resembles. |
| **Signals** | Recurring charges hidden in a card statement, with their yearly cost, and purchases that look impulsive (late at night, in a burst, unusually expensive), with the points behind each. |
| **Import** | Recognises Amazon's official order-history export; for any other CSV or pasted table it guesses the date, title and amount columns, shows a preview and lets you correct the mapping. Importing the same file twice never double-counts. |

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
  P -.->|search keyword only| R[Rakuten Ichiba<br/>Item Search API]
```

- **The TypeScript API owns the data.** It imports and validates purchases, stores them, and caches analysis results per data version, so the analyzer runs once per change instead of once per page view.
- **The Python analyzer is stateless.** It receives purchases and returns results, so it can be restarted or scaled on its own and never needs a migration.
- **Failures stay contained.** If Rakuten is down, recommendations fall back to a bundled catalog; if the analyzer is down or answers in an unexpected shape, the API returns `502` instead of rendering broken numbers.
- **Only a search keyword leaves the system.** The purchase history itself is never sent anywhere.

## Tech stack and why

| Layer | Choice | Why (and what I did not choose) |
| --- | --- | --- |
| Languages | TypeScript + Python | TS shares types between UI and API; Python has the data-analysis ecosystem. One language for everything would give up one of the two. |
| Web | React, Vite, hand-drawn SVG charts | A personal dashboard needs no SEO or server rendering, so not Next.js. Three simple charts do not justify a chart library. |
| API | Hono on Node.js, zod, postgres.js | Small, typed, built on web-standard `Request`/`Response`. Express has weak typing; NestJS is heavy for this size. |
| Analyzer | FastAPI, pandas, scikit-learn | Pydantic models generate the OpenAPI document the contract test uses. Django's admin and ORM are not needed here. |
| Database | PostgreSQL | Aggregations, constraints and transactions; purchases are relational data. |
| Recommendations | TF-IDF on character n-grams + cosine similarity | Works with one person's small history and can explain every result. Collaborative filtering needs other users' data; an LLM would cost money, send data out and be hard to test. |
| Tests | pytest, Node's built-in test runner | Standard tools; integration tests run against a real PostgreSQL. |
| CI/CD | GitHub Actions, Docker | CI on every push; deployment only after CI passes on `main`. |

The full reasoning, including trade-offs, is in [docs/technical-notes.md](docs/technical-notes.md) (Japanese).

## Engineering challenges

**Japanese text without a tokenizer.** Japanese has no spaces between words. Instead of adding a morphological analyser such as MeCab, categorisation and recommendations use character 2–3-grams, which capture "コーヒ" and "ーヒー" with a few lines of scikit-learn. The keyword dictionary had traps of its own: "パン" (bread) hides inside "パンツ" (trousers), so the dictionary says "食パン", and a test pins it down.

**Keeping two languages in sync.** Splitting the system gave me a new failure mode: one side renaming a field. The Python tests write the analyzer's real responses to [`contract/`](contract/); the TypeScript tests validate them with the same zod schemas the app uses at runtime; CI regenerates them on every run.

**Imports you can repeat safely.** Each purchase gets a key from its shop, time, title, amount and quantity, enforced by a unique index, and a whole file is saved in one transaction. Re-importing adds nothing; a failed import saves nothing.

**Being honest about data access.** Amazon's product API requires an Associates account with ongoing sales, and Mercari has no public product API. Rather than scrape them, the app links to their search pages, and product sources sit behind one small interface so a new one is a single class.

**A bug CI caught.** A local type-check once left compiled `.js` files next to the `.tsx` sources; Vite resolved `./App` to the stale `App.js`, and the production build broke. Lint, types and tests all passed locally, but the CI build and Docker jobs failed. I removed the files and added an ignore rule so it cannot happen again.

## Getting started

Requirements: Docker.

```bash
git clone https://github.com/kaisei467/purchase-compass.git
cd purchase-compass
docker compose up --build
```

Open <http://localhost:8080>. The fictional demo history is loaded on first start. To recommend real Rakuten products, copy `.env.example` to `.env` and set `RAKUTEN_APP_ID`; without it, a bundled sample catalog is used.

To analyse **your own** history, open the **データ** tab and import files. Keep real exports in a `private-data/` folder (git-ignored) so they can never be committed.

<details>
<summary>Local development without Docker</summary>

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

</details>

## Tests and CI/CD

```bash
cd services/analyzer && pytest            # 35 tests: analysis rules, recommender, Rakuten client, HTTP, contract
npm test -w @purchase-compass/api         # 26 tests: importers, API, caching, demo mode, contract
```

The API tests need PostgreSQL (`TEST_DATABASE_URL`, default `postgres://postgres:postgres@localhost:5432/purchase_compass_test`).

| Workflow | When | What |
| --- | --- | --- |
| [CI](.github/workflows/ci.yml) | Every push and pull request | Python lint + tests (regenerating the contract) → TypeScript lint, type check, tests against that contract, build → Docker image builds |
| [Demo](.github/workflows/pages.yml) | Push to `main` touching the web app | Builds the server-less demo and publishes it to GitHub Pages |
| [Deploy](.github/workflows/deploy.yml) | After CI succeeds on `main` | Triggers the full-stack deployment (see [docs/deploy.md](docs/deploy.md)) |

## Project layout

```
apps/
  api/            TypeScript API: import pipeline, storage, analysis cache
  web/            React app (also builds the static GitHub Pages demo)
packages/
  shared/         zod schemas shared by web and API (the TypeScript side of the contract)
services/
  analyzer/       Python service: categorisation, trends, habits, recommendations
contract/         Recorded analyzer responses and OpenAPI document, checked in CI
samples/          Demo purchase history in each shop's own export format
docs/             Technical notes (Japanese), deployment, error codes
```

## Data sources and their limits

| Shop | Purchase history | Product recommendations |
| --- | --- | --- |
| Amazon | Official "Request your data" export, recognised automatically | Search links only (the product API requires an Associates account with ongoing sales) |
| Rakuten | Paste the purchase-history table, or any CSV | Official Rakuten Ichiba Item Search API |
| Mercari | Paste or CSV | Search links only (no public product API) |
| Shops / cards | CSV or the manual form | — |

Unofficial browser extensions that export purchase histories exist, but they handle your shop login, so this project deliberately does not depend on them.

## Roadmap

- Receipt photos (OCR) for real-world shopping
- More product sources behind the existing `ProductSource` interface
- Measuring recommendation quality from clicks

## License

[MIT](LICENSE)
