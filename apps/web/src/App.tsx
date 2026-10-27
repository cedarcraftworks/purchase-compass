import { useState } from "react";
import { api } from "./api";
import { useResource } from "./hooks";
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

const initialTab = (): Tab => {
  const hash = window.location.hash.slice(1);
  return TABS.some((t) => t.id === hash) ? (hash as Tab) : "trends";
};

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  // Bumped after every import or edit so each view refetches.
  const [version, setVersion] = useState(0);
  const meta = useResource(api.meta, version);
  const insights = useResource(api.insights, version);
  const recs = useResource(api.recommendations, version);
  const changed = () => setVersion((v) => v + 1);

  const go = (id: Tab) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

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
        <p className="demo-banner">
          デモ用の架空の購入履歴（大学生・約半年分）を表示しています。
          <a href="https://github.com/kaisei467/purchase-compass">ソースコード</a>
        </p>
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
          <p className="error">{insights.error.message}</p>
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
