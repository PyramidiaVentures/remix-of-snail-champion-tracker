import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { today } from "@/lib/date";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { PenStepper, type PenCompletion, type StepperPen } from "@/components/PenStepper";
import { PenPhotoSlot, penPhotoKey } from "@/components/PenPhotoSlot";
import { useUploads } from "@/lib/photoUploads.store";
import { upsertRow, OBSERVATIONS_TRIAL_KEY } from "@/lib/upsertRow";
import type { Database } from "@/integrations/supabase/types";
import { BookOpen, Save, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pm")({
  component: PmPage,
});

type DishAction = Database["public"]["Enums"]["dish_action"];

const DISH_ACTIONS: { value: DishAction; label: string }[] = [
  { value: "topped_up", label: "Topped up" },
  { value: "emptied_refilled", label: "Emptied & refilled" },
  { value: "emptied_spoiled", label: "Emptied — spoiled" },
];

const PM_STEPS = [
  "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).",
  "Check each dish against the discard criteria. If the remaining feed is sound, top up. If it fails any criterion, empty and clean the dish first.",
  "Weigh the portion for each pen and enter grams offered.",
  "Record the dish action: topped up, emptied and refilled, or emptied because spoiled.",
  "Place feed in each pen, rotating the dish position from yesterday.",
  "Top up calcium and water dishes (never weighed, always present).",
  "Upload one PM photo per pen, dish and paper tag in frame.",
];
const PM_PHOTO_STEP_INDEX = 6;

type SaveState = "idle" | "saving" | "saved" | "failed";

function StatusPill({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />saving</span>;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="h-3 w-3" />saved</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" />failed — retry</span>;
}

function addDays(date: string, days: number): string {
  // UTC arithmetic: local-midnight parsing would shift the result a day in non-UTC zones.
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function PmPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());
  const uploads = useUploads();

  const trial = useQuery({
    queryKey: ["active-trial"],
    queryFn: async () => (await supabase.from("trials").select("*").eq("status", "active").maybeSingle()).data,
  });
  const trialId = trial.data?.id;

  const pens = useQuery({
    queryKey: ["pens"],
    queryFn: async () => (await supabase.from("pens").select("id,label")).data?.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) ?? [],
  });

  const assignments = useQuery({
    queryKey: ["pen-assignments", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id,treatment_id").eq("trial_id", trialId!).is("end_date", null)).data ?? [],
  });

  const treatments = useQuery({
    queryKey: ["treatments", trialId],
    enabled: !!trialId,
    queryFn: async () => (await supabase.from("treatments").select("id,feed_id,label").eq("trial_id", trialId!)).data ?? [],
  });

  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => (await supabase.from("feeds").select("id,name")).data ?? [],
  });

  const obs = useQuery({
    queryKey: ["trial-obs", trialId, date],
    enabled: !!trialId,
    queryFn: async () => (await supabase.from("observations").select("*").eq("trial_id", trialId!).eq("obs_date", date)).data ?? [],
  });

  // Prior dish actions, for the carry-over indicator.
  const history = useQuery({
    queryKey: ["trial-obs-history", trialId, date],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase
        .from("observations")
        .select("pen_id,obs_date,dish_action")
        .eq("trial_id", trialId!)
        .lt("obs_date", date)
        .order("obs_date", { ascending: false })).data ?? [],
  });

  const photos = useQuery({
    queryKey: ["trial-photos", trialId, date],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("session_photos").select("pen_id,photo_pm_url").eq("trial_id", trialId!).eq("obs_date", date)).data ?? [],
  });

  const feedByPen = useMemo(() => {
    const treatmentById = new Map((treatments.data ?? []).map((t) => [t.id, t]));
    const feedById = new Map((feeds.data ?? []).map((f) => [f.id, f]));
    const map = new Map<string, { feed_id: string; name: string }>();
    for (const a of assignments.data ?? []) {
      const t = treatmentById.get(a.treatment_id);
      if (!t) continue;
      map.set(a.pen_id, { feed_id: t.feed_id, name: feedById.get(t.feed_id)?.name ?? t.label });
    }
    return map;
  }, [assignments.data, treatments.data, feeds.data]);

  const trialPens: StepperPen[] = useMemo(
    () => (pens.data ?? []).filter((p) => feedByPen.has(p.id)).map((p) => ({ id: p.id, label: p.label })),
    [pens.data, feedByPen],
  );

  const carryOverByPen = useMemo(() => {
    const map = new Map<string, number>();
    const byPen = new Map<string, { obs_date: string; dish_action: DishAction | null }[]>();
    for (const r of history.data ?? []) {
      const list = byPen.get(r.pen_id) ?? [];
      list.push({ obs_date: r.obs_date, dish_action: r.dish_action });
      byPen.set(r.pen_id, list);
    }
    for (const [penId, rows] of byPen) {
      let count = 0;
      let expected = addDays(date, -1);
      for (const r of rows) {
        if (r.obs_date !== expected || r.dish_action !== "topped_up") break;
        count++;
        expected = addDays(expected, -1);
      }
      map.set(penId, count);
    }
    return map;
  }, [history.data, date]);

  const rowFor = (penId: string) => (obs.data ?? []).find((o) => o.pen_id === penId);
  const photoUrlFor = (penId: string) => (photos.data ?? []).find((r) => r.pen_id === penId)?.photo_pm_url ?? null;

  const missingFor = (penId: string) => {
    const row = rowFor(penId);
    const missing: string[] = [];
    if (row?.offered_g == null) missing.push("grams offered");
    if (!row?.dish_action) missing.push("dish action");
    if (!photoUrlFor(penId) && uploads.get(penPhotoKey(trialId ?? "", penId, date, "pm"))?.status !== "saved") {
      missing.push("PM photo");
    }
    return missing;
  };

  const stateFor = (penId: string): PenCompletion => {
    if (uploads.get(penPhotoKey(trialId ?? "", penId, date, "pm"))?.status === "uploading") return "uploading";
    const missing = missingFor(penId);
    if (missing.length === 0) return "complete";
    return missing.length === 3 ? "empty" : "partial";
  };

  const photosDone = trialPens.filter(
    (p) => photoUrlFor(p.id) || uploads.get(penPhotoKey(trialId ?? "", p.id, date, "pm"))?.status === "saved",
  ).length;
  const photosNeeded = trialPens.length;
  const allPhotos = photosNeeded > 0 && photosDone === photosNeeded;

  const overrides = PM_STEPS.map((_, i) =>
    i === PM_PHOTO_STEP_INDEX
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: photosNeeded === 0
            ? "Assign pens to the trial first."
            : allPhotos
              ? `All ${photosNeeded} pen photos uploaded.`
              : `${photosNeeded - photosDone} of ${photosNeeded} pen photos still needed.`,
        }
      : undefined,
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["trial-obs", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["trial-photos", trialId, date] });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">PM Feeding · ~4:30 PM</div>
          <h1 className="text-2xl font-bold">One pen at a time.</h1>
        </div>
        <Link to="/guide" className="text-primary flex items-center gap-1 text-sm"><BookOpen className="h-4 w-4" />Guide</Link>
      </header>

      <label className="block">
        <span className="text-sm font-medium">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      <Checklist storageKey={`pm-checklist-${date}`} title="PM steps" items={PM_STEPS} overrides={overrides} />

      {!trial.isLoading && !trial.data && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No trial is active. <Link to="/trial" className="text-primary underline">Set up and start a trial.</Link>
        </div>
      )}

      {trial.data && (
        <PenStepper
          pens={trialPens}
          stateFor={stateFor}
          missingFor={missingFor}
          paramName="pen"
          renderPen={(pen) => (
            <PenCard
              key={pen.id}
              trial={trial.data!}
              pen={pen}
              feed={feedByPen.get(pen.id)!}
              date={date}
              row={rowFor(pen.id)}
              carryOver={carryOverByPen.get(pen.id) ?? 0}
              photoUrl={photoUrlFor(pen.id)}
              onSaved={refresh}
            />
          )}
        />
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Save className="h-3 w-3" /> Every field saves on its own when you leave it. Moving between pens never saves or discards anything.
      </p>
    </div>
  );
}

type TrialRow = Database["public"]["Tables"]["trials"]["Row"];
type ObsRow = Database["public"]["Tables"]["observations"]["Row"];

function PenCard({
  trial,
  pen,
  feed,
  date,
  row,
  carryOver,
  photoUrl,
  onSaved,
}: {
  trial: TrialRow;
  pen: StepperPen;
  feed: { feed_id: string; name: string };
  date: string;
  row: ObsRow | undefined;
  carryOver: number;
  photoUrl: string | null;
  onSaved: () => void;
}) {
  const [offeredState, setOfferedState] = useState<SaveState>("idle");
  const [actionState, setActionState] = useState<SaveState>("idle");
  const [action, setAction] = useState<DishAction | null>(row?.dish_action ?? null);

  const isAcclimation =
    trial.acclimation_days > 0 && date < addDays(trial.start_date, trial.acclimation_days);

  const saveField = async (patch: Partial<ObsRow>, setState: (s: SaveState) => void) => {
    setState("saving");
    try {
      await upsertRow(
        "observations",
        {
          trial_id: trial.id,
          pen_id: pen.id,
          feed_id: feed.feed_id,
          obs_date: date,
          is_acclimation: isAcclimation,
          ...patch,
        },
        OBSERVATIONS_TRIAL_KEY,
      );
      setState("saved");
      onSaved();
    } catch {
      setState("failed");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div>
        <div className="text-lg font-bold">{pen.label}</div>
        <div className="text-sm text-muted-foreground">
          Assigned feed: <span className="font-medium text-foreground">{feed.name}</span>
        </div>
        <div className={`mt-1 text-xs ${carryOver > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
          {carryOver === 0 ? "Fresh dish" : `Carry-over day ${carryOver} — check against the discard criteria`}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Offered</span>
          <StatusPill state={offeredState === "idle" && row?.offered_g != null ? "saved" : offeredState} />
        </div>
        <NumberField
          label="Grams offered"
          suffix="g"
          defaultValue={row?.offered_g ?? ""}
          key={`${pen.id}-${date}-offered`}
          onBlur={(e) => {
            const v = e.currentTarget.value;
            if (v !== "") void saveField({ offered_g: Number(v) }, setOfferedState);
          }}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Dish action</span>
          <StatusPill state={actionState === "idle" && row?.dish_action ? "saved" : actionState} />
        </div>
        <div className="grid grid-cols-1 gap-2">
          {DISH_ACTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setAction(o.value);
                void saveField({ dish_action: o.value }, setActionState);
              }}
              className={`rounded-xl border py-3 text-sm font-medium ${
                action === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <PenPhotoSlot
        trial_id={trial.id}
        pen_id={pen.id}
        obs_date={date}
        kind="pm"
        label="PM photo — dish and paper tag in frame"
        existingUrl={photoUrl}
        onSaved={onSaved}
      />
    </section>
  );
}
