import { formatYen, monthLabel, percent } from "../format";
/** Monthly spend as columns. Plain SVG: three simple charts do not justify a charting library. */
export function MonthlyBars({ monthly }) {
  const max = Math.max(...monthly.map((m) => m.totalYen), 1);
  const w = 520;
  const h = 180;
  const bar = Math.min(48, (w - 40) / Math.max(monthly.length, 1) - 12);
  return (
    <svg viewBox={`0 0 ${w} ${h + 40}`} role="img" aria-label="月別の支出" className="chart">
      <line x1="0" x2={w} y1={h} y2={h} className="axis" />
      {monthly.map((m, i) => {
        const x = 20 + i * ((w - 40) / monthly.length) + 6;
        const bh = (m.totalYen / max) * (h - 24);
        return (
          <g key={m.month}>
            <title>{`${m.month}：${formatYen(m.totalYen)}（${m.count}件）`}</title>
            <rect x={x} y={h - bh} width={bar} height={bh} rx="3" className="bar" />
            <text x={x + bar / 2} y={h - bh - 6} textAnchor="middle" className="bar-value">
              {Math.round(m.totalYen / 1000)}千
            </text>
            <text x={x + bar / 2} y={h + 20} textAnchor="middle" className="bar-label">
              {monthLabel(m.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
export function CategoryBars({ byCategory }) {
  const max = Math.max(...byCategory.map((c) => c.totalYen), 1);
  return (
    <ul className="hbars">
      {byCategory.map((c) => (
        <li key={c.category}>
          <span className="hbar-name">{c.category}</span>
          <span className="hbar-track" aria-hidden="true">
            <span className="hbar-fill" style={{ width: `${(c.totalYen / max) * 100}%` }} />
          </span>
          <span className="hbar-value">
            {formatYen(c.totalYen)} <small>{percent(c.share)}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
export function Heatmap({ cells }) {
  const counts = new Map(cells.map((c) => [`${c.weekday}-${c.hour}`, c.count]));
  const max = Math.max(...cells.map((c) => c.count), 1);
  const cell = 18;
  const left = 22;
  return (
    <svg
      viewBox={`0 0 ${left + 24 * cell + 4} ${7 * cell + 22}`}
      role="img"
      aria-label="曜日と時間帯ごとの購入回数"
      className="chart heatmap"
    >
      {DAYS.map((d, w) => (
        <text key={d} x="0" y={w * cell + 13} className="bar-label">
          {d}
        </text>
      ))}
      {DAYS.map((_, w) =>
        Array.from({ length: 24 }, (_, hr) => {
          const n = counts.get(`${w}-${hr}`) ?? 0;
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed 7×24 grid
              key={`${w}-${hr}`}
              x={left + hr * cell}
              y={w * cell}
              width={cell - 2}
              height={cell - 2}
              rx="2"
              className="heat"
              style={{ opacity: n === 0 ? 1 : 0.25 + 0.75 * (n / max) }}
              data-empty={n === 0}
            >
              <title>{`${DAYS[w]}曜 ${hr}時台：${n}件`}</title>
            </rect>
          );
        }),
      )}
      {[0, 6, 12, 18, 23].map((hr) => (
        <text key={hr} x={left + hr * cell + cell / 2 - 1} y={7 * cell + 16} textAnchor="middle" className="bar-label">
          {hr}時
        </text>
      ))}
    </svg>
  );
}
