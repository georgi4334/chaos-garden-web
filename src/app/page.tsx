"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bed } from "@/components/bed";
import { ApiError, api } from "@/lib/api";
import type { Outcome, RequestResult } from "@/lib/outcomes";
import { forgetGarden, saveGarden, useSavedGardens } from "@/lib/saved-gardens";
import { errorText, inputClass, monoClass, primaryButton, quietButton } from "@/lib/ui";

/** Illustrative only: what a bed looks like after a few dozen requests through a rule set. */
const SAMPLE: Array<[Outcome, number | null, number | null]> = [
  ["ok", 200, 38], ["ok", 200, 44], ["slow", 200, 1800], ["ok", 200, 41], ["error", 503, 12],
  ["ok", 200, 36], ["ok", 200, 52], ["corrupt", 200, 47], ["ok", 200, 40], ["drop", null, 300],
  ["slow", 200, 3200], ["ok", 200, 43], ["error", 503, 9], ["ok", 200, 39], ["target-error", 404, 61],
  ["ok", 200, 37], ["slow", 200, 920], ["ok", 200, 45], ["ok", 200, 42], ["error", 500, 11],
];
const SAMPLE_RESULTS: RequestResult[] = SAMPLE.map(([outcome, status, ms], id) => ({
  id,
  outcome,
  status,
  ms,
  fault: null,
}));

export default function Home() {
  return (
    <div className="pt-6 lg:pt-12">
      <div className="grid gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <section>
          <h1 className="max-w-[14ch] text-[clamp(2.75rem,7vw,5rem)] font-extrabold leading-[0.95] tracking-tight">
            Break your API on purpose.
          </h1>
          <p className="mt-6 max-w-[48ch] text-lg text-ink-soft">
            Chaos Garden sits in front of your API and makes some requests slow, fail, vanish or
            arrive broken. Point your frontend at it and see what happens.
          </p>
          <div className="mt-10" aria-hidden="true">
            <Bed results={SAMPLE_RESULTS} animate singleRow />
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            An example run. Each stem is one request, and taller stems took longer.
          </p>
        </section>

        <div className="space-y-12">
          <CreateGarden />
          <SavedGardens />
          <OpenExisting />
        </div>
      </div>
    </div>
  );
}

function CreateGarden() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const garden = await api.createGarden(name.trim());
      saveGarden({ id: garden.id, name: garden.name, token: garden.adminToken });
      router.push(`/gardens/${garden.id}?new=1`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the garden.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-pane p-6">
      <h2 className="text-2xl font-bold tracking-tight">Create a garden</h2>
      <p className="mt-1 text-ink-soft">
        No account needed. You get an admin token that stays in this browser.
      </p>
      <label className="mt-5 block">
        <span className="mb-1 block text-sm font-medium">Garden name</span>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Checkout flow"
          maxLength={100}
          required
        />
      </label>
      {error && (
        <p role="alert" className={`${errorText} mt-3`}>
          {error}
        </p>
      )}
      <button type="submit" className={`${primaryButton} mt-5`} disabled={busy}>
        {busy ? "Creating…" : "Create garden"}
      </button>
    </form>
  );
}

function SavedGardens() {
  const gardens = useSavedGardens();
  return (
    <section aria-labelledby="saved-heading">
      <h2 id="saved-heading" className="text-xl font-bold">
        Your gardens
      </h2>
      {gardens.length === 0 ? (
        <p className="mt-2 text-ink-soft">Gardens you create in this browser will show up here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {gardens.map((garden) => (
            <li key={garden.id} className="flex items-center justify-between gap-3 py-3">
              <Link href={`/gardens/${garden.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-semibold">{garden.name}</span>
                <span className={`${monoClass} block truncate text-ink-soft`}>{garden.id}</span>
              </Link>
              <button
                type="button"
                className={quietButton}
                onClick={() => {
                  if (window.confirm(`Remove "${garden.name}" from this browser? The garden itself stays on the server.`))
                    forgetGarden(garden.id);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpenExisting() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const garden = await api.getGarden(id.trim(), token.trim());
      saveGarden({ id: garden.id, name: garden.name, token: token.trim() });
      router.push(`/gardens/${garden.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 404)
          ? "That garden ID and token don't match."
          : err instanceof ApiError
            ? err.message
            : "Couldn't open the garden.",
      );
      setBusy(false);
    }
  }

  return (
    <details>
      <summary className="cursor-pointer font-medium">Open a garden from another browser</summary>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Garden ID</span>
          <input className={`${inputClass} ${monoClass}`} value={id} onChange={(e) => setId(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Admin token</span>
          <input className={`${inputClass} ${monoClass}`} value={token} onChange={(e) => setToken(e.target.value)} required />
        </label>
        {error && (
          <p role="alert" className={errorText}>
            {error}
          </p>
        )}
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? "Opening…" : "Open garden"}
        </button>
      </form>
    </details>
  );
}
