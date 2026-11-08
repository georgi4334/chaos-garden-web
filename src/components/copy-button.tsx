"use client";

import { useEffect, useRef, useState } from "react";
import { quietButton } from "@/lib/ui";

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the value is still visible to select by hand
    }
  }

  return (
    <button type="button" onClick={copy} className={quietButton}>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
