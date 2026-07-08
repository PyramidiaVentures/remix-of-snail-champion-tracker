import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export function Checklist({ storageKey, title, items }: { storageKey: string; title: string; items: string[] }) {
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

  const allDone = done.every(Boolean);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <span className={`text-xs font-medium ${allDone ? "text-primary" : "text-muted-foreground"}`}>
          {done.filter(Boolean).length}/{items.length}
        </span>
      </header>
      <ol className="divide-y divide-border">
        {items.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => toggle(i)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                  done[i] ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                }`}
              >
                {done[i] && <Check className="h-4 w-4" />}
              </span>
              <span className={`text-sm leading-snug ${done[i] ? "text-muted-foreground line-through" : "text-foreground"}`}>
                <span className="font-semibold mr-1">{i + 1}.</span>
                {item}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
