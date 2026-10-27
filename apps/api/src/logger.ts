/**
 * A tiny structured logger: one JSON object per line on stdout, which is what
 * log collectors (CloudWatch, Datadog, Loki, ...) expect from containers.
 */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level | "silent", number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

export type Logger = {
  [L in Level]: (msg: string, fields?: Record<string, unknown>) => void;
} & { child: (fields: Record<string, unknown>) => Logger };

export function createLogger(level: Level | "silent" = "info", base: Record<string, unknown> = {}): Logger {
  const emit = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < ORDER[level]) return;
    const line = { time: new Date().toISOString(), level: lvl, msg, ...base, ...fields };
    process.stdout.write(`${JSON.stringify(line, errorReplacer)}\n`);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => createLogger(level, { ...base, ...fields }),
  };
}

function errorReplacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}
