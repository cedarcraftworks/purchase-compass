import { useEffect, useState } from "react";
import { api } from "./api";
import { useResource } from "./hooks";
import { REPO_URL, SAMPLE_DATA_DOC_URL } from "./links";
import { Data } from "./pages/Data";
import { Recommend } from "./pages/Recommend";
import { Signals } from "./pages/Signals";
import { Trends } from "./pages/Trends";

const TABS = [
  { id: "trends", label: "傾向" },
  { id: "recommend", label: "おすすめ" },
  { id: "signals", label: "気づき" },
  { id: "data", label: "データ" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const tabFromHash = (): Tab => {
  const hash = window.location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as Tab) : "trends";
};

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  // Bumped after every import or edit so each view refetches.
  const [version, setVersion] = useState(0);
  const meta = useResource(api.meta, version);
  const insights = useResource(api.insights, version);
  const recs = useResource(api.recommendations, version);
  const changed = () => setVersion((v) => v + 1);

  // Each tab has its own URL (#trends, #recommend, ...): links can point at a
  // tab, and the browser's back and forward buttons move between tabs.
  useEffect(() => {
    const sync = () => setTab(tabFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const go = (id: Tab) => {
    if (id !== tab) window.location.hash = id;
  };

  // A distinct title per tab reads better in browser tabs, history and shared links.
  useEffect(() => {
    const label = TABS.find((t) => t.id === tab)?.label;
    document.title = `${label} | Purchase Compass`;
  }, [tab]);

  const empty = meta.data?.purchaseCount === 0;

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="13" />
            <path d="M16 6l3.6 10L16 26l-3.6-10z" />
          </svg>
          Purchase Compass
        </h1>
        <nav aria-label="表示の切り替え">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? "tab tab-on" : "tab"}
              aria-current={t.id === tab ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {meta.data?.demoMode && (
        <aside className="demo-banner" aria-label="このデモについて">
          <p>
            架空の大学生の約半年分・{meta.data.purchaseCount}件の購入履歴で動くデモです。
            <a href={SAMPLE_DATA_DOC_URL}>データの作り方</a>
            <a href={REPO_URL}>ソースコード</a>
          </p>
          <p className="demo-guide">
            見どころ：
            <a href="#trends">傾向</a>で買い方のクセを、
            <a href="#recommend">おすすめ</a>で理由付きの提案を、
            <a href="#signals">気づき</a>で定期課金と衝動買いを見られます。
            <a href="#data">データ</a>では見本のCSVで取り込みを試せます。
          </p>
        </aside>
      )}

      <main>
        {tab === "data" ? (
          <Data demoMode={meta.data?.demoMode ?? false} onChanged={changed} version={version} />
        ) : empty ? (
          <section className="welcome">
            <h2>まずは購入履歴を取り込みましょう</h2>
            <p>Amazon・楽天・メルカリ・お店での買い物をまとめると、買い物の傾向とおすすめが表示されます。</p>
            <button type="button" className="primary" onClick={() => go("data")}>
              購入履歴を取り込む
            </button>
          </section>
        ) : insights.error ? (
          <div className="load-error" role="alert">
            <p className="error">{insights.error.message}</p>
            <button type="button" onClick={insights.reload}>
              もう一度読み込む
            </button>
          </div>
        ) : !insights.data ? (
          <p className="muted loading">分析しています…</p>
        ) : tab === "trends" ? (
          <Trends insights={insights.data} />
        ) : tab === "recommend" ? (
          <Recommend insights={insights.data} recs={recs} />
        ) : (
          <Signals insights={insights.data} />
        )}
      </main>
    </div>
  );
}
