/**
 * The contract shared by the web app, the TypeScript API and (by checking
 * its fixtures) the Python analyzer. Each payload is described once, as a zod
 * schema: the API validates with it, the web app infers its types from it.
 */
import { z } from "zod";

export const SOURCES = ["amazon", "rakuten", "mercari", "store", "other"] as const;
export const Source = z.enum(SOURCES);
export type Source = z.infer<typeof Source>;

export const SOURCE_LABEL: Record<Source, string> = {
  amazon: "Amazon",
  rakuten: "楽天",
  mercari: "メルカリ",
  store: "実店舗",
  other: "その他・カード明細",
};

export const CATEGORIES = [
  "食品",
  "飲料",
  "日用品",
  "美容・健康",
  "ファッション",
  "家電・ガジェット",
  "本・マンガ",
  "ゲーム・ホビー",
  "サブスク・デジタル",
  "その他",
] as const;
export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;

const DateTime = z.iso.datetime({ offset: true });

// ---- purchases ------------------------------------------------------------------------------

export const Purchase = z.object({
  id: z.uuid(),
  source: Source,
  orderedAt: DateTime,
  title: z.string(),
  amountYen: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  store: z.string().nullable(),
  category: Category.nullable(),
});
export type Purchase = z.infer<typeof Purchase>;

export const NewPurchase = z.object({
  source: Source,
  orderedAt: DateTime,
  title: z.string().trim().min(1).max(500),
  amountYen: z.number().int().nonnegative().max(10_000_000),
  quantity: z.number().int().positive().max(999).default(1),
  store: z.string().trim().max(200).nullish(),
  category: Category.nullish(),
});
export type NewPurchase = z.infer<typeof NewPurchase>;

// ---- imports --------------------------------------------------------------------------------

/** Which column holds which field. Header names exactly as they appear in the file. */
export const ColumnMapping = z.object({
  date: z.string(),
  title: z.string(),
  amount: z.string(),
  quantity: z.string().nullish(),
  store: z.string().nullish(),
});
export type ColumnMapping = z.infer<typeof ColumnMapping>;

export const ImportRequest = z.object({
  source: Source,
  text: z.string().min(1).max(5_000_000),
  /** Omit to let the server recognise the format or guess the columns. */
  mapping: ColumnMapping.optional(),
});
export type ImportRequest = z.infer<typeof ImportRequest>;

export const ImportRow = z.object({
  line: z.number().int(),
  orderedAt: DateTime,
  title: z.string(),
  amountYen: z.number().int(),
  quantity: z.number().int(),
  store: z.string().nullable(),
});
export type ImportRow = z.infer<typeof ImportRow>;

export const ImportIssue = z.object({ line: z.number().int(), message: z.string() });

export const ImportPreview = z.object({
  format: z.enum(["amazon", "mapped"]),
  delimiter: z.enum([",", "\t"]),
  headers: z.array(z.string()),
  mapping: ColumnMapping.nullable(),
  rows: z.array(ImportRow),
  totalRows: z.number().int(),
  issues: z.array(ImportIssue),
});
export type ImportPreview = z.infer<typeof ImportPreview>;

export const ImportResult = z.object({
  importId: z.uuid(),
  inserted: z.number().int(),
  duplicates: z.number().int(),
  issues: z.array(ImportIssue),
});
export type ImportResult = z.infer<typeof ImportResult>;

// ---- analyzer responses (mirrors services/analyzer/compass_analyzer/schemas.py) -------------

export const Finding = z.object({
  kind: z.enum(["time", "weekday", "category_trend", "site_preference", "secondhand", "basket"]),
  text: z.string(),
  value: z.number().nullable(),
});

export const Insights = z.object({
  summary: z.object({
    totalYen: z.number().int(),
    purchaseCount: z.number().int(),
    averageYen: z.number().int(),
    periodStart: DateTime.nullable(),
    periodEnd: DateTime.nullable(),
  }),
  bySource: z.array(z.object({ source: Source, totalYen: z.number(), count: z.number(), share: z.number() })),
  byCategory: z.array(z.object({ category: Category, totalYen: z.number(), count: z.number(), share: z.number() })),
  monthly: z.array(z.object({ month: z.string(), totalYen: z.number(), count: z.number() })),
  heatmap: z.array(z.object({ weekday: z.number().int(), hour: z.number().int(), count: z.number().int() })),
  findings: z.array(Finding),
  categorized: z.array(
    z.object({
      purchaseId: z.string(),
      category: Category,
      method: z.enum(["given", "keyword", "model", "fallback"]),
      confidence: z.number(),
    }),
  ),
  replenishment: z.array(
    z.object({
      itemKey: z.string(),
      title: z.string(),
      category: Category,
      timesBought: z.number().int(),
      medianIntervalDays: z.number(),
      lastPurchasedAt: DateTime,
      daysSince: z.number(),
      status: z.enum(["due", "soon", "ok"]),
      reason: z.string(),
    }),
  ),
  impulse: z.array(
    z.object({
      purchaseId: z.string(),
      title: z.string(),
      amountYen: z.number().int(),
      orderedAt: DateTime,
      score: z.number().int(),
      reasons: z.array(
        z.object({
          code: z.enum(["late_night", "burst", "unusual_amount", "new_category"]),
          label: z.string(),
          points: z.number().int(),
        }),
      ),
    }),
  ),
  subscriptions: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      amountYen: z.number().int(),
      cadence: z.enum(["monthly", "yearly"]),
      occurrences: z.number().int(),
      lastChargedAt: DateTime,
      nextExpectedAt: DateTime,
      yearlyCostYen: z.number().int(),
      reason: z.string(),
    }),
  ),
});
export type Insights = z.infer<typeof Insights>;

export const Recommendations = z.object({
  keywords: z.array(z.string()),
  products: z.array(
    z.object({
      title: z.string(),
      priceYen: z.number().int().nullable(),
      url: z.url(),
      imageUrl: z.url().nullable(),
      shop: z.string().nullable(),
      origin: z.enum(["rakuten", "sample"]),
      score: z.number(),
      keyword: z.string(),
      reason: z.string(),
      becauseOf: z.string().nullable(),
    }),
  ),
  searchLinks: z.array(z.object({ site: z.enum(["amazon", "rakuten", "mercari"]), keyword: z.string(), url: z.url() })),
  sourceStatus: z.enum(["live", "fallback", "sample"]),
});
export type Recommendations = z.infer<typeof Recommendations>;

// ---- misc -----------------------------------------------------------------------------------

export const Meta = z.object({
  demoMode: z.boolean(),
  purchaseCount: z.number().int(),
});
export type Meta = z.infer<typeof Meta>;

/** RFC 9457 problem details with a stable code for the client to branch on. */
export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;

/** The sample purchase history for each shop, in that shop's own format (see /samples). */
export const SAMPLE_FILE: Record<Source, string> = {
  amazon: "amazon_Retail.OrderHistory.1.csv",
  rakuten: "rakuten_purchase_history.tsv",
  mercari: "mercari_purchases.csv",
  store: "store_receipts.csv",
  other: "card_statement.csv",
};
