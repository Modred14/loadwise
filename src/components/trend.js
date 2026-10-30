"use client";
const ZONE_VAR = { low: "var(--zone-low)", medium: "var(--zone-medium)", high: "var(--zone-high)", critical: "var(--zone-critical)" };

const BANDS = [[0, 30, "low"], [30, 55, "medium"], [55, 75, "high"], [75, 100, "critical"]];
const short = (d) => { const [, m, day] = d.split("-"); return `${Number(day)}/${Number(m)}`; };

/** Score-over-time chart. Solid zone bands behind a single line; no gradients. points: [{ day, score }] ascending. */
export default function TrendChart({ points, valueKey = "score", label = "Workload score over time", height = 160 }) {
  if (!points?.length) return null;
  const W = 600, H = height, L = 30, R = 10, T = 8, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const x = (i) => L + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => T + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p[valueKey]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. Latest ${last[valueKey]} on ${last.day}. ${points.length} day${points.length === 1 ? "" : "s"} shown.`} className="block h-auto w-full">
        {BANDS.map(([lo, hi, z]) => <rect key={z} x={L} y={y(hi)} width={iw} height={y(lo) - y(hi)} style={{ fill: ZONE_VAR[z] }} opacity="0.12" />)}
        {[0, 30, 55, 75, 100].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" className="tnum">{v}</text></g>
        ))}
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 45 ? points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p[valueKey])} r="2.5" fill="var(--ink)"><title>{`${p.day}: ${p[valueKey]}`}</title></circle>) : null}
        <circle cx={x(points.length - 1)} cy={y(last[valueKey])} r="4.5" style={{ fill: ZONE_VAR[BANDS.find(([lo, hi]) => last[valueKey] >= lo && last[valueKey] < hi + (hi === 100 ? 1 : 0))?.[2] ?? "low"] }} stroke="var(--surface)" strokeWidth="2" />
        <text x={L} y={H - 6} fontSize="9" fill="var(--muted)" className="tnum">{short(points[0].day)}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="9" fill="var(--muted)" className="tnum">{short(last.day)}</text>
      </svg>
    </figure>
  );
}
