import type { LoggedOutcome, OutcomeCounts, Stats } from "./api";

/**
 * Six classes for charts. Order is fixed and is the stacking order (bottom to
 * top), the legend order and the palette order the validator passed.
 */
export const CLASSES = [
  { key: "passed", label: "Passed through", color: "var(--sap)" },
  { key: "delayed", label: "Delayed", color: "var(--latency)" },
  { key: "error", label: "Injected error", color: "var(--error)" },
  { key: "broken", label: "Broken body", color: "var(--corrupt)" },
  { key: "dropped", label: "Dropped", color: "var(--drop)" },
  { key: "other", label: "Other failure", color: "var(--other)" },
] as const;

export type ClassKey = (typeof CLASSES)[number]["key"];
export type ClassCounts = Record<ClassKey, number>;

export const CLASS_OF: Record<LoggedOutcome, ClassKey> = {
  ok: "passed",
  slow: "delayed",
  error: "error",
  corrupt: "broken",
  drop: "dropped",
  target_error: "other",
  no_response: "other",
  rate_limited: "other",
};

export const OUTCOME_LABEL: Record<LoggedOutcome, string> = {
  ok: "Passed through",
  slow: "Delayed",
  error: "Injected error",
  corrupt: "Broken body",
  drop: "Dropped",
  target_error: "Error from the target",
  no_response: "No response",
  rate_limited: "Rate limited",
};

export function toClasses(c: Omit<OutcomeCounts, "avgDurationMs" | "total">): ClassCounts {
  return {
    passed: c.ok,
    delayed: c.slow,
    error: c.error,
    broken: c.corrupt,
    dropped: c.drop,
    other: c.targetError + c.noResponse + (c.rateLimited ?? 0),
  };
}

export const RANGES = [
  { minutes: 15, label: "15 min", binMinutes: 1 },
  { minutes: 60, label: "1 hour", binMinutes: 1 },
  { minutes: 360, label: "6 hours", binMinutes: 5 },
  { minutes: 1440, label: "24 hours", binMinutes: 30 },
] as const;

export interface Bin {
  start: Date;
  counts: ClassCounts;
  total: number;
}

/**
 * Turns the API's sparse per-minute buckets into a complete, evenly spaced
 * series of bins (empty minutes become zero), merged to `binMinutes` wide.
 */
export function toBins(stats: Stats, rangeMinutes: number, binMinutes: number): Bin[] {
  const binMs = binMinutes * 60_000;
  const end = new Date(stats.to).getTime() + 60_000; // `to` is the start of the current minute
  const start = end - rangeMinutes * 60_000;
  const firstBin = Math.floor(start / binMs) * binMs;
  const bins: Bin[] = [];
  for (let t = firstBin; t < end; t += binMs) {
    bins.push({
      start: new Date(t),
      counts: { passed: 0, delayed: 0, error: 0, broken: 0, dropped: 0, other: 0 },
      total: 0,
    });
  }
  for (const bucket of stats.buckets) {
    const index = Math.floor((new Date(bucket.bucket).getTime() - firstBin) / binMs);
    const bin = bins[index];
    if (!bin) continue;
    const classes = toClasses(bucket);
    for (const c of CLASSES) bin.counts[c.key] += classes[c.key];
    bin.total += bucket.total;
  }
  return bins;
}

/** Clean axis ticks from 0 to at least `max`: steps of 1, 2 or 5 times a power of ten. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

export const formatTime = (d: Date) =>
  d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const formatCount = (n: number) =>
  n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString();
