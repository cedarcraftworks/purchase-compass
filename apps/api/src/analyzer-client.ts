import { type Insights, Insights as InsightsSchema, type Purchase, Recommendations } from "@purchase-compass/shared";
import type { z } from "zod";
import { errors } from "./http/errors.js";

/**
 * Talks to the Python analyzer. Every response is validated against the
 * shared schema before it is trusted: if the two services ever disagree about
 * the shape of the data, we fail loudly here with a clear 502 instead of
 * rendering broken numbers in the browser.
 */
export function createAnalyzerClient(opts: { baseUrl: string; timeoutMs: number; fetch?: typeof fetch }) {
  const doFetch = opts.fetch ?? fetch;

  async function post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await doFetch(new URL(path, opts.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      throw errors.analyzerUnavailable(err instanceof Error ? err.name : "network error");
    }
    if (!res.ok) throw errors.analyzerUnavailable(`status ${res.status}`);
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw errors.analyzerUnavailable("response did not match the contract");
    return parsed.data;
  }

  const toWire = (purchases: Purchase[]) =>
    purchases.map((p) => ({
      id: p.id,
      source: p.source,
      orderedAt: p.orderedAt,
      title: p.title,
      amountYen: p.amountYen,
      quantity: p.quantity,
      store: p.store,
      category: p.category,
    }));

  return {
    insights: (purchases: Purchase[]): Promise<Insights> =>
      post("/v1/insights", { purchases: toWire(purchases) }, InsightsSchema),
    recommendations: (purchases: Purchase[], limit = 12) =>
      post("/v1/recommendations", { purchases: toWire(purchases), limit }, Recommendations),
  };
}

export type AnalyzerClient = ReturnType<typeof createAnalyzerClient>;
