import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { today } from "@/lib/date";

export const Route = createFileRoute("/_authenticated/trial")({
  component: TrialPage,
});

type Trial = {
  id: string;
  name: string;
  start_date: string;
  planned_end_date: string | null;
  end_date: string | null;
  status: "setup" | "active" | "closed";
  weighing_interval_days: number;
  acclimation_days: number;
  notes: string | null;
};
type Feed = { id: string; name: string };
type Pen = { id: string; label: string; snail_count: number; area_m2: number | null };
type Treatment = { id: string; trial_id: string; feed_id: string; label: string };
type Assignment = { id: string; trial_id: string; pen_id: string; treatment_id: string; start_date: string };
type BiomassRow = { pen_id: string; event_date: string; live_count: number; net_biomass_g: number };

function TrialPage() {
  const qc = useQueryClient();

  const trials = useQuery({
    queryKey: ["trials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trials").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Trial[];
    },
  });

  const activeTrial = trials.data?.find((t) => t.status === "active") ?? null;
  const setupTrial = trials.data?.find((t) => t.status === "setup") ?? null;
  const current = activeTrial ?? setupTrial;

  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => ((await supabase.from("feeds").select("id,name").order("name")).data ?? []) as Feed[],
  });
  const pens = useQuery({
    queryKey: ["pens"],
    queryFn: async () =>
      ((await supabase.from("pens").select("id,label,snail_count,area_m2").order("label")).data ?? []) as Pen[],
  });
  const biomass = useQuery({
    queryKey: ["biomass_events", current?.id],
    enabled: !!current,
    queryFn: async () =>
      ((
        await supabase
          .from("biomass_events")
          .select("pen_id,event_date,live_count,net_biomass_g")
          .eq("trial_id", current!.id)
          .order("event_date")
      ).data ?? []) as BiomassRow[],
  });
  const treatments = useQuery({
    queryKey: ["treatments", current?.id],
    enabled: !!current,
    queryFn: async () =>
      ((await supabase.from("treatments").select("*").eq("trial_id", current!.id).order("created_at")).data ?? []) as Treatment[],
  });
  const assignments = useQuery({
    queryKey: ["pen_assignments", current?.id],
    enabled: !!current,
    queryFn: async () =>
      ((await supabase.from("pen_assignments").select("*").eq("trial_id", current!.id)).data ?? []) as Assignment[],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trials"] });
    qc.invalidateQueries({ queryKey: ["treatments"] });
    qc.invalidateQueries({ queryKey: ["pen_assignments"] });
  };

  const penList = pens.data ?? [];
  const tList = treatments.data ?? [];
  const aList = assignments.data ?? [];

  const assignmentByPen = useMemo(() => {
    const m = new Map<string, string>();
    aList.forEach((a) => m.set(a.pen_id, a.treatment_id));
    return m;
  }, [aList]);

  const baselineByPen = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of biomass.data ?? []) {
      if (m.has(b.pen_id)) continue; // rows ordered by date; first is baseline
      if (!b.live_count || b.live_count <= 0) continue;
      m.set(b.pen_id, Number(b.net_biomass_g) / b.live_count);
    }
    return m;
  }, [biomass.data]);

  const unassigned = penList.filter((p) => !assignmentByPen.get(p.id)).length;
  const canStart = !activeTrial && !!setupTrial && tList.length >= 2 && penList.length > 0 && unassigned === 0;

  const startTrial = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("trials").update({ status: "active" }).eq("id", setupTrial!.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const closeTrial = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("trials")
        .update({ status: "closed", end_date: today() })
        .eq("id", activeTrial!.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Trial</h1>
        <p className="text-sm text-muted-foreground">
          {activeTrial ? "Running trial overview." : "Set up a trial in three steps."}
        </p>
      </header>

      {trials.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeTrial ? (
        <ActiveTrialPanel
          trial={activeTrial}
          treatments={tList}
          feeds={feeds.data ?? []}
          pens={penList}
          assignments={aList}
          onClose={() => closeTrial.mutate()}
          closing={closeTrial.isPending}
        />
      ) : (
        <>
          <StepOne trial={setupTrial} onSaved={invalidate} />
          <StepTwo trial={setupTrial} feeds={feeds.data ?? []} treatments={tList} onChanged={invalidate} />
          <StepThree
            trial={setupTrial}
            pens={penList}
            treatments={tList}
            assignmentByPen={assignmentByPen}
            onChanged={invalidate}
          />
        </>
      )}

      <DesignIntegrityPanel
        pens={penList}
        treatments={tList}
        assignmentByPen={assignmentByPen}
        baselineByPen={baselineByPen}
      />

      {!activeTrial && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <button
            disabled={!canStart || startTrial.isPending}
            onClick={() => startTrial.mutate()}
            className="w-full rounded-xl bg-primary py-3 text-primary-foreground font-semibold disabled:opacity-50"
          >
            {startTrial.isPending ? "Starting…" : "Start trial"}
          </button>
          {!canStart && (
            <p className="mt-2 text-xs text-muted-foreground">
              {!setupTrial
                ? "Save trial details first."
                : tList.length < 2
                  ? "Add at least two treatments."
                  : unassigned > 0
                    ? `${unassigned} pen${unassigned === 1 ? "" : "s"} still unassigned.`
                    : "Add pens in Setup first."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Step 1 ---------- */

function StepOne({ trial, onSaved }: { trial: Trial | null; onSaved: () => void }) {
  const [name, setName] = useState(trial?.name ?? "");
  const [start, setStart] = useState(trial?.start_date ?? today());
  const [plannedEnd, setPlannedEnd] = useState(trial?.planned_end_date ?? "");
  const [interval, setInterval] = useState(String(trial?.weighing_interval_days ?? 7));
  const [acclim, setAcclim] = useState(String(trial?.acclimation_days ?? 7));
  const [notes, setNotes] = useState(trial?.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        start_date: start,
        planned_end_date: plannedEnd || null,
        weighing_interval_days: Number(interval) || 7,
        acclimation_days: Number(acclim) || 0,
        notes: notes || null,
      };
      if (trial) {
        const { error } = await supabase.from("trials").update(payload).eq("id", trial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("trials").insert({ ...payload, status: "setup" });
        if (error) throw error;
      }
    },
    onSuccess: onSaved,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <StepHeader n={1} title="Trial details" done={!!trial} />
      <div className="grid grid-cols-2 gap-3">
        <Field className="col-span-2" label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Palatability trial 1" className="inp" />
        </Field>
        <Field label="Start date">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="inp" />
        </Field>
        <Field label="Planned end date">
          <input type="date" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} className="inp" />
        </Field>
        <Field label="Weighing interval (days)">
          <input type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} className="inp" />
        </Field>
        <Field label="Acclimation (days)">
          <input type="number" min={0} value={acclim} onChange={(e) => setAcclim(e.target.value)} className="inp" />
        </Field>
        <Field className="col-span-2" label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="inp" />
        </Field>
      </div>
      <button
        disabled={!name || !start || save.isPending}
        onClick={() => save.mutate()}
        className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {trial ? "Save details" : "Create trial"}
      </button>
    </section>
  );
}

/* ---------- Step 2 ---------- */

function StepTwo({
  trial,
  feeds,
  treatments,
  onChanged,
}: {
  trial: Trial | null;
  feeds: Feed[];
  treatments: Treatment[];
  onChanged: () => void;
}) {
  const [feedId, setFeedId] = useState("");
  const [label, setLabel] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const feed = feeds.find((f) => f.id === feedId);
      const { error } = await supabase
        .from("treatments")
        .insert({ trial_id: trial!.id, feed_id: feedId, label: label || feed?.name || "Treatment" });
      if (error) throw error;
    },
    onSuccess: () => {
      setFeedId("");
      setLabel("");
      onChanged();
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("pen_assignments").delete().eq("treatment_id", id);
      const { error } = await supabase.from("treatments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: onChanged,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <StepHeader n={2} title="Treatments" done={treatments.length >= 2} />
      {!trial ? (
        <p className="text-sm text-muted-foreground">Save trial details first.</p>
      ) : (
        <>
          <ul className="space-y-2 mb-3">
            {treatments.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <span className="h-6 w-6 shrink-0 rounded-full bg-muted text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{feeds.find((f) => f.id === t.feed_id)?.name ?? "—"}</div>
                </div>
                <button onClick={() => del.mutate(t.id)} className="p-2 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
            {treatments.length === 0 && <li className="text-sm text-muted-foreground">No treatments yet.</li>}
          </ul>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Feed">
              <select
                value={feedId}
                onChange={(e) => {
                  setFeedId(e.target.value);
                  const f = feeds.find((x) => x.id === e.target.value);
                  if (f && !label) setLabel(f.name);
                }}
                className="inp"
              >
                <option value="">Pick a feed…</option>
                {feeds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Label">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Defaults to feed name" className="inp" />
            </Field>
            <button
              disabled={!feedId || add.isPending}
              onClick={() => add.mutate()}
              className="col-span-2 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-4 w-4 inline mr-1" /> Add treatment
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Add as many treatment arms as you need — there is no limit.</p>
        </>
      )}
    </section>
  );
}

/* ---------- Step 3 ---------- */

function StepThree({
  trial,
  pens,
  treatments,
  assignmentByPen,
  onChanged,
}: {
  trial: Trial | null;
  pens: Pen[];
  treatments: Treatment[];
  assignmentByPen: Map<string, string>;
  onChanged: () => void;
}) {
  const assign = useMutation({
    mutationFn: async (p: { penId: string; treatmentId: string }) => {
      await supabase.from("pen_assignments").delete().eq("trial_id", trial!.id).eq("pen_id", p.penId);
      if (p.treatmentId) {
        const { error } = await supabase.from("pen_assignments").insert({
          trial_id: trial!.id,
          pen_id: p.penId,
          treatment_id: p.treatmentId,
          start_date: trial!.start_date,
        });
        if (error) throw error;
      }
    },
    onSuccess: onChanged,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <StepHeader
        n={3}
        title="Pen assignments"
        done={pens.length > 0 && pens.every((p) => assignmentByPen.get(p.id))}
      />
      {!trial ? (
        <p className="text-sm text-muted-foreground">Save trial details first.</p>
      ) : treatments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add treatments first.</p>
      ) : pens.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pens yet — add them in Setup.</p>
      ) : (
        <ul className="space-y-2">
          {pens.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
              <div className="flex-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">
                  {p.snail_count} snails
                </div>
              </div>
              <select
                value={assignmentByPen.get(p.id) ?? ""}
                onChange={(e) => assign.mutate({ penId: p.id, treatmentId: e.target.value })}
                className="inp w-40"
              >
                <option value="">Unassigned</option>
                {treatments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- Active trial ---------- */

function ActiveTrialPanel({
  trial,
  treatments,
  feeds,
  pens,
  assignments,
  onClose,
  closing,
}: {
  trial: Trial;
  treatments: Treatment[];
  feeds: Feed[];
  pens: Pen[];
  assignments: Assignment[];
  onClose: () => void;
  closing: boolean;
}) {
  const [includeAcclimation, setIncludeAcclimation] = useState(false);
  const day = Math.floor((Date.parse(today()) - Date.parse(trial.start_date)) / 86400000) + 1;

  const obs = useQuery({
    queryKey: ["trial-obs-count", trial.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("observations")
        .select("id", { count: "exact", head: true })
        .eq("trial_id", trial.id);
      return count ?? 0;
    },
  });

  const penById = new Map(pens.map((p) => [p.id, p]));

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Active trial</div>
            <h2 className="text-xl font-semibold">{trial.name}</h2>
            <p className="text-sm text-muted-foreground">
              Day {day} · started {trial.start_date}
              {trial.planned_end_date ? ` · planned end ${trial.planned_end_date}` : ""}
            </p>
          </div>
        </div>

        <h3 className="mt-4 mb-2 font-medium">Treatments</h3>
        <ul className="space-y-2">
          {treatments.map((t) => {
            const assigned = assignments.filter((a) => a.treatment_id === t.id).map((a) => penById.get(a.pen_id)?.label ?? "?");
            return (
              <li key={t.id} className="rounded-lg border border-border p-2">
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">
                  {feeds.find((f) => f.id === t.feed_id)?.name ?? "—"} · {assigned.length} pen
                  {assigned.length === 1 ? "" : "s"}
                  {assigned.length > 0 && `: ${assigned.join(", ")}`}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="font-medium">Data completeness</div>
          <div className="text-muted-foreground">
            {obs.data ?? 0} feeding records logged against this trial across {pens.length} pens.
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={includeAcclimation}
            onChange={(e) => setIncludeAcclimation(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            Include acclimation days in metrics
            <span className="block text-xs text-muted-foreground">
              First {trial.acclimation_days} days. Excluded by default.
            </span>
          </span>
        </label>

        <button
          onClick={onClose}
          disabled={closing}
          className="mt-4 w-full rounded-xl border border-destructive/40 py-3 text-sm font-semibold text-destructive disabled:opacity-50"
        >
          {closing ? "Closing…" : "Close trial"}
        </button>
      </section>
    </>
  );
}

/* ---------- Design integrity ---------- */

function DesignIntegrityPanel({
  pens,
  treatments,
  assignmentByPen,
  baselineByPen,
}: {
  pens: Pen[];
  treatments: Treatment[];
  assignmentByPen: Map<string, string>;
  baselineByPen: Map<string, number>;
}) {
  const perTreatment = treatments.map((t) => ({
    t,
    pens: pens.filter((p) => assignmentByPen.get(p.id) === t.id),
  }));

  // Baseline mean weight check — only once every assigned pen has a first biomass row.
  const assignedForBaseline = pens.filter((p) => assignmentByPen.get(p.id));
  const baselineReady =
    assignedForBaseline.length > 0 && assignedForBaseline.every((p) => baselineByPen.has(p.id));
  const treatmentBaselines = baselineReady
    ? perTreatment
        .filter(({ pens: ps }) => ps.length > 0)
        .map(({ t, pens: ps }) => ({
          t,
          mean: ps.reduce((s, p) => s + (baselineByPen.get(p.id) as number), 0) / ps.length,
        }))
    : [];
  const trialMean = baselineReady
    ? assignedForBaseline.reduce((s, p) => s + (baselineByPen.get(p.id) as number), 0) /
      assignedForBaseline.length
    : 0;
  const baselineOutliers =
    baselineReady && trialMean > 0
      ? treatmentBaselines.filter((x) => Math.abs(x.mean - trialMean) / trialMean > 0.1)
      : [];

  const assignedPens = pens.filter((p) => assignmentByPen.get(p.id));
  const totalSnails = assignedPens.reduce((s, p) => s + (p.snail_count ?? 0), 0);
  const withArea = assignedPens.filter((p) => p.area_m2 && p.area_m2 > 0);
  const meanDensity =
    withArea.length > 0
      ? withArea.reduce((s, p) => s + p.snail_count / (p.area_m2 as number), 0) / withArea.length
      : null;

  const thin = perTreatment.filter(({ pens: ps }) => ps.length < 3);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-1">Design integrity</h2>
      <p className="text-xs text-muted-foreground mb-3">Advisory only — none of these prevent starting the trial.</p>

      <div className="space-y-2">
        {treatments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add treatments to see design checks.</p>
        ) : (
          <>
            <div className="rounded-lg border border-border p-2">
              <div className="text-sm font-medium mb-1">Pens per treatment</div>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {perTreatment.map(({ t, pens: ps }) => (
                  <li key={t.id}>
                    {t.label}: {ps.length}
                  </li>
                ))}
              </ul>
            </div>
            {thin.length > 0 ? (
              <Warn>
                {thin.map(({ t, pens: ps }) => `${t.label} has ${ps.length}`).join("; ")} — fewer than 3 pens limits
                statistical power.
              </Warn>
            ) : (
              <Ok>Every treatment has at least 3 pens.</Ok>
            )}
            {imbalance.length > 0 ? (
              <Warn>Age classes are unevenly spread across treatments — consider rebalancing.</Warn>
            ) : (
              <Ok>Age classes are reasonably balanced across treatments.</Ok>
            )}
          </>
        )}

        <div className="rounded-lg border border-border p-2 text-sm">
          <div className="font-medium mb-1">Totals</div>
          <div className="text-xs text-muted-foreground">
            {assignedPens.length} assigned pens · {totalSnails} snails ·{" "}
            {meanDensity != null ? `${meanDensity.toFixed(1)} snails/m² mean density` : "density unavailable (no pen areas set)"}
          </div>
        </div>
      </div>
    </section>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
function Ok({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-border p-2 text-xs text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </div>
  );
}

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${
          done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {n}
      </span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`text-xs ${className ?? ""}`}>
      <span className="block mb-1 text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
