import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { upsertRow, writeWithRetry, OBSERVATIONS_TRIAL_KEY, WELFARE_CHECKS_KEY } from "@/lib/upsertRow";
import { NoActiveTrial, useSitePens, useSiteScope, useSiteTrial } from "@/lib/siteScope";

import { useCallback, useMemo, useState } from "react";
import { Checklist } from "@/components/Checklist";
import { ChecklistBlocker } from "@/components/ChecklistBlocker";
import { SessionCompleteButton, useSessionCompleted } from "@/components/SessionCompleteButton";
import { NumberField } from "@/components/NumberField";
import { BreederBadge, PenStepper, type PenCompletion, type StepperPen } from "@/components/PenStepper";
import { PenPhotoSlot, penPhotoKey } from "@/components/PenPhotoSlot";
import { PhotoCompare } from "@/components/PhotoCompare";

import { ClosedDayNotice } from "@/components/ClosedDayNotice";
import { useUploads } from "@/lib/photoUploads.store";
import { liveCount } from "@/lib/liveCount";
import { useSiteCalendar } from "@/lib/operatingDays";

import type { Database } from "@/integrations/supabase/types";
import { BookOpen, AlertTriangle, CheckCircle2, Loader2, Save, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/am")({
  component: AmPage,
  validateSearch: (search: Record<string, unknown>): { pen?: string } =>
    typeof search['pen'] === "string" ? { pen: search['pen'] } : {},
});

type SnailActivity = Database["public"]["Enums"]["snail_activity"];
type HealthFlag = Database["public"]["Enums"]["health_flag"];
type SubstrateCondition = Database["public"]["Enums"]["substrate_condition"];
type PopulationEventType = Database["public"]["Enums"]["population_event_type"];
type WelfareRow = Database["public"]["Tables"]["welfare_checks"]["Row"];
type ObsRow = Database["public"]["Tables"]["observations"]["Row"];

const ACTIVITY: { value: SnailActivity; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "mixed", label: "Mixed" },
  { value: "mostly_sealed", label: "Mostly sealed" },
];
const HEALTH_FLAGS: { value: HealthFlag; label: string }[] = [
  { value: "shell_damage", label: "Shell damage" },
  { value: "lethargy", label: "Lethargy" },
  { value: "abnormal_mucus", label: "Abnormal mucus" },
  { value: "foul_smell", label: "Foul smell" },
  { value: "mould_in_dish", label: "Mould in dish" },
  { value: "visible_dead", label: "Visible dead" },
];
const SUBSTRATE: { value: SubstrateCondition; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "dry", label: "Dry" },
  { value: "waterlogged", label: "Waterlogged" },
  { value: "soiled", label: "Soiled" },
  { value: "mouldy", label: "Mouldy" },
];

import { AM_CONTROL_STEP_KEY, AM_PHOTO_STEP_KEY, checklistSteps } from "@/lib/sopSteps";

const EVENT_LABEL: Record<string, string> = {
  mortality: "Death",
  escape: "Escape",
  removal: "Removal",
  addition: "Addition",
};

type SaveState = "idle" | "saving" | "saved" | "failed";

function StatusPill({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />saving</span>;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="h-3 w-3" />saved</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" />failed — retry</span>;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[value.getUTCDay()]} ${value.getUTCDate()} ${months[value.getUTCMonth()]}`;
}

function longDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  return `${weekdays[value.getUTCDay()]} ${value.getUTCDate()} ${months[value.getUTCMonth()]}`;
}

const CONTROL_ID = "control";

function AmPage() {
  const qc = useQueryClient();
  const uploads = useUploads();

  const { siteName, siteId } = useSiteScope();
  const { calendar } = useSiteCalendar();

  // The picker selects the day the check actually happens (defaults to
  // today); the feeding it completes is the last operating day before it.
  const today = useMemo(() => todayStr(), []);
  const defaultCheckDate = today;
  const [manualCheckDate, setManualCheckDate] = useState<string | null>(null);
  const checkDate = manualCheckDate ?? defaultCheckDate;
  const isDefault = manualCheckDate === null;
  const setCheckDate = (value: string) => {
    // A check can't happen on a closed day — roll back to the last operating day.
    setManualCheckDate(calendar.isOperating(value) ? value : calendar.previousOperatingDay(value));
  };
  const date = useMemo(() => calendar.previousOperatingDay(checkDate), [calendar, checkDate]);

  const trial = useSiteTrial();
  const trialId = trial.data?.id;
  // The Summary pill goes green only once the Complete button was actually clicked.
  const sessionCompleted = useSessionCompleted("am", trialId, date);

  const pens = useSitePens();


  const popEvents = useQuery({
    queryKey: ["pop-events", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase
        .from("population_events")
        .select("id,pen_id,event_date,event_type,count")
        .eq("trial_id", trialId!)
        .order("created_at")).data ?? [],
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

  const obs = useQuery({
    queryKey: ["trial-obs", trialId, date],
    enabled: !!trialId,
    queryFn: async () => (await supabase.from("observations").select("*").eq("trial_id", trialId!).eq("obs_date", date)).data ?? [],
  });

  const welfare = useQuery({
    queryKey: ["welfare", trialId, date],
    enabled: !!trialId,
    queryFn: async () => (await supabase.from("welfare_checks").select("*").eq("trial_id", trialId!).eq("obs_date", date)).data ?? [],
  });

  const photos = useQuery({
    queryKey: ["trial-photos", trialId, date],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("session_photos").select("pen_id,photo_am_url,photo_pm_url").eq("trial_id", trialId!).eq("obs_date", date)).data ?? [],
  });

  // One control dish per trial, only while the water-loss test is running.
  const controlOn = !!trial.data?.control_active && !!trial.data?.control_feed_id;
  const controlFeedId = trial.data?.control_feed_id ?? null;
  const controlFeed = useQuery({
    queryKey: ["feed", controlFeedId],
    enabled: !!controlFeedId,
    queryFn: async () => (await supabase.from("feeds").select("id,name").eq("id", controlFeedId!).maybeSingle()).data,
  });
  const control = useQuery({
    queryKey: ["moisture-control", trialId, date],
    enabled: !!trialId && controlOn,
    queryFn: async () =>
      (await supabase.from("moisture_controls").select("*").eq("trial_id", trialId!).eq("feed_id", controlFeedId!).eq("obs_date", date).maybeSingle()).data,
  });

  const feedByPen = useMemo(() => {
    const treatmentById = new Map((treatments.data ?? []).map((t) => [t.id, t]));
    const map = new Map<string, string>();
    for (const a of assignments.data ?? []) {
      const t = treatmentById.get(a.treatment_id);
      if (t) map.set(a.pen_id, t.feed_id);
    }
    return map;
  }, [assignments.data, treatments.data]);

  // Breeder pens are checked in the same walk, marked apart and counted apart.
  const trialPens: StepperPen[] = useMemo(
    () =>
      (pens.data ?? [])
        .filter((p) => p.role !== "breeder" && feedByPen.has(p.id))
        .map((p) => ({ id: p.id, label: p.label, role: "trial" as const })),
    [pens.data, feedByPen],
  );

  const breederPens: StepperPen[] = useMemo(
    () =>
      (pens.data ?? [])
        .filter((p) => p.role === "breeder")
        .map((p) => ({ id: p.id, label: p.label, role: "breeder" as const })),
    [pens.data],
  );

  const stepperPens = useMemo(
    () => [
      ...trialPens,
      ...breederPens,
      ...(controlOn ? [{ id: CONTROL_ID, label: "Control dish", role: "control" as const }] : []),
    ],
    [trialPens, breederPens, controlOn],
  );
  const isBreeder = (penId: string) => breederPens.some((p) => p.id === penId);

  const anyPmForDate = (obs.data ?? []).some((o) => o.offered_g != null);

  const obsFor = (penId: string) => (obs.data ?? []).find((o) => o.pen_id === penId);
  const welfareFor = (penId: string) => (welfare.data ?? []).find((w) => w.pen_id === penId);
  const photoUrlFor = (penId: string) => (photos.data ?? []).find((r) => r.pen_id === penId)?.photo_am_url ?? null;
  const pmPhotoUrlFor = (penId: string) => (photos.data ?? []).find((r) => r.pen_id === penId)?.photo_pm_url ?? null;

  const photoSaved = (penId: string) =>
    !!photoUrlFor(penId) || uploads.get(penPhotoKey(trialId ?? "", penId, date, "am"))?.status === "saved";

  const missingFor = (penId: string) => {
    if (penId === CONTROL_ID) return control.data?.remaining_g != null ? [] : ["control leftover"];
    const w = welfareFor(penId);
    const breeder = isBreeder(penId);
    const missing: string[] = [];
    if (!photoSaved(penId)) missing.push("AM photo");
    // A breeder pen has no assigned feed, so there is no refusal to score.
    if (!breeder && obsFor(penId)?.leftover_g == null) missing.push("leftover (g)");
    if (!breeder && !w?.activity) missing.push("activity");
    if (!w?.substrate_condition) missing.push("substrate condition");
    return missing;
  };

  const stateFor = (penId: string): PenCompletion => {
    if (uploads.get(penPhotoKey(trialId ?? "", penId, date, "am"))?.status === "uploading") return "uploading";
    const missing = missingFor(penId);
    const total = penId === CONTROL_ID ? 1 : isBreeder(penId) ? 2 : 4;
    if (missing.length === 0) return "complete";
    return missing.length === total ? "empty" : "partial";
  };

  const photosDone = trialPens.filter((p) => photoSaved(p.id)).length;
  const photosNeeded = trialPens.length;
  const breederPhotosDone = breederPens.filter((p) => photoSaved(p.id)).length;
  const breederPhotosNeeded = breederPens.length;
  const allPhotos =
    photosNeeded + breederPhotosNeeded > 0 &&
    photosDone === photosNeeded &&
    breederPhotosDone === breederPhotosNeeded;

  const [checklistDone, setChecklistDone] = useState(0);
  const [checklistAll, setChecklistAll] = useState(false);
  const onChecklistProgress = useCallback((done: number, all: boolean) => {
    setChecklistDone(done);
    setChecklistAll(all);
  }, []);

  const checklistItems = checklistSteps("am", date).filter((step) => step.key !== AM_CONTROL_STEP_KEY || controlOn);
  const overrides = checklistItems.map((step) =>
    step.key === AM_PHOTO_STEP_KEY
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: photosNeeded + breederPhotosNeeded === 0
            ? "Assign pens to the trial first."
            : `${photosDone} of ${photosNeeded} trial pen photos uploaded` +
              (breederPhotosNeeded > 0
                ? ` · ${breederPhotosDone} of ${breederPhotosNeeded} breeder pen photos uploaded.`
                : ".") +
              (allPhotos ? "" : " Take them before disturbing the dish."),
        }
      : step.key === AM_CONTROL_STEP_KEY
        ? {
            forced: control.data?.remaining_g != null,
            locked: true,
            subtitle: control.data?.remaining_g != null
              ? "Control leftover saved."
              : "Enter the leftover on the Control dish step below.",
          }
        : undefined,
  );

  // One site range per session, written to every pen's welfare row for the date.
  // Historical single readings are treated as both ends of the range.
  const existingTempMin = (welfare.data ?? []).find((w) => w.temp_min_c != null || w.temp_c != null);
  const existingTempMax = (welfare.data ?? []).find((w) => w.temp_max_c != null || w.temp_c != null);
  const existingHumidityMin = (welfare.data ?? []).find((w) => w.humidity_min_pct != null || w.humidity_pct != null);
  const existingHumidityMax = (welfare.data ?? []).find((w) => w.humidity_max_pct != null || w.humidity_pct != null);
  const [sessionTempMin, setSessionTempMin] = useState<{ date: string; value: number | null } | null>(null);
  const [sessionTempMax, setSessionTempMax] = useState<{ date: string; value: number | null } | null>(null);
  const [sessionHumidityMin, setSessionHumidityMin] = useState<{ date: string; value: number | null } | null>(null);
  const [sessionHumidityMax, setSessionHumidityMax] = useState<{ date: string; value: number | null } | null>(null);
  const tempMin = sessionTempMin?.date === date ? sessionTempMin.value : existingTempMin?.temp_min_c ?? existingTempMin?.temp_c ?? null;
  const tempMax = sessionTempMax?.date === date ? sessionTempMax.value : existingTempMax?.temp_max_c ?? existingTempMax?.temp_c ?? null;
  const humidityMin = sessionHumidityMin?.date === date ? sessionHumidityMin.value : existingHumidityMin?.humidity_min_pct ?? existingHumidityMin?.humidity_pct ?? null;
  const humidityMax = sessionHumidityMax?.date === date ? sessionHumidityMax.value : existingHumidityMax?.humidity_max_pct ?? existingHumidityMax?.humidity_pct ?? null;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["trial-obs", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["welfare", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["trial-photos", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["pop-events", trialId] });
    void qc.invalidateQueries({ queryKey: ["moisture-control", trialId, date] });
  };

  /** Rewrite the session reading on every welfare row already saved for this date. */
  const applySessionValue = async (patch: {
    temp_min_c?: number | null;
    temp_max_c?: number | null;
    humidity_min_pct?: number | null;
    humidity_max_pct?: number | null;
  }) => {
    if (!trialId) return;
    await supabase.from("welfare_checks").update(patch).eq("trial_id", trialId).eq("obs_date", date);
    refresh();
  };

  const eventsForPenDate = (penId: string) =>
    (popEvents.data ?? []).filter((e) => e.pen_id === penId && e.event_date === date);

  const liveCountFor = (penId: string) =>
    liveCount(
      (pens.data ?? []).find((p) => p.id === penId),
      popEvents.data ?? [],
      date,
    );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">AM Check · ~9:00 AM</div>
          <h1 className="text-2xl font-bold">Photo first, then weigh the leftover.</h1>
        </div>
        <Link to="/guide" className="text-primary flex items-center gap-1 text-sm"><BookOpen className="h-4 w-4" />Guide</Link>
      </header>

      <div className={`rounded-lg border p-3 text-sm ${isDefault ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
        <span className="font-semibold">{displayDate(checkDate)} <span className="font-normal text-muted-foreground">(Leftover from {longDate(date)} evening feed)</span></span>
        <div className="text-xs text-muted-foreground mt-0.5">
          {isDefault
            ? `Defaults to today (${displayDate(defaultCheckDate)}), checking the last feeding day at ${siteName} (${displayDate(date)}). Pick another check date below to catch up.`
            : <>Manual date. <button type="button" className="text-primary underline" onClick={() => setManualCheckDate(null)}>reset to today</button></>}
        </div>
        {trial.data && obs.data && !anyPmForDate && (
          <div className="mt-2 text-xs text-amber-700">No PM entry found for {displayDate(date)}. Pick a different date if catching up.</div>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium">Check date (the day the check is done)</span>
        <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      {/* The check happens on checkDate, so the closure that matters is the
          one on that day. */}
      <ClosedDayNotice calendar={calendar} date={checkDate} siteName={siteName} session="AM" />



      <Checklist
        trialId={trialId}
        date={date}
        session="am"
        title="AM steps"
        items={checklistItems}
        overrides={overrides}
        onProgress={onChecklistProgress}
      />
      <ChecklistBlocker started={checklistDone > 0} allDone={checklistAll} />

      {!!siteId && !trial.isLoading && !trial.data && <NoActiveTrial siteName={siteName} />}


      {trial.data && (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="font-semibold">Conditions for this session</h2>
            <p className="text-xs text-muted-foreground">One daily range for the whole site. Applied to every pen recorded on this date, including pens already saved.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Temperature minimum" suffix="°C"
                key={`sess-temp-min-${date}`}
                defaultValue={tempMin ?? ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                  setSessionTempMin({ date, value: v });
                  void applySessionValue({ temp_min_c: v });
                }}
              />
              <NumberField
                label="Temperature maximum" suffix="°C"
                key={`sess-temp-max-${date}`}
                defaultValue={tempMax ?? ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                  setSessionTempMax({ date, value: v });
                  void applySessionValue({ temp_max_c: v });
                }}
              />
              <NumberField
                label="Humidity minimum" suffix="%"
                key={`sess-hum-min-${date}`}
                defaultValue={humidityMin ?? ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                  setSessionHumidityMin({ date, value: v });
                  void applySessionValue({ humidity_min_pct: v });
                }}
              />
              <NumberField
                label="Humidity maximum" suffix="%"
                key={`sess-hum-max-${date}`}
                defaultValue={humidityMax ?? ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                  setSessionHumidityMax({ date, value: v });
                  void applySessionValue({ humidity_max_pct: v });
                }}
              />
            </div>
            {tempMin != null && tempMax != null && tempMin > tempMax && (
              <p className="text-xs text-destructive">Temperature minimum cannot be higher than the maximum.</p>
            )}
            {humidityMin != null && humidityMax != null && humidityMin > humidityMax && (
              <p className="text-xs text-destructive">Humidity minimum cannot be higher than the maximum.</p>
            )}
          </section>

          <PenStepper
            pens={stepperPens}
            stateFor={stateFor}
            missingFor={missingFor}
            paramName="pen"
            summaryComplete={sessionCompleted}
            summaryFooter={
              <SessionCompleteButton
                label="Complete AM Check"
                session="am"
                trialId={trialId}
                date={date}
                enabled={
                  stepperPens.length > 0 &&
                  stepperPens.every((p) => stateFor(p.id) === "complete") &&
                  checklistAll
                }
              />
            }
            renderPen={(pen) =>
              pen.role === "control" ? (
                <ControlCard
                  key={`${CONTROL_ID}-${date}`}
                  trialId={trial.data!.id}
                  siteId={trial.data!.site_id}
                  feedId={controlFeedId!}
                  feedName={controlFeed.data?.name ?? "the control feed"}
                  portionG={Number(trial.data!.control_portion_g)}
                  date={date}
                  remainingG={control.data?.remaining_g != null ? Number(control.data.remaining_g) : null}
                  onSaved={refresh}
                />
              ) : pen.role === "breeder" ? (
                <BreederCard
                  key={pen.id}
                  trialId={trial.data!.id}
                  pen={pen}
                  date={date}
                  welfareRow={welfareFor(pen.id)}
                  photoUrl={photoUrlFor(pen.id)}
                  pmPhotoUrl={pmPhotoUrlFor(pen.id)}
                  fedLabel={displayDate(date)}
                  sessionTempMin={tempMin}
                  sessionTempMax={tempMax}
                  sessionHumidityMin={humidityMin}
                  sessionHumidityMax={humidityMax}
                  penEvents={eventsForPenDate(pen.id)}
                  liveCountValue={liveCountFor(pen.id)}
                  onSaved={refresh}
                />
              ) : (
              <PenCard
                key={pen.id}
                trialId={trial.data!.id}
                pen={pen}
                feedId={feedByPen.get(pen.id)!}
                date={date}
                obsRow={obsFor(pen.id)}
                welfareRow={welfareFor(pen.id)}
                photoUrl={photoUrlFor(pen.id)}
                pmPhotoUrl={pmPhotoUrlFor(pen.id)}
                fedLabel={displayDate(date)}
                sessionTempMin={tempMin}
                sessionTempMax={tempMax}
                sessionHumidityMin={humidityMin}
                sessionHumidityMax={humidityMax}
                penEvents={eventsForPenDate(pen.id)}
                liveCountValue={liveCountFor(pen.id)}
                onSaved={refresh}
              />

              )
            }
          />
        </>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <Save className="h-3 w-3" /> Every field saves on its own when you leave it. Moving between pens never saves or discards anything.
      </p>
    </div>
  );
}

function OptionRow<T extends string>({
  options, value, onPick, columns = 1,
}: { options: { value: T; label: string }[]; value: T | null; onPick: (v: T) => void; columns?: number }) {
  return (
    <div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onPick(o.value)}
          className={`rounded-xl border py-3 text-sm font-medium ${
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PenCard({
  trialId, pen, feedId, date, obsRow, welfareRow, photoUrl, pmPhotoUrl, fedLabel,
  sessionTempMin, sessionTempMax, sessionHumidityMin, sessionHumidityMax,
  penEvents, liveCountValue, onSaved,
}: {
  trialId: string;
  pen: StepperPen;
  feedId: string;
  date: string;
  obsRow: ObsRow | undefined;
  welfareRow: WelfareRow | undefined;
  photoUrl: string | null;
  pmPhotoUrl: string | null;
  fedLabel: string;

  sessionTempMin: number | null;
  sessionTempMax: number | null;
  sessionHumidityMin: number | null;
  sessionHumidityMax: number | null;
  penEvents: { id: string; event_type: PopulationEventType; count: number }[];
  liveCountValue: number;
  onSaved: () => void;
}) {
  const [leftoverState, setLeftoverState] = useState<SaveState>("idle");
  const [welfareState, setWelfareState] = useState<SaveState>("idle");
  const [notesState, setNotesState] = useState<SaveState>("idle");
  const [eventState, setEventState] = useState<SaveState>("idle");

  const [leftover, setLeftover] = useState<number | null>(obsRow?.leftover_g != null ? Number(obsRow.leftover_g) : null);
  const offered = obsRow?.offered_g != null ? Number(obsRow.offered_g) : null;
  const [activity, setActivity] = useState<SnailActivity | null>(welfareRow?.activity ?? null);
  const [flags, setFlags] = useState<HealthFlag[]>((welfareRow?.health_flags as HealthFlag[] | null) ?? []);
  const [substrate, setSubstrate] = useState<SubstrateCondition | null>(welfareRow?.substrate_condition ?? null);

  const saveLeftover = async (value: number | null) => {
    setLeftoverState("saving");
    try {
      await upsertRow(
        "observations",
        { trial_id: trialId, pen_id: pen.id, feed_id: feedId, obs_date: date, leftover_g: value },
        OBSERVATIONS_TRIAL_KEY,
      );
      setLeftoverState("saved");
      onSaved();
    } catch {
      setLeftoverState("failed");
    }
  };

  /** Each welfare field sends only its own column plus the natural key. */
  const saveWelfare = async (patch: Record<string, unknown>, setState: (s: SaveState) => void) => {
    setState("saving");
    try {
      await upsertRow(
        "welfare_checks",
        {
          trial_id: trialId,
          pen_id: pen.id,
          obs_date: date,
          temp_min_c: sessionTempMin,
          temp_max_c: sessionTempMax,
          humidity_min_pct: sessionHumidityMin,
          humidity_max_pct: sessionHumidityMax,
          ...patch,
        },
        WELFARE_CHECKS_KEY,
      );
      setState("saved");
      onSaved();
    } catch {
      setState("failed");
    }
  };

  const toggleFlag = (f: HealthFlag) => {
    const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f];
    setFlags(next);
    void saveWelfare({ health_flags: next }, setWelfareState);
  };

  const [eventType, setEventType] = useState<PopulationEventType>("mortality");
  const [eventCount, setEventCount] = useState<string>("1");

  const logEvent = async () => {
    const count = Number(eventCount);
    if (!Number.isFinite(count) || count <= 0) return;
    setEventState("saving");
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").insert({
          trial_id: trialId,
          pen_id: pen.id,
          event_date: date,
          event_type: eventType,
          count,
        } as never),
      );
      setEventState("saved");
      setEventCount("1");
      onSaved();
    } catch {
      setEventState("failed");
    }
  };

  const removeEvent = async (id: string) => {
    setEventState("saving");
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").delete().eq("id", id),
      );
      setEventState("saved");
      onSaved();
    } catch {
      setEventState("failed");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div className="text-lg font-bold">{pen.label}</div>

      <PhotoCompare
        trialId={trialId}
        penId={pen.id}
        date={date}
        fedLabel={fedLabel}
        offeredG={obsRow?.offered_g != null ? Number(obsRow.offered_g) : null}
        pmUrl={pmPhotoUrl}
        amUrl={photoUrl}
      />

      <PenPhotoSlot

        trial_id={trialId}
        pen_id={pen.id}
        obs_date={date}
        kind="am"
        label="AM photo — take it before disturbing the dish"
        existingUrl={photoUrl}
        onSaved={onSaved}
      />

      <div className="space-y-1">
        <div className="flex justify-end">
          <StatusPill state={leftoverState === "idle" && obsRow?.leftover_g != null ? "saved" : leftoverState} />
        </div>
        <NumberField
          key={`${pen.id}-${date}-leftover`}
          label="Leftover (g)"
          suffix="g"
          min={0}
          step="0.1"
          defaultValue={obsRow?.leftover_g ?? ""}
          hint="Take out everything left in the dish, weigh it on the zeroed scale, enter the grams, then throw it away and clean the dish. Enter 0 if nothing is left."
          onBlur={(e) => {
            const raw = e.currentTarget.value;
            const v = raw === "" ? null : Number(raw);
            if (v != null && (!Number.isFinite(v) || v < 0)) return;
            if (v === leftover) return;
            setLeftover(v);
            void saveLeftover(v);
          }}
        />
        {leftover != null && offered != null && leftover > offered && (
          <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            More left than was offered. Check the scale zero and the entry.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Activity</span>
          <StatusPill state={welfareState === "idle" && welfareRow?.activity ? "saved" : welfareState} />
        </div>
        <OptionRow options={ACTIVITY} value={activity} onPick={(v) => { setActivity(v); void saveWelfare({ activity: v }, setWelfareState); }} />
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">Signs of sickness</span>
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_FLAGS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => toggleFlag(f.value)}
              className={`rounded-xl border py-3 text-sm font-medium ${
                flags.includes(f.value) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">Substrate condition</span>
        <OptionRow options={SUBSTRATE} value={substrate} onPick={(v) => { setSubstrate(v); void saveWelfare({ substrate_condition: v }, setWelfareState); }} columns={2} />
      </div>

      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Log a death, escape or removal</span>
          <StatusPill state={eventState} />
        </div>
        <div className="flex gap-2">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as PopulationEventType)}
            className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="mortality">Death</option>
            <option value="escape">Escape</option>
            <option value="removal">Removal</option>
          </select>
          <input
            type="number" inputMode="numeric" min="1" step="1"
            value={eventCount}
            onChange={(e) => setEventCount(e.target.value)}
            className="num-input w-20"
          />
          <button type="button" onClick={() => void logEvent()}
            className="flex items-center gap-1 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />Add
          </button>
        </div>

        {penEvents.length > 0 && (
          <ul className="space-y-1">
            {penEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>{EVENT_LABEL[e.event_type] ?? e.event_type} · {e.count}</span>
                <button
                  type="button"
                  aria-label="Remove event"
                  onClick={() => void removeEvent(e.id)}
                  className="text-destructive p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="text-sm font-medium">Live count: {liveCountValue}</div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Notes</span>
          <StatusPill state={notesState === "idle" && welfareRow?.notes ? "saved" : notesState} />
        </div>
        <textarea
          key={`${pen.id}-${date}-notes`}
          defaultValue={welfareRow?.notes ?? ""}
          rows={2}
          onBlur={(e) => void saveWelfare({ notes: e.currentTarget.value || null }, setNotesState)}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
      </div>
    </section>
  );
}

/**
 * Breeder pen morning card. Same walk, but outside the trial: no refusal score
 * and no feed, while substrate, health, deaths and notes are all still logged.
 */
function BreederCard({
  trialId, pen, date, welfareRow, photoUrl, pmPhotoUrl, fedLabel,
  sessionTempMin, sessionTempMax, sessionHumidityMin, sessionHumidityMax,
  penEvents, liveCountValue, onSaved,
}: {
  trialId: string;
  pen: StepperPen;
  date: string;
  welfareRow: WelfareRow | undefined;
  photoUrl: string | null;
  pmPhotoUrl: string | null;
  fedLabel: string;

  sessionTempMin: number | null;
  sessionTempMax: number | null;
  sessionHumidityMin: number | null;
  sessionHumidityMax: number | null;
  penEvents: { id: string; event_type: PopulationEventType; count: number }[];
  liveCountValue: number;
  onSaved: () => void;
}) {
  const [welfareState, setWelfareState] = useState<SaveState>("idle");
  const [notesState, setNotesState] = useState<SaveState>("idle");
  const [eventState, setEventState] = useState<SaveState>("idle");

  const [flags, setFlags] = useState<HealthFlag[]>((welfareRow?.health_flags as HealthFlag[] | null) ?? []);
  const [substrate, setSubstrate] = useState<SubstrateCondition | null>(welfareRow?.substrate_condition ?? null);

  const saveWelfare = async (patch: Record<string, unknown>, setState: (s: SaveState) => void) => {
    setState("saving");
    try {
      await upsertRow(
        "welfare_checks",
        {
          trial_id: trialId,
          pen_id: pen.id,
          obs_date: date,
          temp_min_c: sessionTempMin,
          temp_max_c: sessionTempMax,
          humidity_min_pct: sessionHumidityMin,
          humidity_max_pct: sessionHumidityMax,
          ...patch,
        },
        WELFARE_CHECKS_KEY,
      );
      setState("saved");
      onSaved();
    } catch {
      setState("failed");
    }
  };

  const toggleFlag = (f: HealthFlag) => {
    const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f];
    setFlags(next);
    void saveWelfare({ health_flags: next }, setWelfareState);
  };

  const [eventType, setEventType] = useState<PopulationEventType>("mortality");
  const [eventCount, setEventCount] = useState<string>("1");

  const logEvent = async () => {
    const count = Number(eventCount);
    if (!Number.isFinite(count) || count <= 0) return;
    setEventState("saving");
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").insert({
          trial_id: trialId,
          pen_id: pen.id,
          event_date: date,
          event_type: eventType,
          count,
        } as never),
      );
      setEventState("saved");
      setEventCount("1");
      onSaved();
    } catch {
      setEventState("failed");
    }
  };

  const removeEvent = async (id: string) => {
    setEventState("saving");
    try {
      await writeWithRetry("population_events", () =>
        supabase.from("population_events").delete().eq("id", id),
      );
      setEventState("saved");
      onSaved();
    } catch {
      setEventState("failed");
    }
  };

  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-4 shadow-sm space-y-4">
      <div className="space-y-1">
        <div className="text-lg font-bold">{pen.label}</div>
        <BreederBadge />
        <div className="text-xs text-muted-foreground">
          Not part of the trial — nothing recorded here enters any growth figure.
        </div>
      </div>

      <PhotoCompare
        trialId={trialId}
        penId={pen.id}
        date={date}
        fedLabel={fedLabel}
        offeredG={null}
        pmUrl={pmPhotoUrl}
        amUrl={photoUrl}
      />

      <PenPhotoSlot

        trial_id={trialId}
        pen_id={pen.id}
        obs_date={date}
        kind="am"
        label="AM photo — take it before disturbing the dish"
        existingUrl={photoUrl}
        onSaved={onSaved}
      />

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Substrate condition</span>
          <StatusPill state={welfareState === "idle" && welfareRow?.substrate_condition ? "saved" : welfareState} />
        </div>
        <OptionRow
          options={SUBSTRATE}
          value={substrate}
          onPick={(v) => { setSubstrate(v); void saveWelfare({ substrate_condition: v }, setWelfareState); }}
          columns={2}
        />
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">Signs of sickness</span>
        <div className="grid grid-cols-2 gap-2">
          {HEALTH_FLAGS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => toggleFlag(f.value)}
              className={`rounded-xl border py-3 text-sm font-medium ${
                flags.includes(f.value) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Log a death, escape or removal</span>
          <StatusPill state={eventState} />
        </div>
        <div className="flex gap-2">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as PopulationEventType)}
            className="flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            <option value="mortality">Death</option>
            <option value="escape">Escape</option>
            <option value="removal">Removal</option>
            <option value="addition">Addition</option>
          </select>
          <input
            type="number" inputMode="numeric" min="1" step="1"
            value={eventCount}
            onChange={(e) => setEventCount(e.target.value)}
            className="num-input w-20"
          />
          <button type="button" onClick={() => void logEvent()}
            className="flex items-center gap-1 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" />Add
          </button>
        </div>

        {penEvents.length > 0 && (
          <ul className="space-y-1">
            {penEvents.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span>{EVENT_LABEL[e.event_type] ?? e.event_type} · {e.count}</span>
                <button
                  type="button"
                  aria-label="Remove event"
                  onClick={() => void removeEvent(e.id)}
                  className="text-destructive p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="text-sm font-medium">Live count: {liveCountValue}</div>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Notes</span>
          <StatusPill state={notesState === "idle" && welfareRow?.notes ? "saved" : notesState} />
        </div>
        <textarea
          key={`${pen.id}-${date}-breeder-notes`}
          defaultValue={welfareRow?.notes ?? ""}
          rows={2}
          onBlur={(e) => void saveWelfare({ notes: e.currentTarget.value || null }, setNotesState)}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
      </div>
    </section>
  );
}

/** The one control dish: the team only weighs what is left of last evening's portion. */
function ControlCard({
  trialId, siteId, feedId, feedName, portionG, date, remainingG, onSaved,
}: {
  trialId: string;
  siteId: string;
  feedId: string;
  feedName: string;
  portionG: number;
  date: string;
  remainingG: number | null;
  onSaved: () => void;
}) {
  const [state, setState] = useState<SaveState>("idle");
  const save = async (value: number | null) => {
    setState("saving");
    try {
      // offered_g is copied from the current setting at save time, so a later
      // change to the portion never rewrites history.
      await upsertRow(
        "moisture_controls",
        { site_id: siteId, trial_id: trialId, feed_id: feedId, obs_date: date, offered_g: portionG, remaining_g: value },
        "trial_id,feed_id,obs_date",
      );
      setState("saved");
      onSaved();
    } catch {
      setState("failed");
    }
  };
  return (
    <section className="rounded-2xl border border-dashed border-primary/60 bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-lg font-bold">Control dish</div>
        <StatusPill state={state === "idle" && remainingG != null ? "saved" : state} />
      </div>
      <p className="text-sm text-muted-foreground">This dish got {portionG} g of {feedName} last evening.</p>
      <NumberField
        key={`control-${date}`}
        label="Control leftover (g)"
        suffix="g"
        min={0}
        step="0.1"
        defaultValue={remainingG ?? ""}
        hint="Weigh everything left in the control dish on the zeroed scale, enter the grams, then throw it away."
        onBlur={(e) => {
          const raw = e.currentTarget.value;
          const v = raw === "" ? null : Number(raw);
          if (v != null && (!Number.isFinite(v) || v < 0)) return;
          if (v === remainingG) return;
          void save(v);
        }}
      />
    </section>
  );
}
