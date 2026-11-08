import type { Outcome } from "@/lib/outcomes";

const PATHS: Record<Outcome, React.ReactNode> = {
  ok: <path d="M3.5 8.5l3 3 6-7" />,
  slow: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3.2l2 1.3" />
    </>
  ),
  error: <path d="M4 4l8 8M12 4l-8 8" />,
  drop: <path d="M1.5 8h4M10.5 8h4" />,
  corrupt: <path d="M1.5 9l2.5-3 2.5 4 2.5-5 2.5 4 2-2" />,
  "target-error": <path d="M8 3.5v5.5M8 12v.5" />,
  pending: <circle cx="8" cy="8" r="1.2" />,
};

/** Each outcome has its own shape, so the bed reads without relying on color alone. */
export function Glyph({ outcome, size = 16 }: { outcome: Outcome; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[outcome]}
    </svg>
  );
}
