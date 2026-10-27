import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Sql } from "./db.js";

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Arbitrary constant so every instance contends for the same advisory lock. */
const MIGRATION_LOCK_KEY = 5_150_001;

/**
 * Applies pending `NNN_name.sql` files in order, each in its own transaction.
 *
 * - A Postgres advisory lock makes it safe for several containers to boot at
 *   once: only one runs migrations, the rest wait and then find nothing to do.
 * - A checksum is stored per file so an already-applied migration that was
 *   edited afterwards is reported instead of silently ignored.
 */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const applied: string[] = [];

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text        PRIMARY KEY,
        checksum   text        NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;
    const done = new Map(
      (await tx<{ name: string; checksum: string }[]>`SELECT name, checksum FROM schema_migrations`).map((r) => [
        r.name,
        r.checksum,
      ]),
    );

    for (const file of files) {
      const body = await readFile(path.join(dir, file), "utf8");
      const checksum = createHash("sha256").update(body).digest("hex");
      const previous = done.get(file);
      if (previous !== undefined) {
        if (previous !== checksum) {
          throw new Error(`Migration ${file} was modified after being applied. Add a new migration instead.`);
        }
        continue;
      }
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name, checksum) VALUES (${file}, ${checksum})`;
      applied.push(file);
    }
  });

  return applied;
}
