"use client";

import { useEffect, useRef, useState } from "react";
import { CLASSES, formatCount, formatTime, niceTicks, type Bin } from "@/lib/activity";

const PLOT_HEIGHT = 160;
const AXIS_BAND = 26; // room for the x-axis labels, inside the container's height
const LEFT = 40; // y-axis labels
const GAP = 2; // surface gap between stacked segments and between columns
const MAX_COL = 24;
const RADIUS = 4;

/** A rect with only its top corners rounded (data end), square at the baseline. */
function topRounded(x: number, y: number, w: number, h: number) {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function ActivityChart({ bins, binMinutes }: { bins: Bin[]; binMinutes: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = bins.length;
  const plotW = Math.max(0, width - LEFT);
  const band = n ? plotW / n : 0;
  const colW = Math.max(1, Math.min(MAX_COL, band - GAP));
  const ticks = niceTicks(Math.max(...bins.map((b) => b.total), 0));
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => (v / yMax) * PLOT_HEIGHT;
  const labelIdx = n <= 1 ? [0] : [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  const binLabel = (b: Bin) =>
    binMinutes === 1
      ? formatTime(b.start)
      : `${formatTime(b.start)} to ${formatTime(new Date(b.start.getTime() + binMinutes * 60_000))}`;

  function onKeyDown(e: React.KeyboardEvent) {
    if (!n) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (step > 0 ? -1 : n)) + step)));
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape") setActive(null);
  }

  const activeBin = active !== null ? bins[active] : null;
  const tooltipLeft = active !== null ? LEFT + band * active + band / 2 : 0;

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative"
        style={{ height: PLOT_HEIGHT + AXIS_BAND + 8 }}
        tabIndex={0}
        role="group"
        aria-label="Requests over time by outcome. Use the left and right arrow keys to read each column."
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg width={width} height={PLOT_HEIGHT + AXIS_BAND + 8} aria-hidden="true" onPointerLeave={() => setActive(null)}>
            <g transform="translate(0,8)">
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={LEFT} x2={width} y1={PLOT_HEIGHT - y(t) + 0.5} y2={PLOT_HEIGHT - y(t) + 0.5} stroke="var(--line)" strokeWidth={1} />
                  <text x={LEFT - 8} y={PLOT_HEIGHT - y(t)} dy="0.32em" textAnchor="end" className="fill-ink-soft text-[11px] tabular-nums">
                    {formatCount(t)}
                  </text>
                </g>
              ))}

              {bins.map((bin, i) => {
                const x = LEFT + band * i + (band - colW) / 2;
                const parts = CLASSES.filter((c) => bin.counts[c.key] > 0);
                let base = PLOT_HEIGHT;
                return (
                  <g key={bin.start.getTime()}>
                    {active === i && <rect x={LEFT + band * i} y={0} width={band} height={PLOT_HEIGHT} fill="var(--ink)" opacity={0.06} />}
                    {parts.map((c, j) => {
                      const h = y(bin.counts[c.key]);
                      const top = base - h;
                      const isTop = j === parts.length - 1;
                      const drawTop = isTop ? top : top + GAP; // gap above every segment except the top one
                      const drawH = Math.max(isTop ? h : h - GAP, 1);
                      base = top;
                      return isTop ? (
                        <path key={c.key} d={topRounded(x, drawTop, colW, drawH)} fill={c.color} />
                      ) : (
                        <rect key={c.key} x={x} y={drawTop} width={colW} height={drawH} fill={c.color} />
                      );
                    })}
                    {/* Hit target: the whole band, taller and wider than the painted column. */}
                    <rect x={LEFT + band * i} y={0} width={band} height={PLOT_HEIGHT} fill="transparent" onPointerEnter={() => setActive(i)} />
                  </g>
                );
              })}

              <line x1={LEFT} x2={width} y1={PLOT_HEIGHT + 0.5} y2={PLOT_HEIGHT + 0.5} stroke="var(--ink-soft)" strokeWidth={1} />
              {[...new Set(labelIdx)].map((i, k, all) => (
                <text
                  key={i}
                  x={LEFT + band * i + band / 2}
                  y={PLOT_HEIGHT + 18}
                  textAnchor={k === 0 ? "start" : k === all.length - 1 ? "end" : "middle"}
                  className="fill-ink-soft text-[11px] tabular-nums"
                >
                  {formatTime(bins[i].start)}
                </text>
              ))}
            </g>
          </svg>
        )}

        {activeBin && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-52 rounded-md border border-line bg-pane px-3 py-2 text-sm shadow-sm"
            style={{ left: Math.min(Math.max(tooltipLeft - 104, 0), Math.max(width - 208, 0)) }}
            role="status"
          >
            <p className="mb-1 text-ink-soft">{binLabel(activeBin)}</p>
            <ul className="space-y-0.5">
              {CLASSES.map((c) => (
                <li key={c.key} className="flex items-center gap-2">
                  <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                  <span className="font-semibold tabular-nums">{activeBin.counts[c.key]}</span>
                  <span className="text-ink-soft">{c.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 border-t border-line pt-1">
              <span className="font-semibold tabular-nums">{activeBin.total}</span> <span className="text-ink-soft">requests</span>
            </p>
          </div>
        )}
      </div>

      <button type="button" className="mt-2 text-sm font-medium underline underline-offset-2 hover:text-sap-deep" onClick={() => setShowTable((s) => !s)} aria-expanded={showTable}>
        {showTable ? "Hide table" : "Show as table"}
      </button>
      {showTable && <BinTable bins={bins} label={binLabel} />}
    </div>
  );
}

function BinTable({ bins, label }: { bins: Bin[]; label: (b: Bin) => string }) {
  const rows = bins.filter((b) => b.total > 0);
  if (rows.length === 0) return <p className="mt-2 text-sm text-ink-soft">No requests in this period.</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Requests per period by outcome</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            <th scope="col" className="py-1.5 pr-3 font-medium">Time</th>
            {CLASSES.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-1.5 text-right font-medium">{c.label}</th>
            ))}
            <th scope="col" className="py-1.5 pl-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((b) => (
            <tr key={b.start.getTime()} className="border-b border-line/60">
              <th scope="row" className="whitespace-nowrap py-1.5 pr-3 text-left font-normal">{label(b)}</th>
              {CLASSES.map((c) => (
                <td key={c.key} className="px-2 py-1.5 text-right">{b.counts[c.key]}</td>
              ))}
              <td className="py-1.5 pl-2 text-right font-semibold">{b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
