import { serve } from "@hono/node-server";
import { createAnalyzerClient } from "./analyzer-client.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { createLogger } from "./logger.js";
import { createRepository } from "./repository.js";

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL, { service: "purchase-compass-api" });
const sql = createDb(config.DATABASE_URL, config.DB_POOL_MAX);

const app = createApp({
  sql,
  repo: createRepository(sql),
  analyzer: createAnalyzerClient({ baseUrl: config.ANALYZER_URL, timeoutMs: config.ANALYZER_TIMEOUT_MS }),
  log,
  corsOrigin: config.CORS_ORIGIN,
  demoMode: config.DEMO_MODE,
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) =>
  log.info("listening", { port: info.port, demoMode: config.DEMO_MODE }),
);

// Graceful shutdown: finish in-flight requests before closing the pool (rolling deploys).
async function shutdown(signal: string) {
  log.info("shutting down", { signal });
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close();
  await sql.end({ timeout: 5 });
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
