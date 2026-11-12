import { describe, expect, it } from "vitest";
import type { OutcomeCounts, Stats } from "./api";
import { CLASS_OF, CLASSES, formatCount, niceTicks, toBins, toClasses } from "./activity";

const counts = (c: Partial<OutcomeCounts> = {}): OutcomeCounts => ({
  total: 0,
  ok: 0,
  slow: 0,
  error: 0,
  drop: 0,
  corrupt: 0,
  targetError: 0,
  noResponse: 0,
  rateLimited: 0,
  avgDurationMs: null,
  ...c,
});

describe("toClasses", () => {
  it("maps outcomes to chart classes and folds the rest into other", () => {
    expect(toClasses(counts({ ok: 5, slow: 4, error: 3, corrupt: 2, drop: 1, targetError: 2, noResponse: 3, rateLimited: 4 }))).toEqual({
      passed: 5,
      delayed: 4,
      error: 3,
      broken: 2,
      dropped: 1,
      other: 9,
    });
  });

  it("accepts older ingest services without rateLimited", () => {
    const { rateLimited: _ignored, ...old } = counts({ targetError: 1 });
    expect(toClasses(old).other).toBe(1);
  });

  it("gives every logged outcome a class that exists", () => {
    const keys = CLASSES.map((c) => c.key) as string[];
    for (const cls of Object.values(CLASS_OF)) expect(keys).toContain(cls);
  });
});

describe("toBins", () => {
  const stats = (buckets: Stats["buckets"]): Stats => ({
    from: "2026-11-12T09:46:00.000Z",
    to: "2026-11-12T10:00:00.000Z", // start of the current minute
    totals: counts(),
    buckets,
  });

  it("fills empty minutes with zeros, ending with the current minute", () => {
    const bins = toBins(stats([]), 15, 1);
    expect(bins).toHaveLength(15);
    expect(bins[0].start.toISOString()).toBe("2026-11-12T09:46:00.000Z");
    expect(bins[14].start.toISOString()).toBe("2026-11-12T10:00:00.000Z");
    expect(bins.every((b) => b.total === 0)).toBe(true);
  });

  it("puts each bucket in its minute", () => {
    const bins = toBins(
      stats([{ bucket: "2026-11-12T09:58:00.000Z", ...counts({ total: 3, ok: 2, error: 1 }) }]),
      15,
      1,
    );
    const bin = bins.find((b) => b.start.toISOString() === "2026-11-12T09:58:00.000Z")!;
    expect(bin.total).toBe(3);
    expect(bin.counts).toMatchObject({ passed: 2, error: 1 });
  });

  it("merges minutes into wider bins", () => {
    const bins = toBins(
      stats([
        { bucket: "2026-11-12T09:55:00.000Z", ...counts({ total: 1, ok: 1 }) },
        { bucket: "2026-11-12T09:57:00.000Z", ...counts({ total: 2, drop: 2 }) },
      ]),
      360,
      5,
    );
    const bin = bins.find((b) => b.start.toISOString() === "2026-11-12T09:55:00.000Z")!;
    expect(bin.total).toBe(3);
    expect(bin.counts).toMatchObject({ passed: 1, dropped: 2 });
    expect(bins.reduce((sum, b) => sum + b.total, 0)).toBe(3);
  });

  it("ignores buckets outside the range", () => {
    const bins = toBins(stats([{ bucket: "2026-11-11T10:00:00.000Z", ...counts({ total: 9, ok: 9 }) }]), 15, 1);
    expect(bins.reduce((sum, b) => sum + b.total, 0)).toBe(0);
  });
});

describe("niceTicks", () => {
  it.each([
    [0, [0, 1]],
    [1, [0, 0.5, 1]],
    [7, [0, 2, 4, 6, 8]],
    [10, [0, 5, 10]],
    [38, [0, 10, 20, 30, 40]],
    [1234, [0, 500, 1000, 1500]],
  ])("max %d gives %j", (max, expected) => {
    expect(niceTicks(max)).toEqual(expected);
  });

  it("always reaches the maximum", () => {
    for (const max of [3, 17, 99, 101, 4999]) expect(niceTicks(max).at(-1)!).toBeGreaterThanOrEqual(max);
  });
});

describe("formatCount", () => {
  it("abbreviates large numbers", () => {
    expect(formatCount(9_999)).toBe((9_999).toLocaleString());
    expect(formatCount(12_345)).toBe("12.3K");
    expect(formatCount(250_000)).toBe("250K");
  });
});
