import { Glyph } from "./glyph";
import { OUTCOME_META, type RequestResult } from "@/lib/outcomes";

const MIN_STEM = 14;
const MAX_STEM = 118;
const SLOWEST_MS = 5000;

/** Stem height grows with response time on a log scale, so 40 ms and 4 s are both readable. */
function stemHeight(result: RequestResult): number {
  if (result.ms === null) return result.outcome === "pending" ? MIN_STEM : 22;
  const ratio = Math.min(1, Math.log1p(result.ms) / Math.log1p(SLOWEST_MS));
  return Math.round(MIN_STEM + ratio * (MAX_STEM - MIN_STEM));
}

export function describeResult(result: RequestResult): string {
  const meta = OUTCOME_META[result.outcome].label;
  const parts = [`Request ${result.id + 1}: ${meta.toLowerCase()}`];
  if (result.status !== null) parts.push(`status ${result.status}`);
  if (result.ms !== null) parts.push(`${Math.round(result.ms)} ms`);
  return parts.join(", ");
}

/**
 * One stem per request: color and top shape show what happened, height shows
 * how long it took. The bed is the product in one picture.
 */
export function Bed({
  results,
  selected,
  onSelect,
  animate = false,
  singleRow = false,
}: {
  results: RequestResult[];
  selected?: number | null;
  onSelect?: (index: number) => void;
  animate?: boolean;
  /** Keep every stem on one row, clipping any that do not fit (used for the decorative hero). */
  singleRow?: boolean;
}) {
  return (
    <div
      className={
        singleRow
          ? "grid grid-flow-col auto-cols-[30px] overflow-hidden"
          : "grid grid-cols-[repeat(auto-fill,30px)] gap-y-5"
      }
      role="list"
      aria-label="Request results"
    >
      {results.map((result, index) => {
        const color = OUTCOME_META[result.outcome].color;
        const height = stemHeight(result);
        const isSelected = selected === index;
        const style = { "--i": index } as React.CSSProperties;
        const motion = `${animate ? "stem-grow" : ""} ${result.outcome === "pending" ? "stem-pending" : ""}`;
        const body = (
          <span className={`flex flex-col items-center ${motion}`} style={style}>
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-white"
              style={{ background: color }}
            >
              <Glyph outcome={result.outcome} size={14} />
            </span>
            <span className="w-1.5 rounded-t-sm" style={{ background: color, height }} />
          </span>
        );
        const className = `flex h-[154px] w-[30px] flex-col items-center justify-end border-b-4 border-ink/80 ${
          isSelected ? "bg-ink/10" : ""
        }`;
        return onSelect ? (
          <div key={result.id} role="listitem" className="w-[30px]">
            <button
              type="button"
              className={className}
              title={describeResult(result)}
              aria-label={describeResult(result)}
              aria-pressed={isSelected}
              onClick={() => onSelect(index)}
            >
              {body}
            </button>
          </div>
        ) : (
          <div key={result.id} role="listitem" className={className} aria-hidden="true">
            {body}
          </div>
        );
      })}
    </div>
  );
}
