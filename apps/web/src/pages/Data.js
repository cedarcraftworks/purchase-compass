import { CATEGORIES, SOURCE_LABEL, SOURCES } from "@purchase-compass/shared";
import { useState } from "react";
import { ApiError, api } from "../api";
import { formatDateTime, formatYen } from "../format";
import { useResource } from "../hooks";

const SOURCE_HINT = {
  amazon: "Amazonの「データのリクエスト」で届く Retail.OrderHistory のCSVをそのまま選べます。",
  rakuten: "購入履歴ページの表をコピーして貼り付けるか、日付・商品名・金額の列があるCSVを選んでください。",
  mercari: "購入した商品の一覧（日付・商品名・価格）をCSVにするか、表をコピーして貼り付けてください。",
  store: "レシートの内容を、日付・店名・品名・金額の列でCSVにまとめたものを選べます。1件ずつなら下のフォームから。",
  other: "カード明細のCSV（利用日・利用店名・利用金額）などを選べます。",
};
const FIELDS = [
  { key: "date", label: "日付", required: true },
  { key: "title", label: "商品名", required: true },
  { key: "amount", label: "金額", required: true },
  { key: "quantity", label: "数量", required: false },
  { key: "store", label: "店名", required: false },
];
export function Data({ demoMode, onChanged, version }) {
  const purchases = useResource(api.purchases, version);
  return (
    <>
      {demoMode && (
        <p className="notice">
          公開デモのため、データの登録と削除はできません。手元で起動すると、ご自身の購入履歴を取り込めます。
        </p>
      )}
      <Importer disabled={demoMode} onImported={onChanged} />
      <ManualEntry disabled={demoMode} onAdded={onChanged} />
      <section className="section">
        <h2>登録済みの購入</h2>
        {purchases.error && <p className="error">{purchases.error.message}</p>}
        {purchases.data && <PurchaseTable rows={purchases.data} demoMode={demoMode} onDeleted={onChanged} />}
      </section>
    </>
  );
}
function Importer({ disabled, onImported }) {
  const [source, setSource] = useState("amazon");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState();
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  async function runPreview(nextText = text, nextMapping = mapping) {
    if (!nextText.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const p = await api.previewImport(source, nextText, nextMapping);
      setPreview(p);
      setMapping(p.mapping ?? undefined);
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }
  async function onFile(file) {
    if (!file) return;
    const content = await file.text();
    setText(content);
    setMapping(undefined);
    await runPreview(content, undefined);
  }
  async function save() {
    setBusy(true);
    try {
      const r = await api.runImport(source, text, mapping);
      setMessage({
        kind: "ok",
        text: `${r.inserted}件を取り込みました。${r.duplicates > 0 ? `${r.duplicates}件は登録済みのため飛ばしました。` : ""}`,
      });
      setPreview(null);
      setText("");
      onImported();
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }
  function changeMapping(key, value) {
    const base = mapping ?? { date: "", title: "", amount: "" };
    const next = { ...base, [key]: value || null };
    setMapping(next);
    if (next.date && next.title && next.amount) void runPreview(text, next);
  }
  return (
    <section className="section">
      <h2>購入履歴を取り込む</h2>
      <fieldset className="sources" disabled={disabled}>
        <legend>どこで買ったものですか</legend>
        {SOURCES.map((s) => (
          <label key={s} className={s === source ? "chip chip-on" : "chip"}>
            <input type="radio" name="source" value={s} checked={s === source} onChange={() => setSource(s)} />
            {SOURCE_LABEL[s]}
          </label>
        ))}
      </fieldset>
      <p className="muted">{SOURCE_HINT[source]}</p>
      <div className="import-inputs">
        <label className="file">
          CSVファイルを選ぶ
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            disabled={disabled}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <span className="muted">または</span>
        <textarea
          aria-label="表を貼り付ける"
          placeholder="表をここに貼り付ける（1行目は列名）"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
        <button type="button" onClick={() => void runPreview()} disabled={disabled || busy || !text.trim()}>
          読み取り結果を確認
        </button>
      </div>

      {preview && (
        <div className="preview">
          <p>
            {preview.format === "amazon"
              ? "Amazonの注文履歴として読み取りました。"
              : "列名から項目を推測しました。違っていたら直してください。"}
            全{preview.totalRows}行
          </p>
          {preview.format === "mapped" && (
            <div className="mapping">
              {FIELDS.map((f) => (
                <label key={f.key}>
                  {f.label}
                  {f.required ? "" : "（任意）"}
                  <select value={mapping?.[f.key] ?? ""} onChange={(e) => changeMapping(f.key, e.target.value)}>
                    <option value="">{f.required ? "選んでください" : "なし"}</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {preview.issues.length > 0 && (
            <ul className="issues">
              {preview.issues.slice(0, 5).map((i) => (
                <li key={`${i.line}-${i.message}`}>
                  {i.line}行目：{i.message}
                </li>
              ))}
              {preview.issues.length > 5 && <li>ほか{preview.issues.length - 5}件</li>}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">日時</th>
                  <th scope="col">商品名</th>
                  <th scope="col">金額</th>
                  <th scope="col">数量</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td>{formatDateTime(r.orderedAt)}</td>
                    <td>{r.title}</td>
                    <td className="num">{formatYen(r.amountYen)}</td>
                    <td className="num">{r.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button
            type="button"
            className="primary"
            onClick={() => void save()}
            disabled={busy || preview.rows.length === 0}
          >
            {preview.totalRows}行を取り込む
          </button>
        </div>
      )}
      {message && <p className={message.kind === "ok" ? "success" : "error"}>{message.text}</p>}
    </section>
  );
}
function ManualEntry({ disabled, onAdded }) {
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setError(null);
    try {
      const added = await api.addPurchase({
        source: f.get("source"),
        orderedAt: new Date(`${f.get("date")}T${f.get("time") || "12:00"}:00+09:00`).toISOString(),
        title: String(f.get("title")),
        amountYen: Number(f.get("amount")),
        quantity: Number(f.get("quantity") || 1),
        store: String(f.get("store") || "") || null,
        category: String(f.get("category") || "") || null,
      });
      setDone(`「${added.title}」を登録しました。`);
      form.reset();
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登録できませんでした。");
    }
  }
  return (
    <section className="section">
      <h2>1件ずつ登録する</h2>
      <p className="muted">お店での買い物など、ファイルがないものはここから登録できます。</p>
      <form className="manual" onSubmit={(e) => void submit(e)}>
        <fieldset disabled={disabled}>
          <label>
            買った場所
            <select name="source" defaultValue="store">
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            日付
            <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label>
            時刻
            <input name="time" type="time" />
          </label>
          <label className="wide">
            商品名
            <input name="title" required maxLength={500} />
          </label>
          <label>
            金額（円）
            <input name="amount" type="number" min={0} required inputMode="numeric" />
          </label>
          <label>
            数量
            <input name="quantity" type="number" min={1} defaultValue={1} />
          </label>
          <label>
            店名
            <input name="store" />
          </label>
          <label>
            カテゴリ
            <select name="category" defaultValue="">
              <option value="">自動で判定</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">
            登録する
          </button>
        </fieldset>
      </form>
      {error && <p className="error">{error}</p>}
      {done && <p className="success">{done}</p>}
    </section>
  );
}
function PurchaseTable({ rows, demoMode, onDeleted }) {
  const [shown, setShown] = useState(30);
  if (rows.length === 0)
    return <p className="empty">まだ購入が登録されていません。上のフォームから取り込んでください。</p>;
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">日時</th>
            <th scope="col">場所</th>
            <th scope="col">商品名</th>
            <th scope="col">金額</th>
            {!demoMode && <th scope="col">操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, shown).map((p) => (
            <tr key={p.id}>
              <td>{formatDateTime(p.orderedAt)}</td>
              <td>{SOURCE_LABEL[p.source]}</td>
              <td>{p.title}</td>
              <td className="num">{formatYen(p.amountYen)}</td>
              {!demoMode && (
                <td>
                  <button
                    type="button"
                    className="link"
                    onClick={async () => {
                      if (window.confirm(`「${p.title}」を削除しますか？`)) {
                        await api.deletePurchase(p.id);
                        onDeleted();
                      }
                    }}
                  >
                    削除
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {shown < rows.length && (
        <button type="button" onClick={() => setShown((n) => n + 50)}>
          さらに表示（残り{rows.length - shown}件）
        </button>
      )}
    </>
  );
}
