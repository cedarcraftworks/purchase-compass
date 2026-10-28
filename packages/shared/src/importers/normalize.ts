/**
 * Turns the many ways shops write dates and prices into one format.
 * Times without a zone are taken as Japan time, which is what every
 * supported shop shows its customers.
 */

const JST_OFFSET = "+09:00";

/**
 * Accepts e.g. "2026-05-03T13:21:44Z", "2026/05/03 21:10", "2026年05月03日 21:10",
 * "2026-05-03". A date without a time becomes noon, so it stays on the same day
 * in any time zone the analysis might use.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const m = s.match(/^(\d{4})[/\-年.](\d{1,2})[/\-月.](\d{1,2})日?(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "12", mi = "00", sec = "00"] = m;
  const iso = `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${mi}:${sec}${JST_OFFSET}`;
  const date = new Date(iso);
  // new Date("2026-02-31...") silently rolls over to March; reject it instead.
  if (Number.isNaN(date.getTime()) || !sameCalendarDay(date, Number(y), Number(mo), Number(d))) return null;
  return date.toISOString();
}

/** "¥1,280", "1,280円", "￥ 980", "3980" → 1280 / 1280 / 980 / 3980. Negative or decimal → null. */
export function parseYen(raw: string): number | null {
  const s = raw.replace(/[¥￥円,\s]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseQuantity(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function pad(v: string | undefined): string {
  return (v ?? "").padStart(2, "0");
}

function sameCalendarDay(date: Date, y: number, m: number, d: number): boolean {
  const jst = new Date(date.getTime() + 9 * 3600 * 1000);
  return jst.getUTCFullYear() === y && jst.getUTCMonth() + 1 === m && jst.getUTCDate() === d;
}
