import { createHash } from "node:crypto";
import type { ImportRow, NewPurchase, Purchase, Source } from "@purchase-compass/shared";
import type { Sql, TxSql } from "./db.js";

type Row = {
  id: string;
  source: Source;
  ordered_at: Date;
  title: string;
  amount_yen: number;
  quantity: number;
  store: string | null;
  category: Purchase["category"];
};

const toPurchase = (r: Row): Purchase => ({
  id: r.id,
  source: r.source,
  orderedAt: r.ordered_at.toISOString(),
  title: r.title,
  amountYen: r.amount_yen,
  quantity: r.quantity,
  store: r.store,
  category: r.category,
});

/** Identity of a purchase for de-duplication: the same line imported twice is one purchase. */
export function dedupeKey(
  source: Source,
  p: { orderedAt: string; title: string; amountYen: number; quantity: number },
) {
  return createHash("sha256")
    .update([source, new Date(p.orderedAt).toISOString(), p.title.trim(), p.amountYen, p.quantity].join("\u0000"))
    .digest("hex");
}

export function createRepository(sql: Sql) {
  async function bumpVersion(tx: TxSql) {
    await tx`UPDATE data_version SET version = version + 1`;
  }

  return {
    async list(limit = 5000): Promise<Purchase[]> {
      const rows = await sql<Row[]>`
        SELECT id, source, ordered_at, title, amount_yen, quantity, store, category
        FROM purchases ORDER BY ordered_at DESC, id LIMIT ${limit}`;
      return rows.map(toPurchase);
    },

    async count(): Promise<number> {
      const [row] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM purchases`;
      return row?.n ?? 0;
    },

    async version(): Promise<number> {
      const [row] = await sql<{ version: string }[]>`SELECT version FROM data_version`;
      return Number(row?.version ?? 0);
    },

    async add(p: NewPurchase): Promise<Purchase | null> {
      return sql.begin(async (tx) => {
        const [row] = await tx<Row[]>`
          INSERT INTO purchases (source, ordered_at, title, amount_yen, quantity, store, category, dedupe_key)
          VALUES (${p.source}, ${p.orderedAt}, ${p.title}, ${p.amountYen}, ${p.quantity}, ${p.store ?? null},
                  ${p.category ?? null}, ${dedupeKey(p.source, p)})
          ON CONFLICT (dedupe_key) DO NOTHING
          RETURNING id, source, ordered_at, title, amount_yen, quantity, store, category`;
        if (row) await bumpVersion(tx);
        return row ? toPurchase(row) : null;
      });
    },

    async remove(id: string): Promise<boolean> {
      return sql.begin(async (tx) => {
        const rows = await tx`DELETE FROM purchases WHERE id = ${id} RETURNING id`;
        if (rows.length > 0) await bumpVersion(tx);
        return rows.length > 0;
      });
    },

    async setCategory(id: string, category: Purchase["category"]): Promise<boolean> {
      return sql.begin(async (tx) => {
        const rows = await tx`UPDATE purchases SET category = ${category} WHERE id = ${id} RETURNING id`;
        if (rows.length > 0) await bumpVersion(tx);
        return rows.length > 0;
      });
    },

    /** Saves a whole import in one transaction: all rows land, or none do. */
    async importRows(source: Source, format: string, rows: ImportRow[], totalRows: number) {
      return sql.begin(async (tx) => {
        const [imp] = await tx<{ id: string }[]>`
          INSERT INTO imports (source, format, row_count, inserted) VALUES (${source}, ${format}, ${totalRows}, 0)
          RETURNING id`;
        if (!imp) throw new Error("insert failed");
        let inserted = 0;
        // Batches keep each statement well under Postgres' parameter limit.
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500).map((r) => ({
            source,
            ordered_at: r.orderedAt,
            title: r.title,
            amount_yen: r.amountYen,
            quantity: r.quantity,
            store: r.store,
            import_id: imp.id,
            dedupe_key: dedupeKey(source, r),
          }));
          const result = await tx`INSERT INTO purchases ${tx(batch)} ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`;
          inserted += result.length;
        }
        await tx`UPDATE imports SET inserted = ${inserted} WHERE id = ${imp.id}`;
        if (inserted > 0) await bumpVersion(tx);
        return { importId: imp.id, inserted, duplicates: rows.length - inserted };
      });
    },

    async cached<T>(kind: string, version: number): Promise<T | null> {
      const [row] = await sql<{ payload: T }[]>`
        SELECT payload FROM analysis_cache WHERE kind = ${kind} AND data_version = ${version}`;
      return row?.payload ?? null;
    },

    async storeCache(kind: string, version: number, payload: unknown): Promise<void> {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO analysis_cache (kind, data_version, payload) VALUES (${kind}, ${version}, ${tx.json(payload as never)})
          ON CONFLICT (kind, data_version) DO NOTHING`;
        // Older versions can never be read again.
        await tx`DELETE FROM analysis_cache WHERE kind = ${kind} AND data_version < ${version}`;
      });
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
