import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { writeWithRetry } from "@/lib/upsertRow";
import { uploadPopulationPhoto } from "@/lib/photoUpload";
import { today } from "@/lib/date";
import { liveCount, cumulativeMortality } from "@/lib/liveCount";
import type { Database } from "@/integrations/supabase/types";
import { Plus, Trash2, Pencil, X, Check, Upload, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/population")({
  component: PopulationPage,
  head: () => ({
    meta: [
      { title: "Population — SNOVA Growth Tracker" },
      { name: "description", content: "Log deaths, escapes, removals and additions per pen, and reconcile the derived live count against the last weighing." },
      { property: "og:title", content: "Population — SNOVA Growth Tracker" },
      { property: "og:description", content: "Track every pen's population events and survival to date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type EventType = Database["public"]["Enums"]["population_event_type"];
type Cause = Database["public"]["Enums"]["population_cause"];
type PopRow = Database["public"]["Tables"]["population_events"]["Row"];

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "mortality", label: "Mortality" },
  { value: "escape", label: "Escape" },
  { value: "removal", label: "Removal" },
  { value: "addition", label: "Addition" },
];

const CAUSES: { value: Cause; label: string }[] = [
  { value: "disease", label: "Disease" },
  { value: "predation", label: "Predation" },
  { value: "handling", label: "Handling" },
  { value: "unknown", label: "Unknown" },
  { value: "harvested", label: "Harvested" },
  { value: "other", label: "Other" },
];

const labelOf = <T extends { value: string; label: string }>(opts: T[], v: string | null) =>
  opts.find((o) => o.value === v)?.label ?? "—";

function PopulationPage() {
  const qc = useQueryClient();
  const t = today();
  const [penFilter, setPenFilter] = useState<string>("all");

  const trial = useQuery({
    queryKey: ["active-trial"],
    queryFn: async () => (await supabase.from("trials").select("*").eq("status", "active").maybeSingle()).data,
  });
  const trialId = trial.data?.id;

  const pens = useQuery({
    queryKey: ["pens"],
    queryFn: async () =>
      (await supabase.from("pens").select("id,label,initial_snail_count")).data?.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) ?? [],
  });

  const assignments = useQuery({
    queryKey: ["pen-assignments", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id").eq("trial_id", trialId!).is("end_date", null)).data ?? [],
  });

  const events = useQuery({
    queryKey: ["population-events", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("population_events").select("*").eq("trial_id", trialId!).order("event_date", { ascending: false })).data ?? [],
  });

  const biomass = useQuery({
    queryKey: ["biomass-events", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("biomass_events").select("pen_id,event_date,live_count").eq("trial_id", trialId!).order("event_date")).data ?? [],
  });

  const assignedIds = useMemo(() => new Set((assignments.data ?? []).map((a) => a.pen_id)), [assignments.data]);
  const trialPens = useMemo(
    () => (pens.data ?? []).filter((p) => assignedIds.has(p.id)),
    [pens.data, assignedIds],
  );
  const penLabel = (id: string) => (pens.data ?? []).find((p) => p.id === id)?.label ?? "—";

  const allEvents = events.data ?? [];
  const listed = allEvents
    .filter((e) => penFilter === "all" || e.pen_id === penFilter)
    .slice()
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["population-events", trialId] });
  };

  if (!trial.isLoading && !trial.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Population</h1>
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No trial is active. <Link to="/trial" className="text-primary underline">Set up and start a trial.</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Population</div>
        <h1 className="text-2xl font-bold">Deaths, escapes, removals and additions.</h1>
      </header>

      {trialId && (
        <AddEventForm
          trialId={trialId}
          pens={trialPens}
          defaultDate={t}
          onSaved={refresh}
        />
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Event log</h2>
          <select value={penFilter} onChange={(e) => setPenFilter(e.target.value)} className="inp w-auto text-sm">
            <option value="all">All pens</option>
            {trialPens.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <ul className="space-y-2">
          {listed.map((e) => (
            <EventRow key={e.id} row={e} penLabel={penLabel(e.pen_id)} pens={trialPens} onSaved={refresh} />
          ))}
          {listed.length === 0 && <li className="text-sm text-muted-foreground">No events logged yet.</li>}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Per pen</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {trialPens.map((p) => {
            const current = liveCount(p, allEvents, t);
            const dead = cumulativeMortality(p.id, allEvents, t);
            const survival = p.initial_snail_count > 0 ? (current / p.initial_snail_count) * 100 : null;
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1 text-sm">
                <div className="text-base font-semibold">{p.label}</div>
                <Line label="Initial count" value={String(p.initial_snail_count)} />
                <Line label="Current live count" value={String(current)} strong />
                <Line label="Cumulative mortality" value={String(dead)} />
                <Line label="Survival to date" value={survival != null ? `${survival.toFixed(1)}%` : "—"} />
              </div>
            );
          })}
          {trialPens.length === 0 && <div className="text-sm text-muted-foreground">No pens assigned to this trial.</div>}
        </div>
      </section>

      {trialId && (
        <Reconciliation
          trialId={trialId}
          pens={trialPens}
          events={allEvents}
          biomass={biomass.data ?? []}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

interface MismatchRow {
  penId: string;
  label: string;
  date: string;
  derived: number;
  weighed: number;
  diff: number;
}

function Reconciliation({
  trialId, pens, events, biomass, onSaved,
}: {
  trialId: string;
  pens: { id: string; label: string; initial_snail_count: number }[];
  events: PopRow[];
  biomass: { pen_id: string; event_date: string; live_count: number }[];
  onSaved: () => void;
}) {
  const rows = pens
    .map((p) => {
      const last = biomass
        .filter((b) => b.pen_id === p.id)
        .sort((a, b) => a.event_date.localeCompare(b.event_date))
        .at(-1);
      if (!last) return null;
      const derived = liveCount(p, events, last.event_date);
      const diff = last.live_count - derived;
      return diff === 0
        ? null
        : { penId: p.id, label: p.label, date: last.event_date, derived, weighed: last.live_count, diff };
    })
    .filter(Boolean) as MismatchRow[];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
      <h2 className="font-semibold">Reconciliation</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Every pen's derived live count matches the count recorded at its most recent weighing.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((r) => (
              <ReconcileRow key={r.penId} row={r} trialId={trialId} onSaved={onSaved} />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            A mismatch means an unlogged death, escape or miscount.
          </p>
        </>
      )}
    </section>
  );
}

function ReconcileRow({
  row, trialId, onSaved,
}: {
  row: MismatchRow;
  trialId: string;
  onSaved: () => void;
}) {
  const isAddition = row.diff > 0;
  const eventType: EventType = isAddition ? "addition" : "mortality";
  const count = Math.abs(row.diff);
  const defaultNotes = `Logged at reconciliation against the weighing on ${row.date}. Actual date unknown.`;

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(defaultNotes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").insert({
          trial_id: trialId,
          pen_id: row.penId,
          event_date: row.date,
          event_type: eventType,
          count,
          cause: "unknown",
          notes: notes.trim() || null,
        } as never),
      );
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 font-medium text-amber-700">
            <AlertTriangle className="h-4 w-4" />{row.label} — {row.diff > 0 ? "+" : ""}{row.diff}
          </div>
          <div className="text-xs text-muted-foreground">
            Derived {row.derived} vs {row.weighed} counted at the weighing on {row.date}.
          </div>
        </div>
        {!open && (
          <button type="button" onClick={() => { setNotes(defaultNotes); setOpen(true); }}
            className="rounded-md border border-amber-500/60 bg-card px-3 py-2 text-xs font-medium text-amber-700">
            Reconcile
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="text-xs">
            This will create <span className="font-semibold">1 {labelOf(EVENT_TYPES, eventType).toLowerCase()} event</span> for{" "}
            <span className="font-semibold">{row.label}</span>: count <span className="font-semibold">{count}</span>,
            dated <span className="font-semibold">{row.date}</span>, cause <span className="font-semibold">unknown</span>.
          </div>
          <label className="block text-xs">
            <span className="block mb-1 text-muted-foreground">Notes</span>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="inp resize-none" />
          </label>
          {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void confirm()} disabled={busy}
              className="flex-1 rounded-md bg-primary py-2 text-primary-foreground text-sm font-medium disabled:opacity-50">
              <Check className="h-4 w-4 inline mr-1" /> Confirm and log
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

interface FormValues {
  pen_id: string;
  event_date: string;
  event_type: EventType;
  count: string;
  cause: Cause | "";
  notes: string;
}

function AddEventForm({
  trialId, pens, defaultDate, onSaved,
}: {
  trialId: string;
  pens: { id: string; label: string }[];
  defaultDate: string;
  onSaved: () => void;
}) {
  const empty = (): FormValues => ({
    pen_id: pens[0]?.id ?? "",
    event_date: defaultDate,
    event_type: "mortality",
    count: "1",
    cause: "",
    notes: "",
  });
  const [v, setV] = useState<FormValues>(empty);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const pickPhoto = async (file: File) => {
    if (!v.pen_id) return;
    setUploading(true);
    try {
      setPhotoUrl(await uploadPopulationPhoto({ trial_id: trialId, pen_id: v.pen_id, event_date: v.event_date, file }));
    } catch (err) {
      console.error("[upload failed] population photo", err);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const count = Number(v.count);
    if (!v.pen_id) { setError("Choose a pen."); return; }
    if (!Number.isFinite(count) || count <= 0) { setError("Count must be greater than zero."); return; }
    setError(null);
    setBusy(true);
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").insert({
          trial_id: trialId,
          pen_id: v.pen_id,
          event_date: v.event_date,
          event_type: v.event_type,
          count,
          cause: v.cause || null,
          notes: v.notes.trim() || null,
          photo_url: photoUrl,
        } as never),
      );
      setV(empty());
      setPhotoUrl(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">Log an event</h2>
      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Pen</span>
          <select value={v.pen_id} onChange={(e) => set("pen_id", e.target.value)} className="inp">
            {pens.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Date</span>
          <input type="date" value={v.event_date} onChange={(e) => set("event_date", e.target.value)} className="inp" />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {EVENT_TYPES.map((o) => (
          <button key={o.value} type="button" onClick={() => set("event_type", o.value)}
            className={`rounded-xl border py-2 text-xs font-medium ${v.event_type === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Count</span>
          <input type="number" min={1} value={v.count} onChange={(e) => set("count", e.target.value)} className="inp" />
        </label>
        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Cause</span>
          <select value={v.cause} onChange={(e) => set("cause", e.target.value as Cause | "")} className="inp">
            <option value="">Not recorded</option>
            {CAUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <label className="block text-xs">
        <span className="block mb-1 text-muted-foreground">Notes</span>
        <textarea rows={2} value={v.notes} onChange={(e) => set("notes", e.target.value)} className="inp resize-none" />
      </label>

      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) void pickPhoto(f); e.currentTarget.value = ""; }} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${photoUrl ? "border-primary/50 bg-primary/5 text-primary" : "border-border bg-card"}`}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          <span>{photoUrl ? "Photo attached" : uploading ? "Uploading…" : "Photo (optional)"}</span>
        </button>
        {photoUrl && (
          <img src={photoUrl} alt="Event" loading="lazy" decoding="async"
            className="h-12 w-12 rounded-md border border-border object-cover" />
        )}
      </div>

      <button onClick={() => void submit()} disabled={busy}
        className="w-full rounded-md bg-primary py-3 text-primary-foreground text-sm font-medium disabled:opacity-50">
        <Plus className="h-4 w-4 inline mr-1" /> Add event
      </button>
    </section>
  );
}

function EventRow({
  row, penLabel, pens, onSaved,
}: {
  row: PopRow;
  penLabel: string;
  pens: { id: string; label: string }[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState<FormValues>({
    pen_id: row.pen_id,
    event_date: row.event_date,
    event_type: row.event_type,
    count: String(row.count),
    cause: row.cause ?? "",
    notes: row.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = async () => {
    const count = Number(v.count);
    if (!Number.isFinite(count) || count <= 0) return;
    setBusy(true);
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").update({
          pen_id: v.pen_id,
          event_date: v.event_date,
          event_type: v.event_type,
          count,
          cause: v.cause || null,
          notes: v.notes.trim() || null,
        } as never).eq("id", row.id),
      );
      setEditing(false);
      onSaved();
    } catch { /* logged by writeWithRetry */ } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").delete().eq("id", row.id),
      );
      onSaved();
    } catch { /* logged by writeWithRetry */ } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <li className="rounded-lg border border-border p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={v.pen_id} onChange={(e) => set("pen_id", e.target.value)} className="inp text-xs">
            {pens.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input type="date" value={v.event_date} onChange={(e) => set("event_date", e.target.value)} className="inp text-xs" />
          <select value={v.event_type} onChange={(e) => set("event_type", e.target.value as EventType)} className="inp text-xs">
            {EVENT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="number" min={1} value={v.count} onChange={(e) => set("count", e.target.value)} className="inp text-xs" />
          <select value={v.cause} onChange={(e) => set("cause", e.target.value as Cause | "")} className="inp text-xs">
            <option value="">No cause</option>
            {CAUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes" className="inp text-xs" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => void save()} disabled={busy} className="flex-1 rounded-md bg-primary py-2 text-primary-foreground text-sm font-medium disabled:opacity-50">
            <Check className="h-4 w-4 inline mr-1" /> Save
          </button>
          <button onClick={() => setEditing(false)} className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-2 rounded-lg border border-border p-3">
      <div className="flex-1 text-sm">
        <div className="font-medium">
          {row.event_date} · {penLabel} · {labelOf(EVENT_TYPES, row.event_type)} · {row.count}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.cause ? labelOf(CAUSES, row.cause) : "No cause recorded"}
          {row.notes ? ` · ${row.notes}` : ""}
        </div>
      </div>
      <button onClick={() => setEditing(true)} className="p-2 text-muted-foreground hover:text-foreground" aria-label="Edit event">
        <Pencil className="h-4 w-4" />
      </button>
      <button onClick={() => void remove()} disabled={busy} className="p-2 text-muted-foreground hover:text-destructive" aria-label="Delete event">
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
