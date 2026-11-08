"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import { GardenView } from "@/components/garden-view";
import { ApiError, api } from "@/lib/api";
import { saveGarden, useSavedGardens } from "@/lib/saved-gardens";
import { errorText, inputClass, monoClass, primaryButton } from "@/lib/ui";

const noopSubscribe = () => () => {};

export default function GardenPage() {
  const { gardenId } = useParams<{ gardenId: string }>();
  const saved = useSavedGardens().find((g) => g.id === gardenId);
  // localStorage only exists in the browser; wait for hydration before deciding the token is missing.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  if (!hydrated) return <p className="text-ink-soft">Loading garden…</p>;
  if (!saved) return <MissingToken gardenId={gardenId} />;

  return (
    <Suspense fallback={<p className="text-ink-soft">Loading garden…</p>}>
      <GardenView gardenId={gardenId} token={saved.token} />
    </Suspense>
  );
}

function MissingToken({ gardenId }: { gardenId: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const garden = await api.getGarden(gardenId, token.trim());
      saveGarden({ id: garden.id, name: garden.name, token: token.trim() });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "That token doesn't open this garden."
          : err instanceof ApiError
            ? err.message
            : "Couldn't check the token.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Open this garden</h1>
      <p className="text-ink-soft">
        This browser doesn&rsquo;t have the admin token for <code className={monoClass}>{gardenId}</code>.
        Paste it to open the garden.
      </p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Admin token</span>
        <input
          className={`${inputClass} ${monoClass}`}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
      </label>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <button type="submit" className={primaryButton} disabled={busy}>
        {busy ? "Checking…" : "Open garden"}
      </button>
    </form>
  );
}
