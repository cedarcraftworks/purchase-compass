/**
 * Contract test between the two languages.
 *
 * The Python test suite writes real analyzer responses to /contract/fixtures.
 * Here they must pass the TypeScript schemas the API uses at runtime. In CI
 * the fixtures are regenerated first, so a field renamed on one side without
 * the other fails the build instead of the dashboard.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Insights, Recommendations } from "@purchase-compass/shared";
import { fixture } from "./helpers.js";

function check(schema: typeof Insights | typeof Recommendations, name: string) {
  const result = schema.safeParse(fixture(name));
  assert.ok(
    result.success,
    result.success ? "" : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
  );
}

describe("analyzer contract", () => {
  it("insights response matches the TypeScript schema", () => check(Insights, "insights.response"));
  it("recommendations response matches the TypeScript schema", () =>
    check(Recommendations, "recommendations.response"));

  it("TypeScript knows every field the analyzer documents", () => {
    // biome-ignore lint/suspicious/noExplicitAny: walking a JSON document
    const openapi = fixture("openapi") as any;
    const documented = Object.keys(openapi.components.schemas.InsightsResponse.properties).sort();
    assert.deepEqual(documented, Object.keys(Insights.shape).sort());
  });
});
