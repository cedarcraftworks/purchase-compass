import { formatDate, formatDateTime, formatYen } from "../format";
export function Signals({ insights }) {
  const yearly = insights.subscriptions.reduce((sum, s) => sum + s.yearlyCostYen, 0);
  return (
    <>
      <section className="section">
        <h2>定期的な支払い</h2>
        <p className="muted">
          同じ金額がほぼ一定の間隔で続いている支払いです。
          {insights.subscriptions.length > 0 && <>合計で年間約{formatYen(yearly)}になります。</>}
        </p>
        {insights.subscriptions.length === 0 ? (
          <p className="empty">定期的な支払いは見つかりませんでした。</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">支払い先</th>
                <th scope="col">金額</th>
                <th scope="col">年間</th>
                <th scope="col">次回の見込み</th>
              </tr>
            </thead>
            <tbody>
              {insights.subscriptions.map((s) => (
                <tr key={s.key}>
                  <td>
                    {s.title}
                    <small className="muted block">{s.reason}</small>
                  </td>
                  <td className="num">
                    {formatYen(s.amountYen)}／{s.cadence === "monthly" ? "月" : "年"}
                  </td>
                  <td className="num">{formatYen(s.yearlyCostYen)}</td>
                  <td>{formatDate(s.nextExpectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="section">
        <h2>衝動買いかもしれない購入</h2>
        <p className="muted">
          深夜の購入、短時間の連続購入、いつもより高い金額などを点数にして、50点以上を表示しています。
        </p>
        {insights.impulse.length === 0 ? (
          <p className="empty">衝動買いらしい購入は見つかりませんでした。</p>
        ) : (
          <ul className="impulse">
            {insights.impulse.slice(0, 10).map((c) => (
              <li key={c.purchaseId}>
                <span className="score" title="衝動買いスコア（100点満点）">
                  {c.score}
                </span>
                <div>
                  <p className="item-title">
                    {c.title} <span className="muted">{formatYen(c.amountYen)}</span>
                  </p>
                  <p className="muted">{formatDateTime(c.orderedAt)}</p>
                  <ul className="reasons">
                    {c.reasons.map((r) => (
                      <li key={r.code}>
                        {r.label} <span className="muted">+{r.points}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
