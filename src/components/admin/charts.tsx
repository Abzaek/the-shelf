"use client";
import { useId, useState } from "react";
export function TrendChart({ data, lines, format = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 }), label }: {
    data: {
        day: string;
        [key: string]: number | string | null;
    }[];
    lines: {
        key: string;
        label: string;
        color: string;
    }[];
    format?: (n: number) => string;
    label: string;
}) {
    const [hover, setHover] = useState<number | null>(null), id = useId().replaceAll(":", "");
    const width = 800, height = 230, left = 60, right = 15, top = 15, bottom = 32;
    const max = Math.max(4, Math.ceil(Math.max(0, ...data.flatMap(d => lines.map(l => Number(d[l.key] ?? 0)))) * 1.12 / 4) * 4);
    const x = (i: number) => left + i / Math.max(1, data.length - 1) * (width - left - right), y = (n: number) => height - bottom - n / max * (height - top - bottom);
    const selected = hover !== null ? data[hover] : null;
    return <div className="an-chart">
    <div className="an-chart-legend">{lines.map(l => <span key={l.key}><i style={{ background: l.color }}/>{l.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
      <title>{label}</title>
      <defs>{lines.map(l => <linearGradient key={l.key} id={`${id}-${l.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={l.color} stopOpacity=".14"/><stop offset="100%" stopColor={l.color} stopOpacity="0"/></linearGradient>)}</defs>
      {[0, .25, .5, .75, 1].map(v => <g key={v}><line x1={left} x2={width - right} y1={y(max * v)} y2={y(max * v)} stroke="var(--an-border)" strokeDasharray="3 5"/><text x={left - 12} y={y(max * v) + 4} textAnchor="end">{format(max * v)}</text></g>)}
      {lines.map(l => {
            const groups: number[][] = [];
            data.forEach((d, i) => { if (d[l.key] === null)
                return; if (!i || data[i - 1][l.key] === null)
                groups.push([]); groups.at(-1)!.push(i); });
            return <g key={l.key}>{groups.map((indices, j) => {
                    const path = indices.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(Number(data[i][l.key]))}`).join(" ");
                    return <g key={j}>
          {lines.length === 1 && <path d={`${path} L${x(indices.at(-1)!)},${height - bottom} L${x(indices[0])},${height - bottom} Z`} fill={`url(#${id}-${l.key})`}/>}
          <path d={path} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
          {indices.length === 1 && <circle cx={x(indices[0])} cy={y(Number(data[indices[0]][l.key]))} r="3" fill={l.color}/>}
        </g>;
                })}</g>;
        })}
      {data.map((d, i) => <rect key={d.day} x={x(i) - (width - left - right) / Math.max(1, data.length) / 2} y={top} width={(width - left - right) / Math.max(1, data.length)} height={height - top - bottom} fill="transparent" onMouseEnter={() => setHover(i)}><title>{`${d.day}: ${lines.map(l => `${l.label} ${d[l.key] === null ? "Unavailable" : format(Number(d[l.key]))}`).join(", ")}`}</title></rect>)}
      {[...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter(i => i >= 0).map(i => <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{new Date(data[i].day).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</text>)}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} stroke="var(--an-muted)" strokeDasharray="4"/>}
    </svg>
    <div className="an-chart-readout" aria-live="polite">{selected ? <>{selected.day} · {lines.map(l => `${l.label}: ${selected[l.key] === null ? "Unavailable" : format(Number(selected[l.key]))}`).join(" · ")}</> : "Hover to inspect · UTC · Gaps indicate unavailable history"}</div>
    <details className="an-chart-data"><summary>View chart data</summary><div className="an-table-wrap"><table><thead><tr><th>Date (UTC)</th>{lines.map(l => <th key={l.key}>{l.label}</th>)}</tr></thead><tbody>{data.map(d => <tr key={d.day}><td>{d.day}</td>{lines.map(l => <td key={l.key}>{d[l.key] === null ? "Unavailable" : format(Number(d[l.key]))}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}
