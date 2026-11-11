"use client";

import { useEffect, useState } from "react";
import { ApiError, api, type Rule, type Target } from "@/lib/api";
import { proxyUrlFor } from "@/lib/config";
import { describeRule, FAULT_OUTCOME, OUTCOME_META } from "@/lib/outcomes";
import { dangerButton, errorText, monoClass, quietButton } from "@/lib/ui";
import { CopyButton } from "./copy-button";
import { Glyph } from "./glyph";
import { RuleForm } from "./rule-form";
import { Activity } from "./activity";
import { TryIt } from "./try-it";

/** Everything about one target. Mounted with key={target.id}, so state resets per target. */
export function TargetPanel({
  gardenId,
  token,
  target,
  onDeleted,
}: {
  gardenId: string;
  token: string;
  target: Target;
  onDeleted: () => void;
}) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const proxyUrl = proxyUrlFor(gardenId, target.name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listRules(gardenId, token, target.id);
        if (!cancelled) setRules(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load rules.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gardenId, token, target.id]);

  async function toggle(rule: Rule) {
    setError(null);
    setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)) ?? prev);
    try {
      await api.setRuleEnabled(gardenId, token, target.id, rule.id, !rule.enabled);
    } catch (err) {
      setRules((prev) => prev?.map((r) => (r.id === rule.id ? rule : r)) ?? prev);
      setError(err instanceof ApiError ? err.message : "Couldn't update the rule.");
    }
  }

  async function remove(rule: Rule) {
    setError(null);
    try {
      await api.deleteRule(gardenId, token, target.id, rule.id);
      setRules((prev) => prev?.filter((r) => r.id !== rule.id) ?? prev);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the rule.");
    }
  }

  async function removeTarget() {
    if (!window.confirm(`Delete the target "${target.name}" and its rules?`)) return;
    try {
      await api.deleteTarget(gardenId, token, target.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the target.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{target.name}</h2>
          <p className={`${monoClass} mt-1 text-ink-soft`}>{target.baseUrl}</p>
        </div>
        <button type="button" className={dangerButton} onClick={removeTarget}>
          Delete target
        </button>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-pane p-4">
        <p className="text-sm font-medium">Proxy URL</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className={`${monoClass} break-all`}>{proxyUrl}</code>
          <CopyButton value={proxyUrl} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Send your requests here instead of to {target.baseUrl}. The path and query carry over.
        </p>
      </div>

      <section aria-labelledby="rules-heading" className="mt-10">
        <h2 id="rules-heading" className="text-2xl font-bold tracking-tight">
          Rules
        </h2>
        {error && (
          <p role="alert" className={`${errorText} mt-2`}>
            {error}
          </p>
        )}
        {rules === null && !error && <p className="mt-3 text-ink-soft">Loading rules…</p>}
        {rules?.length === 0 && (
          <p className="mt-3 max-w-prose text-ink-soft">
            No rules yet, so requests pass through unchanged. Add a rule to start breaking things.
          </p>
        )}
        {rules && rules.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {rules.map((rule) => {
              const outcome = FAULT_OUTCOME[rule.type];
              return (
                <li key={rule.id} className="flex items-center gap-4 py-3">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-white ${
                      rule.enabled ? "" : "opacity-40"
                    }`}
                    style={{ background: OUTCOME_META[outcome].color }}
                  >
                    <Glyph outcome={outcome} size={14} />
                  </span>
                  <p className={`flex-1 ${rule.enabled ? "" : "text-ink-soft line-through"}`}>
                    {describeRule(rule)}
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--sap-deep)]"
                      checked={rule.enabled}
                      onChange={() => void toggle(rule)}
                    />
                    On
                  </label>
                  <button type="button" className={quietButton} onClick={() => void remove(rule)}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <RuleForm
          gardenId={gardenId}
          token={token}
          targetId={target.id}
          onCreated={(rule) => setRules((prev) => [...(prev ?? []), rule])}
        />
      </section>

      <TryIt
        gardenId={gardenId}
        targetName={target.name}
        // Events reach the ingest service within about a second; refresh after that.
        onRunComplete={() => setTimeout(() => setActivityKey((k) => k + 1), 1500)}
      />
      <Activity gardenId={gardenId} token={token} targetId={target.id} refreshKey={activityKey} />
    </div>
  );
}
