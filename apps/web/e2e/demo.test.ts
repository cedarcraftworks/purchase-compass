/**
 * End-to-end tests of the public demo, run in a real browser (Playwright)
 * against the GitHub Pages build served under /purchase-compass/ exactly as
 * it is published. Run with: npm run test:e2e -w @purchase-compass/web
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";

const DIST = process.env.DIST_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
};
const SHOPS = ["Amazon", "楽天", "メルカリ", "実店舗", "その他・カード明細"];
const HEADINGS = {
  trends: "あなたの買い物の傾向",
  recommend: "そろそろ買い時",
  signals: "定期的な支払い",
  data: "購入履歴を取り込む",
};

let server: http.Server;
let browser: Browser;
let base: string;

/** Serves dist/ under /purchase-compass/, like GitHub Pages does. */
before(async () => {
  server = http.createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const rel = url.replace(/^\/purchase-compass/, "");
    const file = rel === "" || rel.endsWith("/") ? `${rel}index.html` : rel;
    try {
      const body = await readFile(path.join(DIST, file));
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/purchase-compass/`;
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  );
});

after(async () => {
  await browser?.close();
  server?.close();
});

/** Opens a page that fails the test on any script error or broken request (web fonts excepted). */
async function open(hash: string, options: Parameters<Browser["newPage"]>[0] = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...options });
  const problems: string[] = [];
  const external = (u: string) => !u.startsWith(base);
  page.on("pageerror", (e) => problems.push(String(e)));
  page.on("requestfailed", (r) => external(r.url()) || problems.push(`failed: ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && !external(r.url()) && problems.push(`${r.status()}: ${r.url()}`));
  await page.goto(`${base}#${hash}`);
  await page.locator("main h2").first().waitFor();
  return { page, problems };
}

const heading = (page: Page) => page.locator("main h2").first().textContent();

/** Waits for the screen to show `text` as its first heading (navigation re-renders asynchronously). */
async function expectHeading(page: Page, text: string) {
  await page.locator("main h2").first().filter({ hasText: text }).waitFor({ timeout: 5_000 });
}

describe("public demo", () => {
  it("opens every tab from its URL, with its own title and no errors", async () => {
    for (const [tab, h2] of Object.entries(HEADINGS)) {
      const { page, problems } = await open(tab);
      assert.equal(await heading(page), h2);
      assert.match(await page.title(), /\| Purchase Compass$/);
      assert.deepEqual(problems, []);
      await page.close();
    }
  });

  it("explains the data and guides visitors to each tab", async () => {
    const { page } = await open("trends");
    const banner = page.locator(".demo-banner");
    assert.match((await banner.textContent()) ?? "", /架空の大学生/);
    const links = await banner
      .locator("a[href^='http']")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    assert.ok(links.some((h) => h.endsWith("docs/sample-data.md")));

    await page.locator(".demo-guide a", { hasText: "おすすめ" }).click();
    await expectHeading(page, HEADINGS.recommend);
    await page.goBack();
    await expectHeading(page, HEADINGS.trends);
    await page.close();
  });

  it("shows recommendations with a reason each, and searches on the other shops", async () => {
    const { page } = await open("recommend");
    const reasons = await page.locator(".products li .muted").allInnerTexts();
    assert.ok(reasons.length >= 6);
    for (const r of reasons) assert.match(r, /^よく買う/);
    const links = await page
      .locator(".search-links a")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const host of ["amazon.co.jp", "rakuten.co.jp", "mercari.com"])
      assert.ok(
        links.some((l) => l.includes(host)),
        host,
      );
    await page.close();
  });

  it("lets a visitor download each shop's sample and preview it, but not save", async () => {
    const { page, problems } = await open("data");
    const dir = await mkdtemp(path.join(tmpdir(), "samples-"));
    for (const shop of SHOPS) {
      await page.locator("label.chip", { hasText: shop }).click();
      const [download] = await Promise.all([page.waitForEvent("download"), page.locator(".sample-link").click()]);
      const file = path.join(dir, download.suggestedFilename());
      await download.saveAs(file);
      await page.setInputFiles("input[type=file]", file);
      await page.locator(".preview tbody tr").first().waitFor();
      assert.equal(await page.locator(".issues li").count(), 0, `${shop}: unexpected import issues`);
    }
    assert.ok(await page.getByRole("button", { name: "取り込む" }).isDisabled());
    assert.ok(await page.getByRole("button", { name: "登録する" }).isDisabled());
    assert.deepEqual(problems, []);
    await page.close();
  });

  it("fits a phone screen without sideways scrolling", async () => {
    for (const tab of Object.keys(HEADINGS)) {
      const { page } = await open(tab, { viewport: { width: 375, height: 800 } });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `#${tab} overflows by ${overflow}px`);
      await page.close();
    }
  });

  it("can be used with the keyboard", async () => {
    const { page } = await open("trends");
    await page.keyboard.press("Tab"); // the current tab
    await page.keyboard.press("Tab"); // おすすめ
    await page.keyboard.press("Enter");
    await expectHeading(page, HEADINGS.recommend);
    await page.close();
  });

  it("follows the system dark mode", async () => {
    const { page } = await open("trends", { colorScheme: "dark" });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, "rgb(20, 32, 38)");
    await page.close();
  });
});
