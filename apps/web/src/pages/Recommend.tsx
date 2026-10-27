import type { Insights, Recommendations } from "@purchase-compass/shared";
import { formatDate, formatYen } from "../format";
import type { Resource } from "../hooks";

const STATUS_LABEL = { due: "買い時", soon: "もうすぐ", ok: "まだ先" } as const;
const SITE_LABEL = { amazon: "Amazon", rakuten: "楽天", mercari: "メルカリ" } as const;
const SOURCE_NOTE = {
  live: "楽天市場の商品検索APIから取得した商品です。",
  fallback: "楽天市場に接続できなかったため、サンプルの商品を表示しています。",
  sample: "楽天のAPIキーが未設定のため、サンプルの商品を表示しています。",
} as const;

export function Recommend({ insights, recs }: { insights: Insights; recs: Resource<Recommendations> }) {
  const items = insights.replenishment.filter((r) => r.status !== "ok").slice(0, 8);
  return (
    <>
      <section className="section">
        <h2>そろそろ買い時</h2>
        <p className="muted">繰り返し買っているものの購入間隔から、次に買う時期を見積もっています。</p>
        {items.length === 0 ? (
          <p className="empty">今すぐ買い足すものはありません。</p>
        ) : (
          <ul className="restock">
            {items.map((r) => (
              <li key={r.itemKey}>
                <span className={`status status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                <div>
                  <p className="item-title">{r.title}</p>
                  <p className="muted">
                    {r.reason}（最後の購入：{formatDate(r.lastPurchasedAt)}、これまで{r.timesBought}回）
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>あなたへのおすすめ</h2>
        {recs.loading && <p className="muted">おすすめを探しています…</p>}
        {recs.error && <p className="error">{recs.error.message}</p>}
        {recs.data && <Products recs={recs.data} />}
      </section>
    </>
  );
}

function Products({ recs }: { recs: Recommendations }) {
  if (recs.keywords.length === 0) {
    return <p className="empty">購入データが増えると、好みに合う商品をおすすめします。</p>;
  }
  return (
    <>
      <p className="muted">
        よく買う「{recs.keywords.join("」「")}」をもとに選びました。{SOURCE_NOTE[recs.sourceStatus]}
      </p>
      <ol className="products">
        {recs.products.map((p) => (
          <li key={p.url}>
            {p.imageUrl ? (
              <img src={p.imageUrl} alt="" loading="lazy" />
            ) : (
              <span className="thumb" aria-hidden="true" />
            )}
            <div>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="item-title">
                {p.title}
              </a>
              <p className="muted">{p.reason}</p>
            </div>
            <span className="price">{p.priceYen != null ? formatYen(p.priceYen) : ""}</span>
          </li>
        ))}
      </ol>
      <div className="search-links">
        <h3>ほかのお店で探す</h3>
        <p className="muted">
          AmazonとメルカリはAPIの利用条件・提供状況の都合で、検索ページへのリンクを表示しています。
        </p>
        <ul>
          {recs.keywords.map((k) => (
            <li key={k}>
              <span>{k}</span>
              {recs.searchLinks
                .filter((l) => l.keyword === k)
                .map((l) => (
                  <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer">
                    {SITE_LABEL[l.site]}で探す
                  </a>
                ))}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
