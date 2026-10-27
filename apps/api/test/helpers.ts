import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyzerClient } from "../src/analyzer-client.js";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db.js";
import { createLogger } from "../src/logger.js";
import { migrate } from "../src/migrator.js";
import { createRepository } from "../src/repository.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/purchase_compass_test";

/** Responses recorded from the real analyzer (see services/analyzer/tests/test_api.py). */
export const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(ROOT, "contract/fixtures", `${name}.json`), "utf8"));

/**
 * A stand-in for the Python service, so these tests exercise the API on its
 * own. The fixtures it returns are the analyzer's real output, which keeps
 * the stand-in honest.
 */
export function fakeAnalyzer() {
  const calls: string[] = [];
  let mode: "ok" | "down" | "garbage" = "ok";
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (mode === "down") throw new TypeError("fetch failed");
    if (mode === "garbage") return Response.json({ unexpected: true });
    const name = url.pathname.endsWith("insights") ? "insights.response" : "recommendations.response";
    return Response.json(fixture(name));
  };
  return {
    calls,
    setMode: (m: typeof mode) => {
      mode = m;
    },
    client: createAnalyzerClient({ baseUrl: "http://analyzer.test", timeoutMs: 1000, fetch: fetchImpl }),
  };
}

export async function createHarness(opts: { demoMode?: boolean } = {}) {
  const sql = createDb(TEST_DATABASE_URL, 5);
  await migrate(sql);
  await sql`TRUNCATE purchases, imports, analysis_cache`;
  const analyzer = fakeAnalyzer();
  const repo = createRepository(sql);
  const app = createApp({
    sql,
    repo,
    analyzer: analyzer.client,
    log: createLogger("silent"),
    corsOrigin: "http://localhost:5173",
    demoMode: opts.demoMode ?? false,
  });

  async function call(method: string, url: string, body?: unknown) {
    const res = await app.request(url, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    // biome-ignore lint/suspicious/noExplicitAny: assertions inspect fields individually
    const json: any = text ? JSON.parse(text) : null;
    return { status: res.status, body: json, headers: res.headers };
  }

  return { sql, repo, app, analyzer, call, close: () => sql.end({ timeout: 2 }) };
}

export const sampleText = (file: string) => readFileSync(path.join(ROOT, "samples", file), "utf8");
