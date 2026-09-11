import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";

export interface ChecklistItemOverride {
  /** Force this item complete (or not) regardless of user toggle. */
  forced?: boolean;
  /** Prevent user from toggling this item (used when tracked externally). */
  locked?: boolean;
  /** Extra line shown below the item, e.g. "2 of 9 photos still needed". */
  subtitle?: string;
}

export function Checklist({
  storageKey,
  title,
  items,
  overrides,
  onProgress,
}: {
  storageKey: string;
  title: string;
  items: string[];
  overrides?: (ChecklistItemOverride | undefined)[];
  /** Reports (number ticked, all ticked) whenever progress changes. */
  onProgress?: (doneCount: number, allDone: boolean) => void;
}) {
  const [done, setDone] = useState<boolean[]>(() => items.map(() => false));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { date: string; done: boolean[] };
        const today = new Date().toISOString().slice(0, 10);
        if (parsed.date === today && parsed.done.length === items.length) {
          setDone(parsed.done);
        }
      }
    } catch {}
  }, [storageKey, items.length]);

  const toggle = (i: number) => {
    if (overrides?.[i]?.locked) return;
    setDone((prev) => {
      const next = prev.map((v, idx) => (idx === i ? !v : v));
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ date: new Date().toISOString().slice(0, 10), done: next }),
        );
      } catch {}
      return next;
    });
  };

  const effective = items.map((_, i) => {
    const o = overrides?.[i];
    if (o?.forced !== undefined) return o.forced;
    return done[i];
  });
  const completeCount = effective.filter(Boolean).length;
  const allDone = completeCount === items.length;

  useEffect(() => {
    onProgress?.(completeCount, allDone);
  }, [completeCount, allDone, onProgress]);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <span className={`text-xs font-medium ${allDone ? "text-primary" : "text-muted-foreground"}`}>
          {completeCount}/{items.length}
        </span>
      </header>
      <ol className="divide-y divide-border">
        {items.map((item, i) => {
          const o = overrides?.[i];
          const isDone = effective[i];
          const locked = !!o?.locked;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                disabled={locked}
                className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted disabled:active:bg-transparent"
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                    isDone ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : locked ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}
                </span>
                <span className="flex-1">
                  <span className={`block text-sm leading-snug ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    <span className="font-semibold mr-1">{i + 1}.</span>
                    {item}
                  </span>
                  {o?.subtitle && (
                    <span className={`mt-0.5 block text-xs ${isDone ? "text-primary" : "text-amber-600"}`}>
                      {o.subtitle}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
