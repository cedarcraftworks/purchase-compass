/**
 * Import pipeline: text → table → recognised or mapped columns → normalised rows.
 *
 * Only Amazon offers an official export of your order history, so it gets a
 * dedicated preset. Rakuten, Mercari, card statements and receipts arrive as
 * whatever table the user has: we guess which column is which from the header
 * names, show a preview, and let the user correct the mapping before saving.
 * That keeps the importer useful without browser extensions that would need
 * the user's shop passwords.
 */
import type { ColumnMapping, ImportPreview, ImportRow } from "../index.js";
import { parseDelimited, type Table } from "./csv.js";
import { parseDate, parseQuantity, parseYen } from "./normalize.js";

type Issue = { line: number; message: string };
export type ParsedImport = { preview: ImportPreview; rows: ImportRow[] };

const PREVIEW_ROWS = 5;
const MAX_ISSUES = 50;

const AMAZON_REQUIRED = ["Order Date", "Product Name"];

const GUESS: Record<keyof ColumnMapping, RegExp[]> = {
  date: [/^order date$/i, /注文日/, /購入日/, /利用日/, /日付/, /日時/, /date/i],
  title: [/^product name$/i, /商品名/, /品名/, /利用店名/, /内容/, /title|item|name/i],
  amount: [/^total owed$/i, /支払金額/, /利用金額/, /金額/, /価格/, /amount|total|price/i],
  quantity: [/^quantity$/i, /数量/, /個数/],
  store: [/ショップ名/, /店名/, /^(shop|store)/i],
};

export function isAmazonExport(headers: string[]): boolean {
  return AMAZON_REQUIRED.every((h) => headers.includes(h));
}

export function guessMapping(headers: string[]): ColumnMapping | null {
  const pick = (field: keyof ColumnMapping) => {
    for (const pattern of GUESS[field]) {
      const hit = headers.find((h) => pattern.test(h));
      if (hit) return hit;
    }
    return null;
  };
  const date = pick("date");
  const title = pick("title");
  const amount = pick("amount");
  if (!date || !title || !amount) return null;
  return { date, title, amount, quantity: pick("quantity"), store: pick("store") };
}

export function parseImport(text: string, mapping?: ColumnMapping): ParsedImport {
  const table = parseDelimited(text);
  const amazon = !mapping && isAmazonExport(table.headers);
  const effective = mapping ?? (amazon ? amazonMapping(table.headers) : guessMapping(table.headers));
  const issues: Issue[] = [];
  let rows: ImportRow[] = [];

  if (!effective) {
    issues.push({ line: 1, message: "日付・商品名・金額の列を判別できませんでした。列の対応を指定してください。" });
  } else {
    const missing = Object.values(effective).filter((h): h is string => !!h && !table.headers.includes(h));
    if (missing.length > 0) {
      issues.push({ line: 1, message: `見つからない列があります: ${missing.join(", ")}` });
    } else {
      rows = convertRows(table, effective, amazon, issues);
    }
  }

  return {
    rows,
    preview: {
      format: amazon ? "amazon" : "mapped",
      delimiter: table.delimiter,
      headers: table.headers,
      mapping: effective,
      rows: rows.slice(0, PREVIEW_ROWS),
      totalRows: table.rows.length,
      issues: issues.slice(0, MAX_ISSUES),
    },
  };
}

function amazonMapping(headers: string[]): ColumnMapping {
  return {
    date: "Order Date",
    title: "Product Name",
    amount: headers.includes("Total Owed") ? "Total Owed" : "Unit Price",
    quantity: headers.includes("Quantity") ? "Quantity" : null,
    store: null,
  };
}

function convertRows(table: Table, mapping: ColumnMapping, amazon: boolean, issues: Issue[]): ImportRow[] {
  const index = (h: string | null | undefined) => (h ? table.headers.indexOf(h) : -1);
  const col = {
    date: index(mapping.date),
    title: index(mapping.title),
    amount: index(mapping.amount),
    quantity: index(mapping.quantity),
    store: index(mapping.store),
    status: amazon ? index("Order Status") : -1,
  };
  const out: ImportRow[] = [];

  table.rows.forEach((cells, i) => {
    const line = i + 2; // 1-based, after the header line
    const cell = (c: number) => (c >= 0 ? (cells[c] ?? "").trim() : "");
    if (amazon && /cancel/i.test(cell(col.status))) return;

    const orderedAt = parseDate(cell(col.date));
    const title = cell(col.title);
    const amountYen = parseYen(cell(col.amount));
    const quantity = parseQuantity(col.quantity >= 0 ? cell(col.quantity) : undefined);

    const problems = [
      !orderedAt && `日付を読めません「${cell(col.date)}」`,
      !title && "商品名が空です",
      amountYen === null && `金額を読めません「${cell(col.amount)}」`,
      quantity === null && `数量を読めません「${cell(col.quantity)}」`,
    ].filter(Boolean);
    if (problems.length > 0 || !orderedAt || amountYen === null || quantity === null) {
      issues.push({ line, message: problems.join("、") });
      return;
    }
    out.push({
      line,
      orderedAt,
      title: title.slice(0, 500),
      amountYen,
      quantity,
      store: cell(col.store) || null,
    });
  });
  return out;
}

export { parseDelimited } from "./csv.js";
export { parseDate, parseQuantity, parseYen } from "./normalize.js";
