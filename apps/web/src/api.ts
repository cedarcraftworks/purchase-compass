import type {
  ColumnMapping,
  ImportPreview,
  ImportResult,
  Insights,
  Meta,
  NewPurchase,
  Purchase,
  Recommendations,
  Source,
} from "@purchase-compass/shared";

/** An error the API explained (RFC 9457 problem details); `detail` is written for the user. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ? `${title}：${detail}` : title);
  }
}

/**
 * Static demo (GitHub Pages): there is no server, so GET requests read a
 * snapshot that `scripts/snapshot-demo.mjs` recorded from a real API, and
 * writes are refused exactly like the API's read-only demo mode does.
 */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "true";

async function fromSnapshot<T>(method: string, path: string): Promise<T> {
  if (method !== "GET") {
    throw new ApiError(403, "demo_read_only", "デモ環境では変更できません", "手元で起動するとデータを登録できます。");
  }
  const name = path.replace(/^\/api\//, "");
  const res = await fetch(`${import.meta.env.BASE_URL}demo/${name}.json`);
  if (!res.ok) throw new ApiError(res.status, "not_found", "デモデータを読み込めません");
  return (await res.json()) as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (STATIC_DEMO) return fromSnapshot<T>(method, path);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "サーバーに接続できません", "APIが起動しているか確認してください。");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? "unknown", data?.title ?? `エラー（${res.status}）`, data?.detail);
  }
  return data as T;
}

export const api = {
  meta: () => request<Meta>("GET", "/api/meta"),
  insights: () => request<Insights>("GET", "/api/insights"),
  recommendations: () => request<Recommendations>("GET", "/api/recommendations"),
  purchases: () => request<Purchase[]>("GET", "/api/purchases"),
  addPurchase: (p: NewPurchase) => request<Purchase>("POST", "/api/purchases", p),
  deletePurchase: (id: string) => request<void>("DELETE", `/api/purchases/${id}`),
  previewImport: (source: Source, text: string, mapping?: ColumnMapping) =>
    request<ImportPreview>("POST", "/api/imports/preview", { source, text, mapping }),
  runImport: (source: Source, text: string, mapping?: ColumnMapping) =>
    request<ImportResult>("POST", "/api/imports", { source, text, mapping }),
};
