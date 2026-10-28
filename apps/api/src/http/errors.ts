import type { Problem } from "@purchase-compass/shared";

/** An expected failure the client may see. Anything else is a bug and becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 422 | 502,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(detail ?? title);
    this.name = "AppError";
  }

  toProblem(): Problem {
    return {
      type: `https://github.com/cedarcraftworks/purchase-compass/blob/main/docs/errors.md#${this.code}`,
      title: this.title,
      status: this.status,
      code: this.code,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

export const errors = {
  validation: (detail: string) => new AppError(400, "validation_failed", "入力内容に誤りがあります", detail),
  notFound: (what: string) => new AppError(404, "not_found", `${what}が見つかりません`),
  demoReadOnly: () =>
    new AppError(403, "demo_read_only", "デモ環境では変更できません", "手元で起動するとデータを登録できます。"),
  nothingToImport: (detail: string) => new AppError(422, "nothing_to_import", "取り込める行がありません", detail),
  analyzerUnavailable: (detail: string) =>
    new AppError(502, "analyzer_unavailable", "分析サービスに接続できません", detail),
};
