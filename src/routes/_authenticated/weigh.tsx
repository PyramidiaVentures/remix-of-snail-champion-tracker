import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { upsertRow, BIOMASS_EVENTS_KEY } from "@/lib/upsertRow";
import { uploadWeighPhoto } from "@/lib/photoUpload";
import { runUpload, useUploads } from "@/lib/photoUploads.store";
import { today } from "@/lib/date";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { PenStepper, type PenCompletion, type StepperPen } from "@/components/PenStepper";
import type { Database } from "@/integrations/supabase/types";
import {
  BookOpen, Save, CheckCircle2, Loader2, AlertTriangle, Upload, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/weigh")({
  component: WeighPage,
});

type BiomassRow = Database["public"]["Tables"]["biomass_events"]["Row"];
type BiomassMethod = Database["public"]["Enums"]["biomass_method"];

const WEIGH_STEPS = [
  "Place the empty container on the scale and zero it, so the scale reads only the snails.",
  "Count every live snail in the pen and enter the count.",
  "Weigh all the snails together and enter the weight the scale shows.",
  "Photograph the scale display with the pen tag in frame.",
  "Return the snails to the pen and confirm the count matches.",
  "Log any snail found dead during handling as a mortality event.",
];
const WEIGH_PHOTO_STEP_INDEX = 3;

type SaveState = "idle" | "saving" | "saved" | "failed";

function StatusPill({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />saving</span>;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="h-3 w-3" />saved</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" />failed — retry</span>;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime();
  return Math.round(ms / 86400000);
}

function weighPhotoKey(trialId: string, penId: string, date: string) {
  return `${trialId}|${penId}|${date}|weigh`;
}

function WeighPage() {
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
    queryFn: async () => (await supabase.from("pens").select("id,label,snail_count").order("label")).data ?? [],
  });

  const assignments = useQuery({
    queryKey: ["pen-assignments", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id,treatment_id").eq("trial_id", trialId!).is("end_date", null)).data ?? [],
  });

  const events = useQuery({
    queryKey: ["biomass-events", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("biomass_events").select("*").eq("trial_id", trialId!).order("event_date")).data ?? [],
  });

  const popEvents = useQuery({
    queryKey: ["population-events", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("population_events").select("pen_id,event_date,event_type,count").eq("trial_id", trialId!)).data ?? [],
  });

  const assignedPenIds = useMemo(
    () => new Set((assignments.data ?? []).map((a) => a.pen_id)),
    [assignments.data],
  );

  const trialPens: StepperPen[] = useMemo(
    () => (pens.data ?? []).filter((p) => assignedPenIds.has(p.id)).map((p) => ({ id: p.id, label: p.label })),
    [pens.data, assignedPenIds],
  );

  const rowFor = (penId: string) => (events.data ?? []).find((e) => e.pen_id === penId && e.event_date === date);
  const previousFor = (penId: string) =>
    (events.data ?? [])
      .filter((e) => e.pen_id === penId && e.event_date < date)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .at(-1) ?? null;

  /** Ledger count: stocked snails, adjusted by population events up to the date. */
  const ledgerFor = (penId: string) => {
    const base = (pens.data ?? []).find((p) => p.id === penId)?.snail_count ?? 0;
    let count = base;
    let hadAddition = false;
    for (const e of popEvents.data ?? []) {
      if (e.pen_id !== penId || e.event_date > date) continue;
      if (e.event_type === "addition") { count += e.count; hadAddition = true; }
      else count -= e.count;
    }
    return { count, hadAddition };
  };

  const uploadedUrl = (penId: string) => uploads.get(weighPhotoKey(trialId ?? "", penId, date))?.url ?? null;
  const photoDone = (penId: string) => !!(rowFor(penId)?.photo_url ?? uploadedUrl(penId));

  const missingFor = (penId: string) => {
    const row = rowFor(penId);
    const missing: string[] = [];
    if (row?.live_count == null) missing.push("live count");
    if (row?.net_biomass_g == null) missing.push("snail weight");
    if (!photoDone(penId)) missing.push("scale photo");
    return missing;
  };

  const stateFor = (penId: string): PenCompletion => {
    if (uploads.get(weighPhotoKey(trialId ?? "", penId, date))?.status === "uploading") return "uploading";
    const missing = missingFor(penId);
    if (missing.length === 0) return "complete";
    return missing.length === 3 ? "empty" : "partial";
  };

  const photosDone = trialPens.filter((p) => photoDone(p.id)).length;
  const photosNeeded = trialPens.length;
  const allPhotos = photosNeeded > 0 && photosDone === photosNeeded;

  const overrides = WEIGH_STEPS.map((_, i) =>
    i === WEIGH_PHOTO_STEP_INDEX
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: photosNeeded === 0
            ? "Assign pens to the trial first."
            : allPhotos
              ? `All ${photosNeeded} scale photos uploaded.`
              : `${photosNeeded - photosDone} of ${photosNeeded} scale photos still needed.`,
        }
      : undefined,
  );

  // Schedule advisory only — weighing off-schedule is fully supported.
  const schedule = useMemo(() => {
    if (!trial.data) return null;
    const interval = trial.data.weighing_interval_days || 7;
    const elapsed = daysBetween(trial.data.start_date, date);
    if (elapsed >= 0 && elapsed % interval === 0) return { scheduled: true, text: "Scheduled weighing day" };
    const last = (events.data ?? []).filter((e) => e.event_date < date).map((e) => e.event_date).sort().at(-1);
    return {
      scheduled: false,
      text: last
        ? `Off-schedule weighing (last was ${daysBetween(last, date)} days ago)`
        : "Off-schedule weighing (no previous weighing yet)",
    };
  }, [trial.data, date, events.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["biomass-events", trialId] });
    void qc.invalidateQueries({ queryKey: ["population-events", trialId] });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Weigh Day</div>
          <h1 className="text-2xl font-bold">One pen at a time.</h1>
        </div>
        <Link to="/guide" className="text-primary flex items-center gap-1 text-sm"><BookOpen className="h-4 w-4" />Guide</Link>
      </header>

      <label className="block">
        <span className="text-sm font-medium">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      {schedule && (
        <div className={`rounded-lg border p-3 text-sm ${schedule.scheduled ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
          <span className="font-semibold">{schedule.text}</span>
          {!schedule.scheduled && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Pens may be weighed on a staggered rota — record whichever pens you weighed today.
            </div>
          )}
        </div>
      )}

      <Checklist storageKey={`weigh-checklist-${date}`} title="Weighing steps" items={WEIGH_STEPS} overrides={overrides} />

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
              trialId={trial.data!.id}
              pen={pen}
              date={date}
              row={rowFor(pen.id)}
              previous={previousFor(pen.id)}
              ledger={ledgerFor(pen.id)}
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

const METHODS: { value: BiomassMethod; label: string }[] = [
  { value: "whole_pen", label: "Whole pen" },
  { value: "subsample", label: "Subsample" },
];

function fmt(n: number, digits = 1) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function PenCard({
  trialId, pen, date, row, previous, ledger, onSaved,
}: {
  trialId: string;
  pen: StepperPen;
  date: string;
  row: BiomassRow | undefined;
  previous: BiomassRow | null;
  ledger: { count: number; hadAddition: boolean };
  onSaved: () => void;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const [blocked, setBlocked] = useState(false);

  const [liveCount, setLiveCount] = useState<string>(row?.live_count != null ? String(row.live_count) : "");
  const [method, setMethod] = useState<BiomassMethod>(row?.method ?? "whole_pen");
  const [subsample, setSubsample] = useState<string>(row?.subsample_count != null ? String(row.subsample_count) : "");
  const [biomass, setBiomass] = useState<string>(row?.net_biomass_g != null ? String(row.net_biomass_g) : "");

  const uploads = useUploads();
  const key = weighPhotoKey(trialId, pen.id, date);
  const entry = uploads.get(key);
  const photoUrl = entry?.url ?? row?.photo_url ?? null;

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const liveN = num(liveCount);
  const net = num(biomass);
  const mean = net != null && liveN ? net / liveN : null;

  const prevMean =
    previous && previous.live_count ? previous.net_biomass_g / previous.live_count : null;
  const meanDeltaG = mean != null && prevMean != null ? mean - prevMean : null;
  const meanDeltaPct = meanDeltaG != null && prevMean ? (meanDeltaG / prevMean) * 100 : null;
  const sgr =
    mean != null && prevMean != null && mean > 0 && prevMean > 0 && previous
      ? ((Math.log(mean) - Math.log(prevMean)) / Math.max(1, daysBetween(previous.event_date, date))) * 100
      : null;

  const save = async (
    override?: Partial<{ live_count: number | null; method: BiomassMethod; subsample_count: number | null; net_biomass_g: number | null; photo_url: string }>,
  ) => {
    const live = override?.live_count !== undefined ? override.live_count : liveN;
    const n = override?.net_biomass_g !== undefined ? override.net_biomass_g : net;
    const m = override?.method ?? method;
    const sub = override?.subsample_count !== undefined ? override.subsample_count : num(subsample);
    const url = override?.photo_url ?? photoUrl ?? null;

    if (live == null || n == null) return; // not enough yet to create the record
    if (n <= 0) { setBlocked(true); setState("idle"); return; }
    setBlocked(false);
    setState("saving");
    try {
      await upsertRow(
        "biomass_events",
        {
          trial_id: trialId,
          pen_id: pen.id,
          event_date: date,
          live_count: live,
          method: m,
          subsample_count: m === "subsample" ? sub : null,
          net_biomass_g: n,
          ...(url ? { photo_url: url } : {}),
        },
        BIOMASS_EVENTS_KEY,
      );
      setState("saved");
      onSaved();
    } catch {
      setState("failed");
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const startUpload = (file: File) =>
    runUpload(key, () => uploadWeighPhoto({ trial_id: trialId, pen_id: pen.id, event_date: date, file }), (url) => {
      void save({ photo_url: url });
    });

  const ledgerWarn =
    liveN == null
      ? null
      : liveN > ledger.count && !ledger.hadAddition
        ? `Live count is higher than the ledger count of ${ledger.count} with no addition logged.`
        : liveN < ledger.count
          ? `Live count is lower than the ledger count of ${ledger.count}. Log any deaths or escapes.`
          : null;

  const bigChange = meanDeltaPct != null && Math.abs(meanDeltaPct) > 25;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="text-lg font-bold">{pen.label}</div>
        <StatusPill state={state === "idle" && row ? "saved" : state} />
      </div>

      <NumberField
        label="Live count"
        key={`${pen.id}-${date}-live`}
        defaultValue={liveCount}
        onChange={(e) => setLiveCount(e.currentTarget.value)}
        onBlur={() => void save()}
      />

      <div className="space-y-1">
        <span className="text-sm font-medium">Method</span>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { setMethod(o.value); void save({ method: o.value }); }}
              className={`rounded-xl border py-3 text-sm font-medium ${
                method === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {method === "subsample" && (
          <NumberField
            label="Subsample count"
            key={`${pen.id}-${date}-sub`}
            defaultValue={subsample}
            onChange={(e) => setSubsample(e.currentTarget.value)}
            onBlur={() => void save()}
          />
        )}
      </div>

      <NumberField
        label="Tare" suffix="g"
        key={`${pen.id}-${date}-tare`}
        defaultValue={tare}
        onChange={(e) => setTare(e.currentTarget.value)}
        onBlur={() => void save()}
      />

      <NumberField
        label="Gross weight" suffix="g"
        key={`${pen.id}-${date}-gross`}
        defaultValue={gross}
        onChange={(e) => setGross(e.currentTarget.value)}
        onBlur={() => void save()}
      />

      {blocked && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          Gross weight is not greater than tare. Check the entry.
        </div>
      )}

      <div className="rounded-lg border border-border p-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Net biomass</span>
          <span className="font-semibold">{net != null ? `${fmt(net)} g` : "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Mean weight per snail</span>
          <span className="font-semibold">{mean != null ? `${fmt(mean, 2)} g` : "—"}</span>
        </div>
        {previous ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Change since last weighing</span>
              <span className="font-semibold">
                {meanDeltaG != null
                  ? `${meanDeltaG >= 0 ? "+" : ""}${fmt(meanDeltaG, 2)} g (${meanDeltaPct != null ? `${meanDeltaPct >= 0 ? "+" : ""}${fmt(meanDeltaPct)}%` : "—"})`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">SGR</span>
              <span className="font-semibold">{sgr != null ? `${fmt(sgr, 2)} %/day` : "—"}</span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">Baseline measurement</div>
        )}
      </div>

      {bigChange && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-700">
          Mean weight changed by more than 25% since the previous weighing. Advisory only — save if it is correct.
        </div>
      )}
      {ledgerWarn && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-xs text-amber-700">
          {ledgerWarn} Advisory only.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-medium">Scale display with pen tag in frame</div>
          {entry?.status === "uploading" && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />uploading</span>}
          {photoUrl && entry?.status !== "uploading" && <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="h-3 w-3" />saved</span>}
          {entry?.status === "failed" && <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" />failed</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) startUpload(file);
              e.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              photoUrl ? "border-primary/50 bg-primary/5 text-primary" : "border-border bg-card"
            }`}
          >
            {entry?.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" />
              : photoUrl ? <RefreshCw className="h-4 w-4" />
              : <Upload className="h-4 w-4" />}
            <span>{photoUrl ? "Replace photo" : entry?.status === "uploading" ? "Uploading…" : "Upload photo"}</span>
          </button>
          {photoUrl && (
            <button type="button" onClick={() => window.open(photoUrl, "_blank")} className="shrink-0">
              <img src={photoUrl} alt="Scale display" loading="lazy" decoding="async"
                className="h-14 w-14 rounded-md border border-border object-cover" />
            </button>
          )}
        </div>
        {!row && photoUrl && (
          <div className="text-[10px] text-muted-foreground">
            Photo uploaded. It is attached to the record as soon as the count, tare and gross weight are entered.
          </div>
        )}
      </div>
    </section>
  );
}
