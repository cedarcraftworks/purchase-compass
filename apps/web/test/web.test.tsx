/**
 * Web app tests that need no browser: components are rendered to HTML with
 * react-dom/server, and the static demo's data files are checked against the
 * same zod schemas the API uses, so the public demo can never drift from the
 * contract.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { Insights, Meta, Purchase, Recommendations } from "@purchase-compass/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { z } from "zod";
import { Compass } from "../src/components/Compass";
import { formatYen, monthLabel, percent } from "../src/format";
import { Signals } from "../src/pages/Signals";
import { Trends } from "../src/pages/Trends";

const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/demo");
const demo = (name: string): unknown => JSON.parse(readFileSync(path.join(DEMO, `${name}.json`), "utf8"));
const insights = Insights.parse(demo("insights"));

describe("static demo data", () => {
  for (const [name, schema] of [
    ["meta", Meta],
    ["insights", Insights],
    ["recommendations", Recommendations],
    ["purchases", z.array(Purchase)],
  ] as const) {
    it(`${name}.json matches the shared schema`, () => {
      const result = schema.safeParse(demo(name));
      assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues.slice(0, 3)));
    });
  }

  it("is marked as a read-only demo", () => {
    assert.equal(Meta.parse(demo("meta")).demoMode, true);
  });
});

describe("format", () => {
  it("formats yen, shares and months the Japanese way", () => {
    assert.equal(formatYen(227250), "227,250円");
    assert.equal(percent(0.4234), "42%");
    assert.equal(monthLabel("2026-05"), "5月");
  });
});

describe("Compass", () => {
  it("points the needle at the shop with the most spending and says so", () => {
    const html = renderToStaticMarkup(
      <Compass
        totalYen={10000}
        bySource={[
          { source: "rakuten", totalYen: 7000, share: 0.7 },
          { source: "amazon", totalYen: 3000, share: 0.3 },
        ]}
      />,
    );
    assert.match(html, /aria-label="支出の70%が楽天"/);
    assert.match(html, /お金の向かう先は<strong>楽天<\/strong>/);
  });

  it("has a clear empty state", () => {
    const html = renderToStaticMarkup(<Compass totalYen={0} bySource={[]} />);
    assert.match(html, /まだ購入データがありません/);
  });
});

describe("pages", () => {
  it("Trends shows every finding the analyzer produced", () => {
    const html = renderToStaticMarkup(<Trends insights={insights} />);
    for (const f of insights.findings) assert.ok(html.includes(f.text), `missing finding: ${f.text}`);
  });

  it("Signals shows each impulse purchase with the reasons behind its score", () => {
    const html = renderToStaticMarkup(<Signals insights={insights} />);
    const top = insights.impulse[0];
    assert.ok(top, "demo data should contain an impulse candidate");
    assert.ok(html.includes(top.title));
    for (const r of top.reasons) assert.ok(html.includes(r.label), `missing reason: ${r.label}`);
  });
});
