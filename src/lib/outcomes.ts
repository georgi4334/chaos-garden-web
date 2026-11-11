import type { FaultType, Rule } from "./api";

export type Outcome = "ok" | "slow" | "error" | "drop" | "corrupt" | "target-error" | "pending";

export interface RequestResult {
  id: number;
  outcome: Outcome;
  status: number | null;
  ms: number | null;
  /** Value of the x-chaos-fault response header, if present. */
  fault: string | null;
}

export const OUTCOME_META: Record<Outcome, { label: string; color: string }> = {
  ok: { label: "Passed through", color: "var(--sap)" },
  slow: { label: "Delayed", color: "var(--latency)" },
  error: { label: "Injected error", color: "var(--error)" },
  drop: { label: "No response", color: "var(--drop)" },
  corrupt: { label: "Broken body", color: "var(--corrupt)" },
  "target-error": { label: "Error from the target", color: "var(--other)" },
  pending: { label: "Waiting", color: "var(--line)" },
};

export const FAULT_OUTCOME: Record<FaultType, Outcome> = {
  latency: "slow",
  error: "error",
  drop: "drop",
  corrupt: "corrupt",
};

export const FAULT_LABEL: Record<FaultType, string> = {
  latency: "Delay",
  error: "Error",
  drop: "Drop",
  corrupt: "Corrupt",
};

/** Turns the proxy's x-chaos-fault header and the HTTP status into one outcome. */
export function classify(status: number, fault: string | null): Outcome {
  const applied = fault?.split(",") ?? [];
  if (applied.includes("error")) return "error";
  if (applied.includes("corrupt")) return "corrupt";
  if (status >= 400) return "target-error";
  if (applied.includes("latency")) return "slow";
  return "ok";
}

export function describeRule(rule: Rule): string {
  const chance = `${Math.round(Number(rule.probability) * 1000) / 10}%`;
  const what =
    rule.type === "latency"
      ? `Wait ${String(rule.params.ms)} ms`
      : rule.type === "error"
        ? `Return ${String(rule.params.status)}`
        : rule.type === "drop"
          ? "Drop the connection"
          : "Corrupt the response body";
  const requests = rule.method === "*" ? "requests" : `${rule.method} requests`;
  return `${what} on ${chance} of ${requests} matching ${rule.pathPattern}`;
}
