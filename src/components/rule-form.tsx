"use client";

import { useState } from "react";
import { ApiError, api, type FaultType, type Rule } from "@/lib/api";
import { FAULT_LABEL, FAULT_OUTCOME, OUTCOME_META } from "@/lib/outcomes";
import { errorText, inputClass, monoClass, primaryButton } from "@/lib/ui";
import { Glyph } from "./glyph";

const FAULTS: FaultType[] = ["error", "latency", "drop", "corrupt"];
const METHODS = ["*", "GET", "POST", "PUT", "PATCH", "DELETE"];

export function RuleForm({
  gardenId,
  token,
  targetId,
  onCreated,
}: {
  gardenId: string;
  token: string;
  targetId: string;
  onCreated: (rule: Rule) => void;
}) {
  const [type, setType] = useState<FaultType>("error");
  const [method, setMethod] = useState("*");
  const [pathPattern, setPathPattern] = useState("/*");
  const [percent, setPercent] = useState(50);
  const [ms, setMs] = useState(1500);
  const [status, setStatus] = useState(503);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rule = await api.createRule(gardenId, token, targetId, {
        type,
        method,
        pathPattern,
        probability: Math.min(100, Math.max(0, percent)) / 100,
        params: type === "latency" ? { ms } : type === "error" ? { status } : {},
      });
      onCreated(rule);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the rule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-lg border border-line bg-pane p-5">
      <h3 className="text-lg font-bold">Add a rule</h3>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">What should happen</legend>
        <div className="flex flex-wrap gap-2">
          {FAULTS.map((fault) => {
            const outcome = FAULT_OUTCOME[fault];
            const active = type === fault;
            return (
              <label
                key={fault}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sap-deep ${
                  active ? "border-ink bg-glass" : "border-line hover:bg-glass"
                }`}
              >
                <input
                  type="radio"
                  name="fault"
                  className="sr-only"
                  checked={active}
                  onChange={() => setType(fault)}
                />
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-white"
                  style={{ background: OUTCOME_META[outcome].color }}
                >
                  <Glyph outcome={outcome} size={11} />
                </span>
                {FAULT_LABEL[fault]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {type === "latency" && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Delay (ms, up to 30000)</span>
            <input
              type="number"
              min={0}
              max={30000}
              className={inputClass}
              value={ms}
              onChange={(e) => setMs(Number(e.target.value))}
            />
          </label>
        )}
        {type === "error" && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Status code (400 to 599)</span>
            <input
              type="number"
              min={400}
              max={599}
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(Number(e.target.value))}
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium">How often: {percent}% of matching requests</span>
          <input
            type="range"
            min={0}
            max={100}
            className="w-full accent-[var(--sap-deep)]"
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Method</span>
          <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m === "*" ? "Any method" : m}
              </option>
            ))}
          </select>
        </label>
        <div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Path pattern</span>
            <input
              className={`${inputClass} ${monoClass}`}
              value={pathPattern}
              onChange={(e) => setPathPattern(e.target.value)}
              aria-describedby="pattern-help"
            />
          </label>
          <p id="pattern-help" className="mt-1 text-sm text-ink-soft">
            <code className={monoClass}>*</code> matches anything, <code className={monoClass}>:id</code>{" "}
            matches one path segment.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? "Adding…" : "Add rule"}
      </button>
    </form>
  );
}
