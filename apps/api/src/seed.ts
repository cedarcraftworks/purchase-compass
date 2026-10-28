/**
 * Loads the demo purchase history from /samples through the same import
 * pipeline a user goes through, so the demo also exercises the importer.
 *
 * Dates are shifted so the newest purchase is two days old. Otherwise a demo
 * opened months from now would show every buy-again item as long overdue.
 *
 *   npm run seed            (skips if purchases already exist)
 *   npm run seed -- --reset (wipes purchases first)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type ImportRow, SAMPLE_FILE, SOURCES, type Source } from "@purchase-compass/shared";
import { parseImport } from "@purchase-compass/shared/importers";
import { loadConfig } from "./config.js";
import { createDb, type Sql } from "./db.js";
import { createRepository } from "./repository.js";

const DEFAULT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../samples");

export const SAMPLE_FILES = SOURCES.map((source) => ({ source, file: SAMPLE_FILE[source] }));

export async function seedSamples(sql: Sql, dir = DEFAULT_DIR, now = new Date()): Promise<number> {
  const parsed: { source: Source; rows: ImportRow[]; total: number; format: string }[] = [];
  for (const { file, source } of SAMPLE_FILES) {
    const { preview, rows } = parseImport(await readFile(path.join(dir, file), "utf8"));
    if (preview.issues.length > 0) throw new Error(`${file}: ${preview.issues[0]?.message}`);
    parsed.push({ source, rows, total: preview.totalRows, format: preview.format });
  }

  const newest = Math.max(...parsed.flatMap((p) => p.rows.map((r) => Date.parse(r.orderedAt))));
  const shiftMs = now.getTime() - 2 * 86_400_000 - newest;
  // Whole days only, so weekdays and times of day (the habits being analysed) are preserved.
  const shift = Math.round(shiftMs / (7 * 86_400_000)) * 7 * 86_400_000;

  const repo = createRepository(sql);
  let inserted = 0;
  for (const { source, rows, total, format } of parsed) {
    const shifted = rows.map((r) => ({ ...r, orderedAt: new Date(Date.parse(r.orderedAt) + shift).toISOString() }));
    inserted += (await repo.importRows(source, format, shifted, total)).inserted;
  }
  return inserted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const sql = createDb(config.DATABASE_URL, 1);
  try {
    if (process.argv.includes("--reset")) {
      await sql`TRUNCATE purchases, imports, analysis_cache`;
      await sql`UPDATE data_version SET version = version + 1`;
    }
    const existing = await createRepository(sql).count();
    if (existing > 0) {
      console.log(`Skipping seed: ${existing} purchases already exist (use --reset).`);
    } else {
      console.log(`Seeded ${await seedSamples(sql, process.env.SAMPLES_DIR)} purchases.`);
    }
  } finally {
    await sql.end();
  }
}
