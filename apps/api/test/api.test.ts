import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { seedSamples } from "../src/seed.js";
import { createHarness, ROOT, sampleText } from "./helpers.js";

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;
before(async () => {
  h = await createHarness();
});
after(() => h.close());
beforeEach(async () => {
  await h.sql`TRUNCATE purchases, imports, analysis_cache`;
  h.analyzer.setMode("ok");
  h.analyzer.calls.length = 0;
});

const manual = {
  source: "store",
  orderedAt: "2026-10-01T12:30:00+09:00",
  title: "おにぎり 2個",
  amountYen: 298,
  store: "コンビニ",
};

describe("imports", () => {
  it("previews without saving anything", async () => {
    const res = await h.call("POST", "/api/imports/preview", {
      source: "rakuten",
      text: sampleText("rakuten_purchase_history.tsv"),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.delimiter, "\t");
    assert.equal(res.body.rows.length, 5);
    assert.equal(await h.repo.count(), 0);
  });

  it("imports a file once; importing it again adds nothing", async () => {
    const body = { source: "amazon", text: sampleText("amazon_Retail.OrderHistory.1.csv") };
    const first = await h.call("POST", "/api/imports", body);
    const again = await h.call("POST", "/api/imports", body);

    assert.equal(first.status, 201);
    assert.ok(first.body.inserted > 20);
    assert.equal(again.body.inserted, 0);
    assert.equal(again.body.duplicates, first.body.inserted);
  });

  it("explains why nothing could be imported", async () => {
    const res = await h.call("POST", "/api/imports", { source: "other", text: "a,b,c\n1,2,3\n" });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, "nothing_to_import");
    assert.match(res.body.detail, /判別できませんでした/);
  });
});

describe("purchases", () => {
  it("adds, recategorises, lists and deletes a hand-entered purchase", async () => {
    const created = await h.call("POST", "/api/purchases", manual);
    assert.equal(created.status, 201);
    assert.equal(created.body.quantity, 1);

    const patched = await h.call("PATCH", `/api/purchases/${created.body.id}`, { category: "食品" });
    assert.equal(patched.status, 204);
    const [listed] = (await h.call("GET", "/api/purchases")).body;
    assert.equal(listed.category, "食品");

    assert.equal((await h.call("DELETE", `/api/purchases/${created.body.id}`)).status, 204);
    assert.equal((await h.call("DELETE", `/api/purchases/${created.body.id}`)).status, 404);
  });

  it("validates input and refuses exact duplicates", async () => {
    const bad = await h.call("POST", "/api/purchases", { ...manual, amountYen: -1 });
    assert.equal(bad.status, 400);
    assert.match(bad.body.detail, /amountYen/);

    await h.call("POST", "/api/purchases", manual);
    const dup = await h.call("POST", "/api/purchases", manual);
    assert.equal(dup.status, 400);
  });
});

describe("analysis", () => {
  it("calls the analyzer once and serves the cached result until the data changes", async () => {
    await h.call("POST", "/api/purchases", manual);
    const first = await h.call("GET", "/api/insights");
    await h.call("GET", "/api/insights");
    assert.equal(first.status, 200);
    assert.ok(first.body.findings.length > 0);
    assert.deepEqual(h.analyzer.calls, ["/v1/insights"]);

    await h.call("POST", "/api/purchases", { ...manual, title: "サラダチキン" });
    await h.call("GET", "/api/insights");
    assert.deepEqual(h.analyzer.calls, ["/v1/insights", "/v1/insights"]);
  });

  it("returns recommendations from the analyzer", async () => {
    const res = await h.call("GET", "/api/recommendations");
    assert.equal(res.status, 200);
    assert.ok(res.body.products.length > 0);
  });

  it("answers 502 when the analyzer is down or breaks the contract", async () => {
    h.analyzer.setMode("down");
    const down = await h.call("GET", "/api/insights");
    assert.equal(down.status, 502);
    assert.equal(down.body.code, "analyzer_unavailable");

    h.analyzer.setMode("garbage");
    const garbage = await h.call("GET", "/api/insights");
    assert.equal(garbage.status, 502);
    assert.match(garbage.body.detail, /contract/);
  });
});

describe("demo mode", () => {
  it("serves data but refuses every write", async () => {
    const demo = await createHarness({ demoMode: true });
    try {
      assert.equal((await demo.call("GET", "/api/meta")).body.demoMode, true);
      const res = await demo.call("POST", "/api/purchases", manual);
      assert.equal(res.status, 403);
      assert.equal(res.body.code, "demo_read_only");
      assert.equal((await demo.call("POST", "/api/imports", { source: "amazon", text: "x" })).status, 403);
      assert.equal((await demo.call("GET", "/api/purchases")).status, 200);
    } finally {
      await demo.close();
    }
  });
});

describe("seed", () => {
  it("loads every sample file and moves the newest purchase to two days ago", async () => {
    const now = new Date("2027-03-15T12:00:00Z");
    const inserted = await seedSamples(h.sql, `${ROOT}/samples`, now);
    assert.equal(inserted, await h.repo.count());
    assert.ok(inserted > 150);

    const [newest] = await h.repo.list(1);
    const ageDays = (now.getTime() - Date.parse(newest?.orderedAt ?? "")) / 86_400_000;
    assert.ok(ageDays >= -2 && ageDays <= 6, `newest purchase is ${ageDays.toFixed(1)} days old`);
  });
});
