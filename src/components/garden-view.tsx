"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api, type Garden, type Target } from "@/lib/api";
import { forgetGarden } from "@/lib/saved-gardens";
import { dangerButton, errorText, inputClass, monoClass, primaryButton, quietButton } from "@/lib/ui";
import { CopyButton } from "./copy-button";
import { RateLimit } from "./rate-limit";
import { TargetPanel } from "./target-panel";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string; unauthorized: boolean }
  | { phase: "ready"; garden: Garden; targets: Target[] };

export function GardenView({ gardenId, token }: { gardenId: string; token: string }) {
  const router = useRouter();
  const isNew = useSearchParams().get("new") === "1";
  const [state, setState] = useState<State>({ phase: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [garden, targets] = await Promise.all([
          api.getGarden(gardenId, token),
          api.listTargets(gardenId, token),
        ]);
        if (!cancelled) setState({ phase: "ready", garden, targets });
      } catch (err) {
        if (cancelled) return;
        const unauthorized = err instanceof ApiError && err.status === 401;
        setState({
          phase: "error",
          unauthorized,
          message: unauthorized
            ? "The admin token saved in this browser doesn't match this garden."
            : err instanceof ApiError
              ? err.message
              : "Couldn't load this garden.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gardenId, token]);

  if (state.phase === "loading") return <p className="text-ink-soft">Loading garden…</p>;

  if (state.phase === "error") {
    return (
      <div className="max-w-prose">
        <p role="alert" className={errorText}>
          {state.message}
        </p>
        {state.unauthorized && (
          <button
            type="button"
            className={`${quietButton} mt-4`}
            onClick={() => {
              forgetGarden(gardenId);
              router.push("/");
            }}
          >
            Remove it from this browser
          </button>
        )}
      </div>
    );
  }

  const { garden, targets } = state;
  const selected = targets.find((t) => t.id === selectedId) ?? targets[0];

  async function deleteGarden() {
    if (!window.confirm(`Delete "${garden.name}" with all its targets and rules? This can't be undone.`)) return;
    try {
      await api.deleteGarden(gardenId, token);
      forgetGarden(gardenId);
      router.push("/");
    } catch (err) {
      window.alert(err instanceof ApiError ? err.message : "Couldn't delete the garden.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{garden.name}</h1>
          <p className={`${monoClass} mt-1 text-ink-soft`}>{garden.id}</p>
        </div>
        <button type="button" className={dangerButton} onClick={deleteGarden}>
          Delete garden
        </button>
      </div>

      <details
        className="mt-5 max-w-2xl rounded-lg border border-line bg-pane p-4"
        open={isNew}
      >
        <summary className="cursor-pointer font-medium">
          {isNew ? "Save your admin token" : "Admin token"}
        </summary>
        <p className="mt-2 text-sm text-ink-soft">
          There are no accounts. This token is the only key to the garden. It&rsquo;s saved in this browser,
          so clearing site data loses access. Copy it somewhere safe to open the garden elsewhere.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className={`${monoClass} break-all`}>{token}</code>
          <CopyButton value={token} label="Copy token" />
        </div>
      </details>

      <RateLimit
        garden={garden}
        token={token}
        onSaved={(updated) => setState({ phase: "ready", garden: updated, targets })}
      />

      <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_1fr]">
        <aside aria-label="Targets">
          <h2 className="text-lg font-bold">Targets</h2>
          {targets.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              Add the API you want to break, for example https://api.example.com.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {targets.map((target) => (
                <li key={target.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(target.id)}
                    aria-current={target.id === selected?.id}
                    className={`block w-full rounded-md px-3 py-2 text-left ${
                      target.id === selected?.id
                        ? "bg-ink font-semibold text-glass"
                        : "hover:bg-pane"
                    }`}
                  >
                    {target.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <TargetForm
            gardenId={gardenId}
            token={token}
            onCreated={(target) => {
              setState({ phase: "ready", garden, targets: [...targets, target] });
              setSelectedId(target.id);
            }}
          />
        </aside>

        <div className="min-w-0">
          {selected ? (
            <TargetPanel
              key={selected.id}
              gardenId={gardenId}
              token={token}
              target={selected}
              onDeleted={() => {
                setState({ phase: "ready", garden, targets: targets.filter((t) => t.id !== selected.id) });
                setSelectedId(null);
              }}
            />
          ) : (
            <p className="max-w-prose text-ink-soft">
              A target is a real API behind the proxy. Add one to get a proxy URL and start adding rules.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TargetForm({
  gardenId,
  token,
  onCreated,
}: {
  gardenId: string;
  token: string;
  onCreated: (target: Target) => void;
}) {
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const target = await api.createTarget(gardenId, token, { name: name.trim(), baseUrl: baseUrl.trim() });
      onCreated(target);
      setName("");
      setBaseUrl("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the target.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 border-t border-line pt-5">
      <h3 className="font-bold">Add a target</h3>
      <div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="api"
            required
            aria-describedby="target-name-help"
          />
        </label>
        <p id="target-name-help" className="mt-1 text-sm text-ink-soft">
          Appears in the proxy URL.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Base URL</span>
        <input
          className={`${inputClass} ${monoClass}`}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com"
          required
        />
      </label>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? "Adding…" : "Add target"}
      </button>
    </form>
  );
}
