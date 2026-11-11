"use client";

import { useState } from "react";
import { ApiError, api, type Garden } from "@/lib/api";
import { errorText, inputClass, primaryButton, quietButton } from "@/lib/ui";

/** Server-side caps (control API: MAX_RATE_LIMIT_RPS / MAX_RATE_LIMIT_BURST). */
const MAX_RPS = 50;
const MAX_BURST = 100;

/** Shows the garden's proxy rate limit and lets the owner change it. */
export function RateLimit({
  garden,
  token,
  onSaved,
}: {
  garden: Garden;
  token: string;
  onSaved: (garden: Garden) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rps, setRps] = useState(garden.rateLimitRps);
  const [burst, setBurst] = useState(garden.rateLimitBurst);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateGarden(garden.id, token, { rateLimitRps: rps, rateLimitBurst: burst });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the rate limit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="rate-limit-heading" className="mt-5 max-w-2xl rounded-lg border border-line bg-pane p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="rate-limit-heading" className="font-medium">
          Rate limit
        </h2>
        {!editing && (
          <button
            type="button"
            className={quietButton}
            onClick={() => {
              setRps(garden.rateLimitRps);
              setBurst(garden.rateLimitBurst);
              setEditing(true);
            }}
          >
            Change limit
          </button>
        )}
      </div>

      {!editing ? (
        <p className="mt-1 text-sm text-ink-soft">
          The proxy accepts <strong className="font-semibold text-ink">{garden.rateLimitRps} requests per second</strong>{" "}
          for this garden, with bursts of up to <strong className="font-semibold text-ink">{garden.rateLimitBurst}</strong>.
          Requests over the limit get a 429 with a Retry-After header, which is a fault worth testing too.
        </p>
      ) : (
        <form onSubmit={save} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Requests per second (1 to {MAX_RPS})</span>
              <input
                type="number"
                min={1}
                max={MAX_RPS}
                required
                className={inputClass}
                value={rps}
                onChange={(e) => setRps(Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Burst size (1 to {MAX_BURST})</span>
              <input
                type="number"
                min={1}
                max={MAX_BURST}
                required
                className={inputClass}
                value={burst}
                onChange={(e) => setBurst(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="text-sm text-ink-soft">
            Burst is how many requests can arrive at once before the per-second rate applies. Changes reach the proxy
            within a few seconds.
          </p>
          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className={primaryButton} disabled={busy}>
              {busy ? "Saving…" : "Save limit"}
            </button>
            <button type="button" className={quietButton} onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
