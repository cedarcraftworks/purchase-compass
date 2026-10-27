# Deploying the public demo

The demo runs as three Docker services and a PostgreSQL database. `render.yaml`
describes them for [Render](https://render.com); any host that runs Docker
images works the same way. Check the host's current plans and limits before
creating services.

## One-time setup

1. In Render, create a **Blueprint** from this repository. It creates the
   analyzer, API, web services and the database from `render.yaml`.
2. Fill in the variables marked `sync: false`:
   - `purchase-compass-api` → `ANALYZER_URL` = the analyzer's public URL
   - `purchase-compass-web` → `API_URL` = the API's public URL
   - `purchase-compass-analyzer` → `RAKUTEN_APP_ID` (optional)
3. For each service, copy its **Deploy Hook** URL and add it to the GitHub
   repository as a secret (Settings → Secrets and variables → Actions):
   `RENDER_DEPLOY_HOOK_ANALYZER`, `RENDER_DEPLOY_HOOK_API`, `RENDER_DEPLOY_HOOK_WEB`.

## How a deploy happens

`autoDeploy` is off on purpose. After a push to `main`, the **CI** workflow
runs; only if it succeeds does the **Deploy** workflow call the three hooks,
in the order analyzer → API → web, so a new web app never talks to an old API.
Until the secrets exist, the Deploy workflow skips with a notice.

The API container runs migrations on start (guarded by a Postgres advisory
lock, so parallel replicas are safe) and loads the demo data when
`SEED_ON_START=true`. `DEMO_MODE=true` makes the demo read-only.
