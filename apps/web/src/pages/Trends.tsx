import type { Insights } from "@purchase-compass/shared";
import { Compass } from "../components/Compass";
import { CategoryBars, Heatmap, MonthlyBars } from "../components/charts";
import { formatDate, formatYen } from "../format";

const KIND_LABEL: Record<Insights["findings"][number]["kind"], string> = {
  time: "時間帯",
  weekday: "曜日",
  category_trend: "最近の変化",
  site_preference: "買う場所",
  secondhand: "中古",
  basket: "買い方",
};

export function Trends({ insights }: { insights: Insights }) {
  const { summary } = insights;
  return (
    <>
      <section className="hero">
        <Compass bySource={insights.bySource} totalYen={summary.totalYen} />
        <div className="findings">
          <h2>あなたの買い物の傾向</h2>
          {insights.findings.length === 0 ? (
            <p className="muted">購入が5件以上になると、傾向をお知らせします。</p>
          ) : (
            <ul>
              {insights.findings.map((f) => (
                <li key={f.text}>
                  <span className="finding-kind">{KIND_LABEL[f.kind]}</span>
                  <span className="finding-text">{f.text}</span>
                </li>
              ))}
            </ul>
          )}
          {summary.periodStart && summary.periodEnd && (
            <p className="period">
              {formatDate(summary.periodStart)}〜{formatDate(summary.periodEnd)}の{summary.purchaseCount}
              件、1件あたり平均
              {formatYen(summary.averageYen)}
            </p>
          )}
        </div>
      </section>

      <section className="panel-grid">
        <div className="panel">
          <h3>月別の支出</h3>
          <MonthlyBars monthly={insights.monthly} />
        </div>
        <div className="panel">
          <h3>カテゴリ別の支出</h3>
          <CategoryBars byCategory={insights.byCategory} />
        </div>
        <div className="panel panel-wide">
          <h3>いつ買っているか</h3>
          <p className="muted">色が濃いほど、その曜日・時間帯の購入が多いことを表します。</p>
          <Heatmap cells={insights.heatmap} />
        </div>
      </section>
    </>
  );
}
