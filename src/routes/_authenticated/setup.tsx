import { createFileRoute, Link } from "@tanstack/react-router";
import { liveCount } from "@/lib/liveCount";
import { today } from "@/lib/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useState } from "react";
import { Plus, Trash2, Pencil, X, Check, Lock } from "lucide-react";
import { usePensWithData, INITIAL_COUNT_LOCK_MESSAGE } from "@/lib/penDataLock";


export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
});

type DmSource = Database["public"]["Enums"]["dm_source"];

function SetupPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Setup</h1>
        <p className="text-sm text-muted-foreground">Pens and feed library.</p>
      </header>
      <PensSection />
      <FeedsSection />
    </div>
  );
}

function PensSection() {
  const qc = useQueryClient();
  const t = today();
  const pens = useQuery({
    queryKey: ["pens"],
    queryFn: async () => (await supabase.from("pens").select("*").order("label")).data ?? [],
  });
  const trial = useQuery({
    queryKey: ["active-trial"],
    queryFn: async () => (await supabase.from("trials").select("id").eq("status", "active").maybeSingle()).data,
  });
  const trialActive = !!trial.data;

  const popEvents = useQuery({
    queryKey: ["population-events", trial.data?.id],
    enabled: trialActive,
    queryFn: async () =>
      (await supabase.from("population_events").select("pen_id,event_date,event_type,count").eq("trial_id", trial.data!.id)).data ?? [],
  });

  const withData = usePensWithData();
  const locked = (id: string) => withData.data?.has(id) ?? false;

  const [label, setLabel] = useState("");
  const [count, setCount] = useState(0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["pens"] });
    qc.invalidateQueries({ queryKey: ["pens-with-data"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pens").insert({ label, initial_snail_count: count });
      if (error) throw error;
    },
    onSuccess: () => { setLabel(""); setCount(0); refresh(); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("pens").delete().eq("id", id); },
    onSuccess: refresh,
  });

  const update = useMutation({
    mutationFn: async (p: { id: string; patch: Record<string, unknown> }) => {
      await supabase.from("pens").update(p.patch).eq("id", p.id);
    },
    onSuccess: refresh,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Pens</h2>
      {trialActive && (
        <p className="mb-3 text-xs text-muted-foreground">
          A trial is running. Snail numbers change through the{" "}
          <Link to="/population" className="text-primary underline">population screen</Link>.
        </p>
      )}
      <ul className="space-y-2 mb-4">
        {pens.data?.map((p) => (
          <li key={p.id} className="rounded-lg border border-border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                defaultValue={p.label}
                aria-label={`Label for ${p.label}`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== p.label && update.mutate({ id: p.id, patch: { label: e.target.value.trim() } })}
                className="flex-1 rounded-md border border-input bg-background px-2 py-1 font-medium"
              />
              {trialActive && (
                <div className="text-right">
                  <div className="font-semibold">{liveCount(p, popEvents.data ?? [], t)}</div>
                  <div className="text-[10px] text-muted-foreground">live now</div>
                </div>
              )}
              {!locked(p.id) && (
                <button onClick={() => del.mutate(p.id)} aria-label={`Remove ${p.label}`} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="block mb-1 text-muted-foreground">Initial snail count</span>
                {locked(p.id) ? (
                  <div className="rounded-md border border-input bg-muted px-2 py-1">{p.initial_snail_count}</div>
                ) : (
                  <input type="number" min={0} defaultValue={p.initial_snail_count}
                    aria-label={`Initial snail count for ${p.label}`}
                    onBlur={(e) => update.mutate({ id: p.id, patch: { initial_snail_count: Number(e.target.value) } })}
                    className="w-full rounded-md border border-input bg-background px-2 py-1" />
                )}
              </label>
              <label className="text-xs">
                <span className="block mb-1 text-muted-foreground">Area (m²)</span>
                <input type="number" step="0.01" min={0} defaultValue={p.area_m2 ?? ""}
                  aria-label={`Area for ${p.label}`}
                  onBlur={(e) => update.mutate({ id: p.id, patch: { area_m2: e.target.value === "" ? null : Number(e.target.value) } })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1" />
              </label>
            </div>
            {locked(p.id) && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{INITIAL_COUNT_LOCK_MESSAGE} The pen also cannot be removed while it holds recorded data.</span>
              </p>
            )}
          </li>
        ))}
        {pens.data?.length === 0 && <li className="text-sm text-muted-foreground">No pens yet.</li>}
      </ul>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <label className="text-xs col-span-full sm:col-span-1">
          <span className="block mb-1 text-muted-foreground">Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pen A"
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-muted-foreground">Initial snail count</span>
          <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20 rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <button disabled={!label} onClick={() => add.mutate()} className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm font-medium disabled:opacity-50">
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {trialActive && (
        <p className="mt-2 text-xs text-muted-foreground">
          A new pen can join a running trial — give it a treatment on the{" "}
          <Link to="/trial" className="text-primary underline">trial screen</Link>; its intervals start from its own first weighing.
        </p>
      )}
    </section>
  );
}


const DM_SOURCE_OPTIONS: { value: DmSource; label: string }[] = [
  { value: "literature", label: "Literature" },
  { value: "supplier", label: "Supplier" },
  { value: "measured", label: "Measured" },
];

interface FeedFormValues {
  name: string;
  cost_per_kg: string;
  dm_percent: string;
  dm_source: DmSource | "";
  notes: string;
}

function emptyFeedForm(): FeedFormValues {
  return {
    name: "",
    cost_per_kg: "",
    dm_percent: "",
    dm_source: "",
    notes: "",
  };
}

function feedToFormValues(feed: TablesRow<"feeds">): FeedFormValues {
  return {
    name: feed.name,
    cost_per_kg: feed.cost_per_kg?.toString() ?? "",
    dm_percent: feed.dm_percent?.toString() ?? "",
    dm_source: feed.dm_source ?? "",
    notes: feed.notes ?? "",
  };
}

function validateFeedForm(values: FeedFormValues): string | null {
  if (!values.name.trim()) return "Name is required.";
  if (values.dm_percent.trim()) {
    const dm = Number(values.dm_percent);
    if (Number.isNaN(dm) || dm < 0 || dm > 100) {
      return "Dry matter % must be between 0 and 100.";
    }
    if (!values.dm_source) {
      return "Select a dry matter source when dry matter % is entered.";
    }
  }
  return null;
}

function formToFeedInsert(values: FeedFormValues): Database["public"]["Tables"]["feeds"]["Insert"] {
  const dmPercent = values.dm_percent.trim() ? Number(values.dm_percent) : null;
  return {
    name: values.name.trim(),
    cost_per_kg: values.cost_per_kg.trim() ? Number(values.cost_per_kg) : null,
    dm_percent: dmPercent,
    dm_source: dmPercent ? (values.dm_source as DmSource) : null,
    notes: values.notes.trim() || null,
  };
}

type TablesRow<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

function FeedsSection() {
  const qc = useQueryClient();
  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => (await supabase.from("feeds").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const [addValues, setAddValues] = useState<FeedFormValues>(emptyFeedForm());
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<FeedFormValues>(emptyFeedForm());
  const [editError, setEditError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async (values: FeedFormValues) => {
      const { error } = await supabase.from("feeds").insert(formToFeedInsert(values));
      if (error) throw error;
    },
    onSuccess: () => {
      setAddValues(emptyFeedForm());
      setAddError(null);
      qc.invalidateQueries({ queryKey: ["feeds"] });
    },
    onError: (err: Error) => setAddError(err.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: FeedFormValues }) => {
      const { error } = await supabase.from("feeds").update(formToFeedInsert(values)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      setEditValues(emptyFeedForm());
      setEditError(null);
      qc.invalidateQueries({ queryKey: ["feeds"] });
    },
    onError: (err: Error) => setEditError(err.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("feeds").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feeds"] }),
  });

  const startEdit = (feed: TablesRow<"feeds">) => {
    setEditingId(feed.id);
    setEditValues(feedToFormValues(feed));
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues(emptyFeedForm());
    setEditError(null);
  };

  const submitAdd = () => {
    const error = validateFeedForm(addValues);
    if (error) {
      setAddError(error);
      return;
    }
    setAddError(null);
    add.mutate(addValues);
  };

  const submitEdit = () => {
    if (!editingId) return;
    const error = validateFeedForm(editValues);
    if (error) {
      setEditError(error);
      return;
    }
    setEditError(null);
    update.mutate({ id: editingId, values: editValues });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Feeds</h2>
      <ul className="space-y-3 mb-4">
        {feeds.data?.map((f) => (
          <li key={f.id} className="rounded-lg border border-border p-3">
            {editingId === f.id ? (
              <div className="space-y-3">
                <FeedForm
                  values={editValues}
                  onChange={setEditValues}
                  error={editError}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={submitEdit}
                    className="flex-1 rounded-md bg-primary py-2 text-primary-foreground text-sm font-medium"
                  >
                    <Check className="h-4 w-4 inline mr-1" /> Save changes
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.cost_per_kg != null ? `${f.cost_per_kg}/kg` : "No cost recorded"}
                    {f.dm_percent != null && ` · DM ${f.dm_percent}% (${labelFor(DM_SOURCE_OPTIONS, f.dm_source)})`}
                  </div>
                  {f.notes && <div className="text-xs text-muted-foreground italic">{f.notes}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(f)}
                    className="p-2 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${f.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => del.mutate(f.id)}
                    className="p-2 text-muted-foreground hover:text-destructive"
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
        {feeds.data?.length === 0 && <li className="text-sm text-muted-foreground">No feeds yet.</li>}
      </ul>

      <div className="rounded-xl border border-border bg-background/50 p-3 space-y-3">
        <h3 className="text-sm font-semibold">Add new feed</h3>
        <FeedForm values={addValues} onChange={setAddValues} error={addError} />
        <button
          onClick={submitAdd}
          disabled={add.isPending}
          className="w-full rounded-md bg-primary py-2 text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          <Plus className="h-4 w-4 inline mr-1" /> Add feed
        </button>
      </div>
    </section>
  );
}

function labelFor<T extends { value: string; label: string }>(options: T[], value: string | null): string {
  return options.find((o) => o.value === value)?.label ?? value ?? "—";
}

interface FeedFormProps {
  values: FeedFormValues;
  onChange: (values: FeedFormValues) => void;
  error: string | null;
}

function FeedForm({ values, onChange, error }: FeedFormProps) {
  const update = <K extends keyof FeedFormValues>(key: K, value: FeedFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const dmEnabled = values.dm_percent.trim() !== "";

  return (
    <div className="space-y-3">
      {error && <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      <label className="block text-xs">
        <span className="block mb-1 text-muted-foreground">Name <span className="text-destructive">*</span></span>
        <input
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Cassava leaves"
          className="inp"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Cost per kg (reference only)</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={values.cost_per_kg}
            onChange={(e) => update("cost_per_kg", e.target.value)}
            className="inp"
          />
          <span className="mt-1 block text-[10px] text-muted-foreground">
            Not used in any calculation. Cost analysis is done externally from the export.
          </span>
        </label>

        <label className="block text-xs">
          <span className="block mb-1 text-muted-foreground">Dry matter %</span>
          <input
            type="number"
            step="0.1"
            min={0}
            max={100}
            value={values.dm_percent}
            onChange={(e) => update("dm_percent", e.target.value)}
            className="inp"
          />
          <span className="mt-1 block text-[10px] text-muted-foreground">
            Optional. Can be added at any time, including after the trial ends — all figures recompute automatically.
          </span>
        </label>
      </div>

      <label className="block text-xs">
        <span className="block mb-1 text-muted-foreground">Dry matter source</span>
        <select
          value={values.dm_source}
          onChange={(e) => update("dm_source", e.target.value as DmSource | "")}
          disabled={!dmEnabled}
          className="inp disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">{dmEnabled ? "Select source" : "Enter DM % first"}</option>
          {DM_SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="block text-xs">
        <span className="block mb-1 text-muted-foreground">Notes</span>
        <textarea
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={2}
          className="inp resize-none"
        />
        <span className="mt-1 block text-[10px] text-muted-foreground">
          For a blended feed, record the component ratio here.
        </span>
      </label>
    </div>
  );
}
