import { z } from "zod";

const Bool = z
  .enum(["true", "false", "1", "0", ""])
  .default("false")
  .transform((v) => v === "true" || v === "1");

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().default("postgres://postgres:postgres@localhost:5432/purchase_compass"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  ANALYZER_URL: z.url().default("http://localhost:8000"),
  ANALYZER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  /** Public demo: data is read-only so visitors cannot change what others see. */
  DEMO_MODE: Bool,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type Config = z.infer<typeof Env>;

/** Fails fast at boot with a readable message instead of at the first request. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
