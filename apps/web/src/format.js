const yen = new Intl.NumberFormat("ja-JP");
const date = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const dateTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
export const formatYen = (n) => `${yen.format(n)}円`;
export const formatDate = (iso) => date.format(new Date(iso));
export const formatDateTime = (iso) => dateTime.format(new Date(iso));
export const percent = (share) => `${Math.round(share * 100)}%`;
/** "2026-05" → "5月" */
export const monthLabel = (month) => `${Number(month.slice(5, 7))}月`;
