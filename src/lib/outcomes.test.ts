import { describe, expect, it } from "vitest";
import type { Rule } from "./api";
import { classify, describeRule } from "./outcomes";

describe("classify", () => {
  it.each([
    [200, null, "ok"],
    [200, "latency", "slow"],
    [503, "error", "error"],
    [503, "latency,error", "error"],
    [200, "corrupt", "corrupt"],
    [200, "latency,corrupt", "corrupt"],
    [399, null, "ok"],
    [400, null, "target-error"],
    [404, null, "target-error"],
    [500, "latency", "target-error"],
    [429, "rate_limited", "target-error"],
  ] as const)("status %i with x-chaos-fault %s is %s", (status, fault, expected) => {
    expect(classify(status, fault)).toBe(expected);
  });
});

describe("describeRule", () => {
  const rule = (overrides: Partial<Rule>): Rule => ({
    id: "r1",
    targetId: "t1",
    method: "*",
    pathPattern: "/*",
    type: "drop",
    probability: "0.500",
    params: {},
    enabled: true,
    createdAt: "2026-11-12T00:00:00Z",
    ...overrides,
  });

  it("reads each fault type as a sentence", () => {
    expect(describeRule(rule({ type: "error", method: "POST", pathPattern: "/orders", probability: "0.200", params: { status: 503 } }))).toBe(
      "Return 503 on 20% of POST requests matching /orders",
    );
    expect(describeRule(rule({ type: "latency", method: "GET", probability: "0.250", params: { ms: 1200 } }))).toBe(
      "Wait 1200 ms on 25% of GET requests matching /*",
    );
    expect(describeRule(rule({ type: "corrupt", probability: "1.000" }))).toBe(
      "Corrupt the response body on 100% of requests matching /*",
    );
    expect(describeRule(rule({ type: "drop", probability: "0.050" }))).toBe(
      "Drop the connection on 5% of requests matching /*",
    );
  });

  it("keeps one decimal for fractional percentages", () => {
    expect(describeRule(rule({ probability: "0.125" }))).toContain("12.5%");
    expect(describeRule(rule({ probability: "0.001" }))).toContain("0.1%");
  });
});
