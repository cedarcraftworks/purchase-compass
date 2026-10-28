import { Category, ImportRequest, NewPurchase } from "@purchase-compass/shared";
import { parseImport } from "@purchase-compass/shared/importers";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { AnalyzerClient } from "./analyzer-client.js";
import type { Sql } from "./db.js";
import { AppError, errors } from "./http/errors.js";
import type { Logger } from "./logger.js";
import type { Repository } from "./repository.js";

export type AppDeps = {
  sql: Sql;
  repo: Repository;
  analyzer: AnalyzerClient;
  log: Logger;
  corsOrigin: string;
  demoMode: boolean;
};

const Uuid = z.uuid();

export function createApp(deps: AppDeps) {
  const { sql, repo, analyzer, log, corsOrigin, demoMode } = deps;
  const app = new Hono();

  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    });
  });
  app.use("/api/*", cors({ origin: corsOrigin.split(",").map((o) => o.trim()) }));

  app.onError((err, c) => {
    if (err instanceof AppError) return problem(c, err);
    log.error("unhandled error", { err });
    return c.json({ type: "about:blank", title: "Internal server error", status: 500, code: "internal_error" }, 500, {
      "content-type": "application/problem+json",
    });
  });
  app.notFound((c) => problem(c, errors.notFound("ページ")));

  /** Refuses writes on the public demo so one visitor cannot change what the next one sees. */
  const writable: MiddlewareHandler = async (_c, next) => {
    if (demoMode) throw errors.demoReadOnly();
    await next();
  };

  app.get("/healthz", async (c) => {
    await sql`SELECT 1`;
    return c.json({ status: "ok" });
  });

  app.get("/api/meta", async (c) => c.json({ demoMode, purchaseCount: await repo.count() }));

  // ---- purchases ----------------------------------------------------------------------------

  app.get("/api/purchases", async (c) => c.json(await repo.list()));

  app.post("/api/purchases", writable, async (c) => {
    const body = await parseBody(c, NewPurchase);
    const created = await repo.add(body);
    if (!created) throw errors.validation("同じ購入がすでに登録されています。");
    return c.json(created, 201);
  });

  app.patch("/api/purchases/:id", writable, async (c) => {
    const id = uuidParam(c);
    const body = await parseBody(c, z.object({ category: Category.nullable() }));
    if (!(await repo.setCategory(id, body.category))) throw errors.notFound("購入");
    return c.body(null, 204);
  });

  app.delete("/api/purchases/:id", writable, async (c) => {
    if (!(await repo.remove(uuidParam(c)))) throw errors.notFound("購入");
    return c.body(null, 204);
  });

  // ---- imports ------------------------------------------------------------------------------

  /** Dry run: shows how the file will be read, so the user can fix the column mapping first. */
  app.post("/api/imports/preview", async (c) => {
    const body = await parseBody(c, ImportRequest);
    return c.json(parseImport(body.text, body.mapping).preview);
  });

  app.post("/api/imports", writable, async (c) => {
    const body = await parseBody(c, ImportRequest);
    const { preview, rows } = parseImport(body.text, body.mapping);
    if (rows.length === 0) throw errors.nothingToImport(preview.issues[0]?.message ?? "データ行がありません。");
    const result = await repo.importRows(body.source, preview.format, rows, preview.totalRows);
    return c.json({ ...result, issues: preview.issues }, 201);
  });

  // ---- analysis -----------------------------------------------------------------------------

  /**
   * Results are cached per data version: the analyzer runs once after each
   * change, and every later page view is a single database read.
   */
  async function cachedAnalysis<T>(kind: string, run: () => Promise<T>): Promise<T> {
    const version = await repo.version();
    const hit = await repo.cached<T>(kind, version);
    if (hit) return hit;
    const fresh = await run();
    await repo.storeCache(kind, version, fresh);
    return fresh;
  }

  app.get("/api/insights", async (c) =>
    c.json(await cachedAnalysis("insights", async () => analyzer.insights(await repo.list()))),
  );

  app.get("/api/recommendations", async (c) =>
    c.json(await cachedAnalysis("recommendations", async () => analyzer.recommendations(await repo.list()))),
  );

  return app;
}

function problem(c: Context, err: AppError) {
  return c.json(err.toProblem(), err.status, { "content-type": "application/problem+json" });
}

function uuidParam(c: Context): string {
  const id = c.req.param("id");
  if (!id || !Uuid.safeParse(id).success) throw errors.notFound("購入");
  return id;
}

async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => {
    throw errors.validation("JSONとして読めません。");
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw errors.validation(parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  }
  return parsed.data;
}
