"use client";

import { useEffect, useRef, useState } from "react";
import { Bed, describeResult } from "./bed";
import { Glyph } from "./glyph";
import { proxyUrlFor } from "@/lib/config";
import { classify, OUTCOME_META, type Outcome, type RequestResult } from "@/lib/outcomes";
import { inputClass, monoClass, primaryButton } from "@/lib/ui";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const COUNTS = [10, 25, 50];
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const LEGEND: Outcome[] = ["ok", "slow", "error", "drop", "corrupt", "target-error"];

async function sendOne(url: string, method: string, id: number): Promise<RequestResult> {
  const started = performance.now();
  try {
    const res = await fetch(url, { method, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const fault = res.headers.get("x-chaos-fault");
    await res.arrayBuffer().catch(() => undefined); // include time to read the body
    return {
      id,
      outcome: classify(res.status, fault),
      status: res.status,
      ms: performance.now() - started,
      fault,
    };
  } catch {
    // No HTTP response at all: a dropped connection, or the proxy is not reachable.
    return { id, outcome: "drop", status: null, ms: performance.now() - started, fault: null };
  }
}

export function TryIt({ gardenId, targetName }: { gardenId: string; targetName: string }) {
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/");
  const [count, setCount] = useState(25);
  const [results, setResults] = useState<RequestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    return () => {
      // Deliberately read the latest value: bumping the run id stops in-flight requests from updating state after unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runId.current++;
    };
  }, []);

  async function run() {
    const myRun = ++runId.current;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const url = `${proxyUrlFor(gardenId, targetName)}${normalized}`;

    setRunning(true);
    setSelected(null);
    setResults(
      Array.from({ length: count }, (_, id) => ({
        id,
        outcome: "pending" as const,
        status: null,
        ms: null,
        fault: null,
      })),
    );

    let next = 0;
    const worker = async () => {
      while (next < count && runId.current === myRun) {
        const id = next++;
        const result = await sendOne(url, method, id);
        if (runId.current !== myRun) return;
        setResults((prev) => prev.map((r) => (r.id === id ? result : r)));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count) }, worker));
    if (runId.current === myRun) setRunning(false);
  }

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});
  const slowest = results.reduce((max, r) => Math.max(max, r.ms ?? 0), 0);
  const detail = selected !== null ? results[selected] : null;

  return (
    <section aria-labelledby="try-heading" className="mt-12">
      <h2 id="try-heading" className="text-2xl font-bold tracking-tight">
        Try it
      </h2>
      <p className="mt-1 max-w-prose text-ink-soft">
        Send requests through the proxy and watch what happens. Each stem is one request, and
        taller stems took longer.
      </p>

      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Method</span>
          <select
            className={`${inputClass} w-28`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium">Path on the target</span>
          <input
            className={`${inputClass} ${monoClass}`}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/users"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Requests</span>
          <select
            className={`${inputClass} w-24`}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {COUNTS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButton} disabled={running}>
          {running ? "Sending…" : `Send ${count} requests`}
        </button>
      </form>

      <div className="mt-6">
        {results.length === 0 ? (
          <div className="grid h-[154px] place-items-center border-b-4 border-ink/80 text-ink-soft">
            <p>Nothing sent yet. Send some requests to grow the bed.</p>
          </div>
        ) : (
          <Bed results={results} selected={selected} onSelect={setSelected} animate />
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {LEGEND.map((outcome) => (
              <li key={outcome} className="flex items-center gap-1.5">
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-white"
                  style={{ background: OUTCOME_META[outcome].color }}
                >
                  <Glyph outcome={outcome} size={11} />
                </span>
                {OUTCOME_META[outcome].label}
                <span className="font-semibold">{counts[outcome] ?? 0}</span>
              </li>
            ))}
          </ul>
          {!running && slowest > 0 && (
            <p className="text-sm text-ink-soft">
              Slowest response: {Math.round(slowest)} ms.
              {counts.drop ? " “No response” means the connection was dropped, or the proxy isn't reachable." : ""}
            </p>
          )}
          {detail && (
            <p className={`${monoClass} rounded-md bg-pane px-3 py-2`}>
              {describeResult(detail)}
              {detail.fault ? `, x-chaos-fault: ${detail.fault}` : ""}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
