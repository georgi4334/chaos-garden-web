"use client";

import { useEffect, useState } from "react";
import {
  CLASS_OF,
  CLASSES,
  formatCount,
  OUTCOME_LABEL,
  RANGES,
  toBins,
  toClasses,
  type ClassCounts,
} from "@/lib/activity";
import { ApiError, logsApi, type RequestLog, type Stats } from "@/lib/api";
import { errorText, monoClass, quietButton } from "@/lib/ui";
import { ActivityChart } from "./activity-chart";

const PAGE = 20;
const AUTO_REFRESH_MS = 15_000;

interface Data {
  stats: Stats;
  requests: RequestLog[];
  nextBefore: string | null;
  loadedAt: Date;
}

/**
 * What actually happened to requests through this target: headline numbers,
 * the split by outcome, outcomes over time, and the most recent requests.
 * `refreshKey` changes when the caller knows new requests were just sent.
 */
export function Activity({
  gardenId,
  token,
  targetId,
  refreshKey,
}: {
  gardenId: string;
  token: string;
  targetId: string;
  refreshKey: number;
}) {
  const [rangeIndex, setRangeIndex] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const range = RANGES[rangeIndex];

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [stats, page] = await Promise.all([
          logsApi.stats(gardenId, token, { targetId, minutes: range.minutes }),
          logsApi.requests(gardenId, token, { targetId, limit: PAGE }),
        ]);
        if (cancelled) return;
        setData({ stats, requests: page.items, nextBefore: page.nextBefore, loadedAt: new Date() });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load activity.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gardenId, token, targetId, range.minutes, refreshKey, tick]);

  async function loadOlder() {
    if (!data?.nextBefore) return;
    try {
      const page = await logsApi.requests(gardenId, token, { targetId, limit: PAGE, before: data.nextBefore });
      setData((d) => d && { ...d, requests: [...d.requests, ...page.items], nextBefore: page.nextBefore });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load older requests.");
    }
  }

  return (
    <section aria-labelledby="activity-heading" className="mt-12">
      <h2 id="activity-heading" className="text-2xl font-bold tracking-tight">
        Activity
      </h2>
      <p className="mt-1 max-w-prose text-ink-soft">
        Every request that went through the proxy for this target, from any app.
      </p>

      {/* One filter row, above everything it scopes. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Time range" className="inline-flex rounded-md border border-line bg-pane p-0.5">
          {RANGES.map((r, i) => (
            <button
              key={r.minutes}
              type="button"
              role="radio"
              aria-checked={i === rangeIndex}
              onClick={() => setRangeIndex(i)}
              className={`rounded px-3 py-1 text-sm font-medium ${i === rangeIndex ? "bg-ink text-glass" : "hover:bg-glass"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className={quietButton} onClick={() => setTick((t) => t + 1)} disabled={loading}>
          Refresh
        </button>
        {data && (
          <span className="text-sm text-ink-soft" aria-live="polite">
            {loading ? "Updating…" : `Updated ${data.loadedAt.toLocaleTimeString()}`}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className={`${errorText} mt-3`}>
          {error}
        </p>
      )}

      {!data && loading && <p className="mt-6 text-ink-soft">Loading activity…</p>}

      {data && (
        // Refetch keeps the frame: the previous render stays, dimmed, until new data arrives.
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          {data.stats.totals.total === 0 ? (
            <p className="mt-6 max-w-prose text-ink-soft">
              No requests in the last {range.label}. Send some through the proxy URL, or use Try it above.
            </p>
          ) : (
            <>
              <Summary stats={data.stats} />
              <h3 className="mt-8 font-bold">Over time</h3>
              <div className="mt-2">
                <ActivityChart bins={toBins(data.stats, range.minutes, range.binMinutes)} binMinutes={range.binMinutes} />
              </div>
            </>
          )}
          <RecentRequests items={data.requests} canLoadMore={Boolean(data.nextBefore)} onLoadMore={loadOlder} />
        </div>
      )}
    </section>
  );
}

function Summary({ stats }: { stats: Stats }) {
  const { totals } = stats;
  const classes: ClassCounts = toClasses(totals);
  const faulted = classes.delayed + classes.error + classes.broken + classes.dropped;
  const share = (n: number) => (totals.total ? (n / totals.total) * 100 : 0);
  const pct = (n: number) => `${share(n) < 10 && share(n) > 0 ? share(n).toFixed(1) : Math.round(share(n))}%`;

  return (
    <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <dl className="grid grid-cols-3 gap-4">
        <Tile label="Requests" value={formatCount(totals.total)} />
        <Tile label="Hit by a fault" value={pct(faulted)} />
        <Tile label="Average time" value={totals.avgDurationMs === null ? "–" : `${totals.avgDurationMs} ms`} />
      </dl>

      <div>
        <h3 className="sr-only">Outcomes</h3>
        {/* Thin segmented bar: no text on it, the list below carries the figures. */}
        <div
          className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={CLASSES.map((c) => `${c.label} ${classes[c.key]} (${pct(classes[c.key])})`).join(", ")}
        >
          {CLASSES.filter((c) => classes[c.key] > 0).map((c) => (
            <span key={c.key} style={{ flexGrow: classes[c.key], background: c.color }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
          {CLASSES.map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden="true" />
              <span className="flex-1 whitespace-nowrap">{c.label}</span>
              <span className="tabular-nums font-semibold">{classes[c.key]}</span>
              <span className="w-12 text-right tabular-nums text-ink-soft">{pct(classes[c.key])}</span>
            </li>
          ))}
        </ul>
        {classes.other > 0 && (
          <p className="mt-2 text-sm text-ink-soft">
            Other failure means the target itself returned an error, or no response was sent.
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 text-3xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

function RecentRequests({
  items,
  canLoadMore,
  onLoadMore,
}: {
  items: RequestLog[];
  canLoadMore: boolean;
  onLoadMore: () => void;
}) {
  if (items.length === 0) return null;
  const color = (o: RequestLog["outcome"]) => CLASSES.find((c) => c.key === CLASS_OF[o])!.color;
  return (
    <div className="mt-10">
      <h3 className="font-bold">Recent requests</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Most recent requests through the proxy, newest first</caption>
          <thead>
            <tr className="border-b border-line text-left text-ink-soft">
              <th scope="col" className="py-1.5 pr-3 font-medium">Time</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Request</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Outcome</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Status</th>
              <th scope="col" className="py-1.5 text-right font-medium">Took</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-line/60 align-top">
                <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums text-ink-soft">
                  {new Date(r.occurredAt).toLocaleTimeString()}
                </td>
                <td className={`${monoClass} py-1.5 pr-3 [overflow-wrap:anywhere]`}>
                  <span className="font-semibold">{r.method}</span> {r.path}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: color(r.outcome) }} aria-hidden="true" />
                  {OUTCOME_LABEL[r.outcome]}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{r.status ?? "–"}</td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{r.durationMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canLoadMore && (
        <button type="button" className={`${quietButton} mt-3`} onClick={onLoadMore}>
          Load older requests
        </button>
      )}
    </div>
  );
}
