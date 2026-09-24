import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, CloudOff } from "lucide-react";
import {
  fetchChecklist,
  readLocal,
  saveChecklist,
  visibleTicks,
  writeLocal,
  type SopSession,
  type SopStep,
} from "@/lib/sopChecklist";

export interface ChecklistItemOverride {
  /** Force this item complete (or not) regardless of user toggle. */
  forced?: boolean;
  /** Prevent user from toggling this item (used when tracked externally). */
  locked?: boolean;
  /** Extra line shown below the item, e.g. "2 of 9 photos still needed". */
  subtitle?: string;
}

export function Checklist({
  trialId,
  date,
  session,
  title,
  id,
  items,
  overrides,
  onProgress,
}: {
  /** Ticks are saved against the trial, so the whole team sees the same list. */
  trialId: string | null | undefined;
  date: string;
  session: SopSession;
  title: string;
  id?: string;
  items: SopStep[];
  overrides?: (ChecklistItemOverride | undefined)[];
  /** Reports visible progress and the full saved key set whenever it changes. */
  onProgress?: (doneCount: number, allDone: boolean, checkedKeys: string[]) => void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string[] | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const saved = useQuery({
    queryKey: ["sop-checklist", trialId, date, session],
    enabled: !!trialId,
    queryFn: () => fetchChecklist(trialId!, date, session),
  });

  // Whichever we have: the optimistic value being saved, the shared value from
  // the database, or the local mirror while the connection is down.
  const checkedKeys = pending ?? saved.data ?? readLocal(trialId ?? "", date, session) ?? [];
  const done = visibleTicks(checkedKeys, items);

  // Reset the optimistic value when the date or session changes.
  useEffect(() => {
    setPending(null);
    setSaveFailed(false);
  }, [trialId, date, session]);

  const save = useMutation({
    mutationFn: (next: string[]) => saveChecklist(trialId!, date, session, next),
    onSuccess: async () => {
      setSaveFailed(false);
      await qc.invalidateQueries({ queryKey: ["sop-checklist", trialId, date, session] });
      setPending(null);
    },
    onError: () => setSaveFailed(true),
  });

  const toggle = (i: number) => {
    if (overrides?.[i]?.locked || !trialId) return;
    const key = items[i]?.key;
    if (!key) return;
    const next = done[i]
      ? checkedKeys.filter((savedKey) => savedKey !== key)
      : [...new Set([...checkedKeys, key])];
    setPending(next);
    writeLocal(trialId, date, session, next);
    save.mutate(next);
  };

  const effective = items.map((_, i) => {
    const o = overrides?.[i];
    if (o?.forced !== undefined) return o.forced;
    return done[i];
  });
  const completeCount = effective.filter(Boolean).length;
  const allDone = completeCount === items.length;

  useEffect(() => {
    onProgress?.(completeCount, allDone, checkedKeys);
  }, [completeCount, allDone, checkedKeys, onProgress]);

  return (
    <section id={id} className="scroll-mt-4 rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <span className="flex items-center gap-2">
          {saveFailed && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <CloudOff className="h-3 w-3" />Not saved yet
            </span>
          )}
          <span className={`text-xs font-medium ${allDone ? "text-primary" : "text-muted-foreground"}`}>
            {completeCount}/{items.length}
          </span>
        </span>
      </header>
      <ol className="divide-y divide-border">
        {items.map((item, i) => {
          const o = overrides?.[i];
          const isDone = effective[i];
          const locked = !!o?.locked;
          return (
            <li key={item.key}>
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
                    {item.label}
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
