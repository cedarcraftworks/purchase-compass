import { SOURCE_LABEL, SOURCES, type Source } from "@purchase-compass/shared";
import { formatYen, percent } from "../format";

type Props = { bySource: { source: Source; totalYen: number; share: number }[]; totalYen: number };

const SIZE = 340;
const C = SIZE / 2;
const R = 118; // radius of the outer ring (100% share)

/**
 * The spending compass: one petal per shop, its length set by the share of
 * money spent there (square-root scaled so small shops stay visible), and a
 * needle pointing at where most of the money goes.
 */
export function Compass({ bySource, totalYen }: Props) {
  const share = new Map(bySource.map((s) => [s.source, s.share]));
  const top = [...bySource].sort((a, b) => b.totalYen - a.totalYen)[0];
  const angle = (i: number) => (i / SOURCES.length) * 2 * Math.PI - Math.PI / 2;
  const point = (a: number, r: number) => [C + Math.cos(a) * r, C + Math.sin(a) * r] as const;

  const petals = SOURCES.map((source, i) => {
    const a = angle(i);
    const len = Math.max(Math.sqrt(share.get(source) ?? 0) * R, 6);
    const [tx, ty] = point(a, len);
    const [lx, ly] = point(a - 0.32, len * 0.42);
    const [rx, ry] = point(a + 0.32, len * 0.42);
    const [labelX, labelY] = point(a, R + 30);
    return { source, a, d: `M${C},${C} L${lx},${ly} L${tx},${ty} L${rx},${ry} Z`, labelX, labelY };
  });

  const topIndex = top ? SOURCES.indexOf(top.source) : -1;
  const needle = topIndex >= 0 ? angle(topIndex) : -Math.PI / 2;
  const [nx, ny] = point(needle, R - 14);

  return (
    <figure className="compass">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={top ? `支出の${percent(top.share)}が${SOURCE_LABEL[top.source]}` : "支出のデータがありません"}
      >
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={C} cy={C} r={Math.sqrt(f) * R} className="compass-ring" />
        ))}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * 2 * Math.PI;
          const [x1, y1] = point(a, R + 4);
          const [x2, y2] = point(a, R + (i % 9 === 0 ? 14 : 9));
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} className="compass-tick" />;
        })}
        {petals.map((p) => (
          <path key={p.source} d={p.d} className={`compass-petal petal-${p.source}`} />
        ))}
        <line x1={C} y1={C} x2={nx} y2={ny} className="compass-needle" />
        <circle cx={C} cy={C} r={5} className="compass-hub" />
        {petals.map((p) => (
          <text key={p.source} x={p.labelX} y={p.labelY} className="compass-label" textAnchor="middle">
            <tspan x={p.labelX} dy="-0.2em">
              {SOURCE_LABEL[p.source].replace("・カード明細", "")}
            </tspan>
            <tspan x={p.labelX} dy="1.25em" className="compass-share">
              {percent(share.get(p.source) ?? 0)}
            </tspan>
          </text>
        ))}
      </svg>
      <figcaption>
        {top ? (
          <>
            お金の向かう先は<strong>{SOURCE_LABEL[top.source]}</strong>。合計{formatYen(totalYen)}のうち
            {percent(top.share)}です。
          </>
        ) : (
          "まだ購入データがありません。"
        )}
      </figcaption>
    </figure>
  );
}
