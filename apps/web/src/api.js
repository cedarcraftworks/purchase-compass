/** An error the API explained (RFC 9457 problem details); `detail` is written for the user. */
export class ApiError extends Error {
  status;
  code;
  title;
  detail;
  constructor(status, code, title, detail) {
    super(detail ? `${title}：${detail}` : title);
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
  }
}
async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "サーバーに接続できません", "APIが起動しているか確認してください。");
  }
  if (res.status === 204) return undefined;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.code ?? "unknown", data?.title ?? `エラー（${res.status}）`, data?.detail);
  }
  return data;
}
export const api = {
  meta: () => request("GET", "/api/meta"),
  insights: () => request("GET", "/api/insights"),
  recommendations: () => request("GET", "/api/recommendations"),
  purchases: () => request("GET", "/api/purchases"),
  addPurchase: (p) => request("POST", "/api/purchases", p),
  deletePurchase: (id) => request("DELETE", `/api/purchases/${id}`),
  previewImport: (source, text, mapping) => request("POST", "/api/imports/preview", { source, text, mapping }),
  runImport: (source, text, mapping) => request("POST", "/api/imports", { source, text, mapping }),
};
