import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parseDelimited } from "../src/importers/csv.js";
import { guessMapping, parseImport } from "../src/importers/index.js";
import { parseDate, parseYen } from "../src/importers/normalize.js";

const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../samples");
const sample = (file: string) => readFile(path.join(SAMPLES, file), "utf8");

describe("parseDelimited", () => {
  it("handles quotes, escaped quotes, commas and line breaks inside fields", () => {
    const t = parseDelimited('名前,価格\n"ケーブル, 2m","¥1,280"\n"彼は""最高""と言った\n2行目",500\n');
    assert.deepEqual(t.headers, ["名前", "価格"]);
    assert.deepEqual(t.rows, [
      ["ケーブル, 2m", "¥1,280"],
      ['彼は"最高"と言った\n2行目', "500"],
    ]);
  });

  it("reads tab-separated text copied from a web page, and strips Excel's BOM", () => {
    const t = parseDelimited("﻿注文日\t商品名\r\n2026/05/01\tコーヒー\r\n\r\n");
    assert.equal(t.delimiter, "\t");
    assert.deepEqual(t.headers, ["注文日", "商品名"]);
    assert.deepEqual(t.rows, [["2026/05/01", "コーヒー"]]);
  });
});

describe("normalisation", () => {
  it("reads the date formats shops use, treating zone-less times as Japan time", () => {
    assert.equal(parseDate("2026-05-03T13:21:44Z"), "2026-05-03T13:21:44.000Z");
    assert.equal(parseDate("2026/05/03 21:10"), "2026-05-03T12:10:00.000Z");
    assert.equal(parseDate("2026年5月3日 21:10"), "2026-05-03T12:10:00.000Z");
    assert.equal(parseDate("2026-05-03"), "2026-05-03T03:00:00.000Z"); // noon JST
  });

  it("rejects dates that do not exist instead of rolling them over", () => {
    assert.equal(parseDate("2026/02/31"), null);
    assert.equal(parseDate("昨日"), null);
  });

  it("reads yen amounts written in different styles", () => {
    assert.equal(parseYen("¥1,280"), 1280);
    assert.equal(parseYen("1,280円"), 1280);
    assert.equal(parseYen("￥ 980"), 980);
    assert.equal(parseYen("-500"), null);
    assert.equal(parseYen("12.5"), null);
  });
});

describe("parseImport", () => {
  it("recognises Amazon's official order-history export", async () => {
    const { preview, rows } = parseImport(await sample("amazon_Retail.OrderHistory.1.csv"));
    assert.equal(preview.format, "amazon");
    assert.equal(preview.issues.length, 0);
    assert.equal(rows.length, preview.totalRows);
    assert.equal(preview.mapping?.amount, "Total Owed");
  });

  it("skips cancelled Amazon orders", () => {
    const csv =
      "Order Date,Product Name,Total Owed,Quantity,Order Status\n" +
      "2026-05-01T10:00:00Z,本,1000,1,Closed\n2026-05-02T10:00:00Z,キャンセルした本,2000,1,Cancelled\n";
    assert.deepEqual(
      parseImport(csv).rows.map((r) => r.title),
      ["本"],
    );
  });

  for (const [file, expected] of [
    [
      "rakuten_purchase_history.tsv",
      { date: "注文日時", title: "商品名", amount: "支払金額", quantity: "数量", store: "ショップ名" },
    ],
    ["mercari_purchases.csv", { date: "購入日", title: "商品名", amount: "価格", quantity: null, store: null }],
    ["store_receipts.csv", { date: "日付", title: "品名", amount: "金額", quantity: null, store: "店名" }],
    [
      "card_statement.csv",
      { date: "利用日", title: "利用店名", amount: "利用金額", quantity: null, store: "利用店名" },
    ],
  ] as const) {
    it(`guesses the columns of ${file}`, async () => {
      const { preview, rows } = parseImport(await sample(file));
      assert.deepEqual(preview.mapping, expected);
      assert.equal(preview.issues.length, 0);
      assert.equal(rows.length, preview.totalRows);
    });
  }

  it("reports rows it cannot read, with the line number, and keeps the rest", () => {
    const { rows, preview } = parseImport("日付,商品名,金額\n2026/05/01,本,1000\nいつか,謎,無料\n");
    assert.equal(rows.length, 1);
    assert.equal(preview.issues[0]?.line, 3);
    assert.match(preview.issues[0]?.message ?? "", /日付を読めません.*金額を読めません/);
  });

  it("asks for a mapping when the columns cannot be guessed, and accepts one", () => {
    const text = "いつ,なに,いくら\n2026/05/01,本,1000\n";
    assert.equal(guessMapping(["いつ", "なに", "いくら"]), null);
    assert.equal(parseImport(text).rows.length, 0);
    const mapped = parseImport(text, { date: "いつ", title: "なに", amount: "いくら" });
    assert.equal(mapped.rows[0]?.amountYen, 1000);
  });
});
