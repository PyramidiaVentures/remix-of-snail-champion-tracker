import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, CircleDashed, Loader2, Circle, Sprout, AlertTriangle, Clock } from "lucide-react";

export type PenCompletion = "complete" | "partial" | "empty" | "uploading";

export type PenRole = "trial" | "breeder";

export interface StepperPen {
  id: string;
  label: string;
  /** Breeder pens are monitored but sit outside the trial. Defaults to "trial". */
  role?: PenRole;
  /** Weighing schedule marker, used on Weigh Day only. */
  dueState?: "due" | "overdue";
}

interface Props {
  pens: StepperPen[];
  /** Completion state for a pen's chip. */
  stateFor: (penId: string) => PenCompletion;
  /** Human-readable list of what is still missing for a pen (field or photo names). */
  missingFor: (penId: string) => string[];
  /** Card for the currently shown pen. Only the current pen is ever mounted. */
  renderPen: (pen: StepperPen) => ReactNode;
  /** Query-string parameter used to remember the current pen. */
  paramName?: string;
  /** Extra content rendered at the bottom of the summary tab (e.g. a completion button). */
  summaryFooter?: ReactNode;
  /** When true, the Summary pill turns green like a completed pen. */
  summaryComplete?: boolean;
}

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

const CHIP_STYLES: Record<PenCompletion, string> = {
  complete: "border-primary bg-primary text-primary-foreground",
  partial: "border-amber-500 bg-amber-500/10 text-amber-700",
  uploading: "border-border bg-muted text-muted-foreground",
  empty: "border-border bg-card text-muted-foreground",
};

function ChipIcon({ state }: { state: PenCompletion }) {
  if (state === "complete") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (state === "partial") return <CircleDashed className="h-3.5 w-3.5" />;
  if (state === "uploading") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export function PenStepper({ pens, stateFor, missingFor, renderPen, paramName = "pen", summaryFooter, summaryComplete }: Props) {
  // Stable order: trial pens first, then breeder pens, each by label —
  // matching the walk down the beds.
  const ordered = useMemo(
    () =>
      [...pens].sort(
        (a, b) =>
          (a.role === "breeder" ? 1 : 0) - (b.role === "breeder" ? 1 : 0) ||
          a.label.localeCompare(b.label, undefined, { numeric: true }),
      ),
    [pens],
  );
  const n = ordered.length;

  const indexOfId = useCallback(
    (id: string | null) => {
      if (!id) return 0;
      if (id === "summary") return n;
      const i = ordered.findIndex((p) => p.id === id);
      return i >= 0 ? i : 0;
    },
    [ordered, n],
  );

  const [index, setIndex] = useState(0);

  // Restore from the URL once pens are known, and follow back/forward.
  useEffect(() => {
    setIndex(indexOfId(readParam(paramName)));
    const onPop = () => setIndex(indexOfId(readParam(paramName)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [indexOfId, paramName]);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(n, next));
      setIndex(clamped);
      const params = new URLSearchParams(window.location.search);
      params.set(paramName, clamped === n ? "summary" : ordered[clamped].id);
      window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
    },
    [n, ordered, paramName],
  );

  // Horizontal swipe on touch devices. Navigation never saves or discards anything.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(index + (dx < 0 ? 1 : -1));
  };

  if (n === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No pens assigned to this trial yet.
      </div>
    );
  }

  // Trial pens and breeder pens are always counted apart, so a completion
  // figure never mixes the two kinds of pen.
  const trialPens = ordered.filter((p) => p.role !== "breeder");
  const breederPens = ordered.filter((p) => p.role === "breeder");
  const doneIn = (list: StepperPen[]) => list.filter((p) => stateFor(p.id) === "complete").length;
  const trialDone = doneIn(trialPens);
  const breederDone = doneIn(breederPens);
  const doneCount = trialDone + breederDone;
  const remaining = n - doneCount;
  const current = index < n ? ordered[index] : null;

  return (
    <div className="space-y-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">
          {current
            ? `Pen ${current.label}${current.role === "breeder" ? " (breeder)" : ""} · ${index + 1} of ${n}`
            : "Session summary"}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {trialDone} of {trialPens.length} trial pens complete
          {breederPens.length > 0 && (
            <>
              <br />
              {breederDone} of {breederPens.length} breeder pens complete
            </>
          )}
        </span>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ordered.map((p, i) => {
          const state = stateFor(p.id);
          const breeder = p.role === "breeder";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => go(i)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${CHIP_STYLES[state]} ${
                breeder ? "border-dashed" : ""
              } ${i === index ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : ""}`}
            >
              <ChipIcon state={state} />
              {p.label}
              {breeder && <Sprout className="h-3 w-3" aria-label="Breeder pen" />}
              {p.dueState === "overdue" && (
                <AlertTriangle className="h-3 w-3 text-destructive" aria-label="Overdue for weighing" />
              )}
              {p.dueState === "due" && <Clock className="h-3 w-3" aria-label="Due for weighing today" />}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => go(n)}
          className={`shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground ${
            index === n ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : ""
          }`}
        >
          Summary
        </button>
      </div>

      {current ? renderPen(current) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h2 className="font-semibold">Session summary</h2>
          <p className="text-sm text-muted-foreground">
            {trialDone} of {trialPens.length} trial pens complete.
            {breederPens.length > 0 && ` ${breederDone} of ${breederPens.length} breeder pens complete.`}
          </p>
          {remaining === 0 ? (
            <p className="text-sm text-primary">Every pen is done for this session.</p>
          ) : (
            <ul className="divide-y divide-border">
              {ordered
                .filter((p) => stateFor(p.id) !== "complete")
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => go(indexOfId(p.id))}
                      className="flex w-full items-start justify-between gap-3 py-2 text-left"
                    >
                      <span className="text-sm font-medium">
                        {p.label}
                        {p.role === "breeder" && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">breeder</span>
                        )}
                      </span>
                      <span className="text-xs text-amber-600">
                        missing: {missingFor(p.id).join(", ") || "—"}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          {summaryFooter}
        </section>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-4 text-sm font-semibold disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" /> Previous
        </button>
        {index < n && (
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-4 text-sm font-semibold text-primary-foreground"
          >
            Next <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Marks a pen card as a breeder pen, outside the trial. */
export function BreederBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <Sprout className="h-3 w-3" /> Breeder pen
    </span>
  );
}
