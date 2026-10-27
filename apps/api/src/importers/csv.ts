/**
 * A small RFC 4180 reader: quoted fields, escaped quotes ("") and line breaks
 * inside quotes. It also accepts tab-separated text, which is what you get
 * when you copy a table from a web page (e.g. a Rakuten purchase history).
 */

export type Table = { delimiter: "," | "\t"; headers: string[]; rows: string[][] };

/** Picks the delimiter that appears most in the header line. */
export function detectDelimiter(text: string): "," | "\t" {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const tabs = firstLine.split("\t").length - 1;
  const commas = firstLine.split(",").length - 1;
  return tabs > commas ? "\t" : ",";
}

export function parseDelimited(input: string): Table {
  const text = input.replace(/^﻿/, ""); // Excel adds a BOM to UTF-8 CSV
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((cell) => cell.trim() !== ""));
  const [headerRow = [], ...rows] = nonEmpty;
  return { delimiter, headers: headerRow.map((h) => h.trim()), rows };
}
