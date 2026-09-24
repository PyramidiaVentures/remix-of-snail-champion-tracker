import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { upsertRow, BIOMASS_EVENTS_KEY } from "@/lib/upsertRow";
import { NoActiveTrial, useSitePens, useSiteScope, useSiteTrial } from "@/lib/siteScope";
import { useSiteCalendar } from "@/lib/operatingDays";
import { dueOnDate, nextWeighing, penListLabel, type PenSchedule, type SchedulePen } from "@/lib/weighSchedule";

import { uploadWeighPhoto } from "@/lib/photoUpload";
import { useSignedPhotoUrl } from "@/lib/useSignedPhotoUrl";
import { runUpload, useUploads } from "@/lib/photoUploads.store";
import { today } from "@/lib/date";
import { specificGrowthRate } from "@/lib/metrics";

import { liveCount, hasAddition } from "@/lib/liveCount";
import { Checklist } from "@/components/Checklist";
import { WEIGH_PHOTO_STEP_KEY, WEIGH_STEPS } from "@/lib/sopSteps";
import { NumberField } from "@/components/NumberField";
import { PenStepper, type PenCompletion, type StepperPen } from "@/components/PenStepper";
import type { Database } from "@/integrations/supabase/types";
import {
  BookOpen, Save, CheckCircle2, Loader2, AlertTriangle, Upload, RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/weigh")({
  component: WeighPage,
  // The pen stepper remembers the current pen here, so other screens can link
  // straight to one pen.
  validateSearch: (search: Record<string, unknown>): { pen?: string } =>
    typeof search['pen'] === "string" ? { pen: search['pen'] } : {},
});

type BiomassRow = Database["public"]["Tables"]["biomass_events"]["Row"];
type BiomassMethod = Database["public"]["Enums"]["biomass_method"];

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

  const { siteName, siteId } = useSiteScope();
  const { calendar } = useSiteCalendar();
  const trial = useSiteTrial();
  const trialId = trial.data?.id;

  const pens = useSitePens();


  const assignments = useQuery({
    queryKey: ["pen-assignments", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id,treatment_id,start_date").eq("trial_id", trialId!).is("end_date", null)).data ?? [],
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
    () =>
      (pens.data ?? [])
        .filter((p) => p.role !== "breeder" && assignedPenIds.has(p.id))
        .map((p) => ({ id: p.id, label: p.label, role: "trial" as const })),
    [pens.data, assignedPenIds],
  );

  // Breeder pens may be weighed, but never have to be: they are listed so the
  // option exists, and they are never counted as a missing weighing.
  const breederPens: StepperPen[] = useMemo(
    () =>
      (pens.data ?? [])
        .filter((p) => p.role === "breeder")
        .map((p) => ({ id: p.id, label: p.label, role: "breeder" as const })),
    [pens.data],
  );

  const isBreeder = (penId: string) => breederPens.some((p) => p.id === penId);

  // Per-pen weighing schedule. Scheduling only — no growth figure uses it.
  const startDateByPen = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments.data ?? []) if (!m.has(a.pen_id)) m.set(a.pen_id, a.start_date);
    return m;
  }, [assignments.data]);

  const scheduleArgs = useMemo(
    () => ({
      pens: ((pens.data ?? []) as SchedulePen[]).filter((p) => p.role === "breeder" || assignedPenIds.has(p.id)),
      trialInterval: trial.data?.weighing_interval_days,
      startDateByPen,
      events: events.data ?? [],
      isOperating: calendar.isOperating,
      nextOperatingDay: calendar.nextOperatingDay,
    }),
    [pens.data, assignedPenIds, trial.data?.weighing_interval_days, startDateByPen, events.data, calendar],
  );
  // One rule everywhere: due on the selected date = next weighing on or before it.
  const dueInfo = useMemo(() => dueOnDate(scheduleArgs, date), [scheduleArgs, date]);
  const next = useMemo(() => nextWeighing(scheduleArgs, date), [scheduleArgs, date]);
  const scheduleFor = (penId: string) => dueInfo.rows.find((r) => r.penId === penId) ?? null;
  const dueIds = useMemo(() => new Set(dueInfo.due.map((r) => r.penId)), [dueInfo]);

  // Pens weighed "anyway": picked from the list, or already weighed on this date.
  const [extraIds, setExtraIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const allPens = useMemo(() => [...trialPens, ...breederPens], [trialPens, breederPens]);
  const shownIds = useMemo(
    () => new Set([...dueIds, ...extraIds, ...dueInfo.weighedIds]),
    [dueIds, extraIds, dueInfo.weighedIds],
  );

  const stepperPens = useMemo(
    () =>
      allPens.filter((p) => shownIds.has(p.id)).map((p) => {
        const s = dueInfo.rows.find((r) => r.penId === p.id);
        return {
          ...p,
          dueState: !dueIds.has(p.id) ? undefined : s?.overdueDays ? ("overdue" as const) : ("due" as const),
        };
      }),
    [allPens, shownIds, dueInfo.rows, dueIds],
  );
  const otherPens = allPens.filter((p) => !shownIds.has(p.id));

  const session = useQuery({
    queryKey: ["weighing-session", trialId, date],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("weighing_sessions").select("*").eq("trial_id", trialId!).eq("session_date", date).maybeSingle()).data,
  });
  const closed = !!session.data?.closed_at;
  const navigate = useNavigate();

  const rowFor = (penId: string) => (events.data ?? []).find((e) => e.pen_id === penId && e.event_date === date);
  const previousFor = (penId: string) =>
    (events.data ?? [])
      .filter((e) => e.pen_id === penId && e.event_date < date)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
      .at(-1) ?? null;

  /** Ledger count: derived live count for the pen on the selected date. */
  const ledgerFor = (penId: string) => {
    const pen = (pens.data ?? []).find((p) => p.id === penId);
    const events = popEvents.data ?? [];
    return {
      count: liveCount(pen, events, date),
      hadAddition: hasAddition(penId, events, date),
    };
  };

  const uploadedUrl = (penId: string) => uploads.get(weighPhotoKey(trialId ?? "", penId, date))?.url ?? null;
  const photoDone = (penId: string) => !!(rowFor(penId)?.photo_url ?? uploadedUrl(penId));

  const missingFor = (penId: string) => {
    const row = rowFor(penId);
    // Weighing a breeder pen is optional, so an empty one is never "missing".
    if ((isBreeder(penId) || !dueIds.has(penId)) && !row) return [];
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

  const photosDone = dueInfo.due.filter((p) => photoDone(p.penId)).length;
  const photosNeeded = dueInfo.due.length;
  const allPhotos = photosNeeded > 0 && photosDone === photosNeeded;

  const overrides = WEIGH_STEPS.map((step) =>
    step.key === WEIGH_PHOTO_STEP_KEY
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: photosNeeded === 0
            ? "No pens are due on this date."
            : allPhotos
              ? `All ${photosNeeded} scale photos uploaded.`
              : `${photosNeeded - photosDone} of ${photosNeeded} scale photos still needed.`,
        }
      : undefined,
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["biomass-events", trialId] });
    void qc.invalidateQueries({ queryKey: ["population-events", trialId] });
  };

  const dueN = dueInfo.due.length;
  const weighedN = dueInfo.weighed.length;
  const complete = dueN > 0 && weighedN === dueN;
  const dayWord = date === today() ? "today" : `on ${date}`;
  const nextLine = next ? `Next weighing: ${next.date}, ${penListLabel(next.labels)}` : "No further weighing scheduled";

  // Counts that disagree with the population log, for pens weighed on this date.
  const mismatches = allPens.flatMap((p) => {
    const row = rowFor(p.id);
    if (!row || row.live_count == null) return [];
    const ledger = ledgerFor(p.id).count;
    return row.live_count === ledger ? [] : [{ pen: p, weighed: row.live_count, ledger }];
  });

  const [closing, setClosing] = useState(false);
  const closeWeighing = async () => {
    if (!trial.data || !siteId) return;
    if (!complete && !window.confirm(`Close weighing with ${weighedN} of ${dueN} pens? The unweighed pens stay due.`)) return;
    setClosing(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("weighing_sessions").upsert(
      {
        site_id: siteId, trial_id: trial.data.id, session_date: date,
        pens_due: dueN, pens_weighed: weighedN,
        closed_at: new Date().toISOString(), closed_by: u.user?.email ?? null,
      },
      { onConflict: "trial_id,session_date" },
    );
    setClosing(false);
    if (error) { window.alert(`Could not close the weighing: ${error.message}`); return; }
    void qc.invalidateQueries({ queryKey: ["weighing-session"] });
    void navigate({ to: "/results", search: { pen: "", from: "", to: "", hide: "", hs: "", weighing: date } });
  };
  const reopen = async () => {
    if (!session.data) return;
    await supabase.from("weighing_sessions").update({ closed_at: null, closed_by: null }).eq("id", session.data.id);
    void qc.invalidateQueries({ queryKey: ["weighing-session"] });
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

      {trial.data && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <span className="font-semibold">
            {dueN === 0
              ? `No pens due ${dayWord}. ${nextLine}.`
              : `${dueN} pen${dueN === 1 ? "" : "s"} due ${dayWord}: ${penListLabel(dueInfo.due.map((r) => r.label))}`}
          </span>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Only due pens are listed. Weighing another pen off-schedule is always welcome — its schedule then counts from that date.
          </div>
        </div>
      )}

      <Checklist trialId={trialId} date={date} session="weigh" title="Weighing steps" items={WEIGH_STEPS} overrides={overrides} />

      {!!siteId && !trial.isLoading && !trial.data && <NoActiveTrial siteName={siteName} />}


      {trial.data && stepperPens.length > 0 && (
        <PenStepper
          pens={stepperPens}
          stateFor={stateFor}
          missingFor={missingFor}
          paramName="pen"
          renderPen={(pen) => (
            <PenCard
              key={`${pen.id}-${date}`}
              trialId={trial.data!.id}
              pen={pen}
              date={date}
              row={rowFor(pen.id)}
              previous={previousFor(pen.id)}
              ledger={ledgerFor(pen.id)}
              schedule={scheduleFor(pen.id)}
              onSaved={refresh}
            />
          )}
        />
      )}

      {trial.data && (
        <div className="space-y-2">
          {!pickerOpen ? (
            <button type="button" onClick={() => setPickerOpen(true)} className="text-sm text-primary underline">
              Weigh another pen anyway
            </button>
          ) : (
            <select
              autoFocus
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                setExtraIds((prev) => new Set(prev).add(id));
                setPickerOpen(false);
                void navigate({ to: "/weigh", search: { pen: id } });
              }}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="">Choose a pen…</option>
              {otherPens.map((p) => <option key={p.id} value={p.id}>{p.label}{p.role === "breeder" ? " (breeder)" : ""}</option>)}
            </select>
          )}
        </div>
      )}

      {trial.data && dueN > 0 && (
        <section className={`rounded-2xl border p-4 space-y-3 ${closed ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
          <div className="font-semibold">
            {weighedN} of {dueN} due pens weighed. {nextLine}.
          </div>
          {mismatches.length > 0 && (
            <ul className="space-y-2">
              {mismatches.map((m) => (
                <li key={m.pen.id} className="flex items-center justify-between gap-2 rounded-lg bg-earth/10 px-3 py-2 text-sm">
                  <span>{m.pen.label}: weighed {m.weighed} snails, death log says {m.ledger}</span>
                  <Link
                    to="/population"
                    search={{
                      logPen: m.pen.id, logDate: date,
                      logType: m.weighed < m.ledger ? "mortality" : "addition",
                      logCount: String(Math.abs(m.ledger - m.weighed)),
                      logNote: `found at weighing ${date}`,
                    }}
                    className="shrink-0 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium"
                  >
                    Log the difference
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {closed ? (
            <div className="space-y-2">
              <div className="text-sm text-primary">Weighing closed.</div>
              <div className="flex gap-2">
                <Link to="/results" search={(prev) => ({ ...prev, weighing: date }) as never}
                  className="flex-1 rounded-lg bg-primary px-3 py-3 text-center text-sm font-semibold text-primary-foreground">
                  Show results
                </Link>
                <button type="button" onClick={() => void reopen()} className="rounded-lg border border-border px-3 py-3 text-sm">
                  Reopen weighing
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={closing}
              onClick={() => void closeWeighing()}
              className="w-full rounded-lg bg-primary px-3 py-4 text-base font-semibold text-primary-foreground disabled:opacity-60"
            >
              {complete ? "Close weighing and show results" : `Close weighing with ${weighedN} of ${dueN} pens`}
            </button>
          )}
        </section>
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
  trialId, pen, date, row, previous, ledger, schedule, onSaved,
}: {
  trialId: string;
  pen: StepperPen;
  date: string;
  row: BiomassRow | undefined;
  previous: BiomassRow | null;
  ledger: { count: number; hadAddition: boolean };
  schedule: PenSchedule | null;
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
  const photoViewUrl = useSignedPhotoUrl(photoUrl);

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const liveN = num(liveCount);
  const net = num(biomass);
  const mean = net != null && liveN ? net / liveN : null;

  const prevMean =
    previous && previous.live_count ? previous.net_biomass_g / previous.live_count : null;
  const meanDeltaG = mean != null && prevMean != null ? mean - prevMean : null;
  const meanDeltaPct = meanDeltaG != null && prevMean ? (meanDeltaG / prevMean) * 100 : null;
  const sgr = previous
    ? specificGrowthRate(prevMean, mean, Math.max(1, daysBetween(previous.event_date, date)))
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

      {schedule && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            schedule.overdueDays > 0
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : schedule.dueToday
                ? "border-primary/40 bg-primary/5 text-primary"
                : "border-border text-muted-foreground"
          }`}
        >
          {schedule.overdueDays > 0
            ? `Overdue by ${schedule.overdueDays} day${schedule.overdueDays === 1 ? "" : "s"}`
            : schedule.dueToday
              ? "Due today"
              : schedule.nextDue
                ? `Next due ${schedule.nextDue}`
                : "No weighing schedule set"}
          {schedule.isBaseline && schedule.nextDue ? " · baseline weighing" : ""}
        </div>
      )}

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
        label="Snail weight (g)" suffix="g"
        hint="Zero the scale with the empty container on it, then weigh the snails."
        key={`${pen.id}-${date}-net`}
        defaultValue={biomass}
        onChange={(e) => setBiomass(e.currentTarget.value)}
        onBlur={() => void save()}
      />

      {blocked && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          Biomass must be greater than zero. Check that the scale was zeroed with the empty container on it.
        </div>
      )}

      <div className="rounded-lg border border-border p-3 text-sm space-y-1">
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
          {photoViewUrl && (
            <button type="button" onClick={() => window.open(photoViewUrl, "_blank")} className="shrink-0">
              <img src={photoViewUrl} alt="Scale display" loading="lazy" decoding="async"
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
