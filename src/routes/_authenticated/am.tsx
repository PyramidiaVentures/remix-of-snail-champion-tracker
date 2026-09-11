import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { upsertRow, writeWithRetry, OBSERVATIONS_TRIAL_KEY, WELFARE_CHECKS_KEY } from "@/lib/upsertRow";
import { NoActiveTrial, useSitePens, useSiteScope, useSiteTrial } from "@/lib/siteScope";

import { useCallback, useMemo, useState } from "react";
import { Checklist } from "@/components/Checklist";
import { ChecklistBlocker } from "@/components/ChecklistBlocker";
import { NumberField } from "@/components/NumberField";
import { PenStepper, type PenCompletion, type StepperPen } from "@/components/PenStepper";
import { PenPhotoSlot, penPhotoKey } from "@/components/PenPhotoSlot";
import { useUploads } from "@/lib/photoUploads.store";
import { liveCount } from "@/lib/liveCount";
import type { Database } from "@/integrations/supabase/types";
import { BookOpen, AlertTriangle, CheckCircle2, Loader2, Save, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/am")({
  component: AmPage,
});

type RefusalScore = Database["public"]["Enums"]["refusal_score"];
type SnailActivity = Database["public"]["Enums"]["snail_activity"];
type HealthFlag = Database["public"]["Enums"]["health_flag"];
type SubstrateCondition = Database["public"]["Enums"]["substrate_condition"];
type PopulationEventType = Database["public"]["Enums"]["population_event_type"];
type WelfareRow = Database["public"]["Tables"]["welfare_checks"]["Row"];
type ObsRow = Database["public"]["Tables"]["observations"]["Row"];

const REFUSAL: { value: RefusalScore; label: string }[] = [
  { value: "none_left", label: "None left" },
  { value: "trace", label: "Trace" },
  { value: "about_25", label: "About 25%" },
  { value: "about_50", label: "About 50%" },
  { value: "most_left", label: "Most left" },
];
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
];

const AM_STEPS = [
  "Upload the AM photos (one per pen) — dish untouched, tag in frame.",
  "Record the refusal score for each pen by eye. Do not weigh.",
  "Record snail activity and any signs of sickness.",
  "Record temperature and humidity.",
  "Log any deaths, escapes or removals.",
  "Empty and clean any dish whose remaining feed fails the discard criteria.",
];
const AM_PHOTO_STEP_INDEX = 0;

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

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AmPage() {
  const qc = useQueryClient();
  const defaultDate = useMemo(() => yesterday(), []);
  const [date, setDate] = useState<string>(defaultDate);
  const isDefault = date === defaultDate;
  const uploads = useUploads();

  const { siteName, siteId } = useSiteScope();
  const trial = useSiteTrial();
  const trialId = trial.data?.id;

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
      (await supabase.from("session_photos").select("pen_id,photo_am_url").eq("trial_id", trialId!).eq("obs_date", date)).data ?? [],
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

  const trialPens: StepperPen[] = useMemo(
    () => (pens.data ?? []).filter((p) => feedByPen.has(p.id)).map((p) => ({ id: p.id, label: p.label })),
    [pens.data, feedByPen],
  );

  const anyPmForDate = (obs.data ?? []).some((o) => o.offered_g != null);

  const obsFor = (penId: string) => (obs.data ?? []).find((o) => o.pen_id === penId);
  const welfareFor = (penId: string) => (welfare.data ?? []).find((w) => w.pen_id === penId);
  const photoUrlFor = (penId: string) => (photos.data ?? []).find((r) => r.pen_id === penId)?.photo_am_url ?? null;
  const photoSaved = (penId: string) =>
    !!photoUrlFor(penId) || uploads.get(penPhotoKey(trialId ?? "", penId, date, "am"))?.status === "saved";

  const missingFor = (penId: string) => {
    const w = welfareFor(penId);
    const missing: string[] = [];
    if (!photoSaved(penId)) missing.push("AM photo");
    if (!obsFor(penId)?.refusal_score) missing.push("refusal score");
    if (!w?.activity) missing.push("activity");
    if (!w?.substrate_condition) missing.push("substrate condition");
    return missing;
  };

  const stateFor = (penId: string): PenCompletion => {
    if (uploads.get(penPhotoKey(trialId ?? "", penId, date, "am"))?.status === "uploading") return "uploading";
    const missing = missingFor(penId);
    if (missing.length === 0) return "complete";
    return missing.length === 5 ? "empty" : "partial";
  };

  const photosDone = trialPens.filter((p) => photoSaved(p.id)).length;
  const photosNeeded = trialPens.length;
  const allPhotos = photosNeeded > 0 && photosDone === photosNeeded;

  const [checklistDone, setChecklistDone] = useState(0);
  const [checklistAll, setChecklistAll] = useState(false);
  const onChecklistProgress = useCallback((done: number, all: boolean) => {
    setChecklistDone(done);
    setChecklistAll(all);
  }, []);

  const overrides = AM_STEPS.map((_, i) =>
    i === AM_PHOTO_STEP_INDEX
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: photosNeeded === 0
            ? "Assign pens to the trial first."
            : allPhotos
              ? `All ${photosNeeded} pen photos uploaded.`
              : `${photosNeeded - photosDone} of ${photosNeeded} pen photos still needed — take them before disturbing the dish.`,
        }
      : undefined,
  );

  // One site reading per session, written to every pen's welfare row for the date.
  const existingTemp = (welfare.data ?? []).find((w) => w.temp_c != null)?.temp_c ?? null;
  const existingHumidity = (welfare.data ?? []).find((w) => w.humidity_pct != null)?.humidity_pct ?? null;
  const [sessionTemp, setSessionTemp] = useState<number | null>(null);
  const [sessionHumidity, setSessionHumidity] = useState<number | null>(null);
  const temp = sessionTemp ?? existingTemp;
  const humidity = sessionHumidity ?? existingHumidity;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["trial-obs", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["welfare", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["trial-photos", trialId, date] });
    void qc.invalidateQueries({ queryKey: ["pop-events", trialId] });
  };

  /** Rewrite the session reading on every welfare row already saved for this date. */
  const applySessionValue = async (patch: { temp_c?: number | null; humidity_pct?: number | null }) => {
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
          <h1 className="text-2xl font-bold">Look, don't weigh.</h1>
        </div>
        <Link to="/guide" className="text-primary flex items-center gap-1 text-sm"><BookOpen className="h-4 w-4" />Guide</Link>
      </header>

      <div className={`rounded-lg border p-3 text-sm ${isDefault ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
        <span className="font-semibold">Completing PM from {date}</span>
        <div className="text-xs text-muted-foreground mt-0.5">
          {isDefault
            ? "Defaults to yesterday. Use the date picker below to catch up on a missed day."
            : <>Manual date. <button type="button" className="text-primary underline" onClick={() => setDate(defaultDate)}>reset to yesterday</button></>}
        </div>
        {trial.data && obs.data && !anyPmForDate && (
          <div className="mt-2 text-xs text-amber-700">No PM entry found for {date}. Pick a different date if catching up.</div>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium">Date (override)</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      <Checklist
        storageKey={`am-checklist-${date}`}
        title="AM steps"
        items={AM_STEPS}
        overrides={overrides}
        onProgress={onChecklistProgress}
      />
      <ChecklistBlocker started={checklistDone > 0} allDone={checklistAll} />

      {!trial.isLoading && !trial.data && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No trial is active. <Link to="/trial" className="text-primary underline">Set up and start a trial.</Link>
        </div>
      )}

      {trial.data && (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="font-semibold">Conditions for this session</h2>
            <p className="text-xs text-muted-foreground">One reading for the whole site. Applied to every pen recorded on this date, including pens already saved.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Temperature" suffix="°C"
                key={`sess-temp-${date}`}
                defaultValue={temp ?? ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                  setSessionTemp(v);
                  void applySessionValue({ temp_c: v });
                }}
              />
              <NumberField
                label="Humidity" suffix="%"
                key={`sess-hum-${date}`}
                defaultValue={humidity ?? ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value === "" ? null : Number(e.currentTarget.value);
                  setSessionHumidity(v);
                  void applySessionValue({ humidity_pct: v });
                }}
              />
            </div>
          </section>

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
                feedId={feedByPen.get(pen.id)!}
                date={date}
                obsRow={obsFor(pen.id)}
                welfareRow={welfareFor(pen.id)}
                photoUrl={photoUrlFor(pen.id)}
                sessionTemp={temp}
                sessionHumidity={humidity}
                penEvents={eventsForPenDate(pen.id)}
                liveCountValue={liveCountFor(pen.id)}
                onSaved={refresh}
              />
            )}
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
  trialId, pen, feedId, date, obsRow, welfareRow, photoUrl, sessionTemp, sessionHumidity,
  penEvents, liveCountValue, onSaved,
}: {
  trialId: string;
  pen: StepperPen;
  feedId: string;
  date: string;
  obsRow: ObsRow | undefined;
  welfareRow: WelfareRow | undefined;
  photoUrl: string | null;
  sessionTemp: number | null;
  sessionHumidity: number | null;
  penEvents: { id: string; event_type: PopulationEventType; count: number }[];
  liveCountValue: number;
  onSaved: () => void;
}) {
  const [refusalState, setRefusalState] = useState<SaveState>("idle");
  const [welfareState, setWelfareState] = useState<SaveState>("idle");
  const [notesState, setNotesState] = useState<SaveState>("idle");
  const [eventState, setEventState] = useState<SaveState>("idle");

  const [refusal, setRefusal] = useState<RefusalScore | null>(obsRow?.refusal_score ?? null);
  const [activity, setActivity] = useState<SnailActivity | null>(welfareRow?.activity ?? null);
  const [flags, setFlags] = useState<HealthFlag[]>((welfareRow?.health_flags as HealthFlag[] | null) ?? []);
  const [substrate, setSubstrate] = useState<SubstrateCondition | null>(welfareRow?.substrate_condition ?? null);

  const saveRefusal = async (value: RefusalScore) => {
    setRefusalState("saving");
    try {
      await upsertRow(
        "observations",
        { trial_id: trialId, pen_id: pen.id, feed_id: feedId, obs_date: date, refusal_score: value },
        OBSERVATIONS_TRIAL_KEY,
      );
      setRefusalState("saved");
      onSaved();
    } catch {
      setRefusalState("failed");
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
          temp_c: sessionTemp,
          humidity_pct: sessionHumidity,
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
          <span className="text-sm font-medium">Refusal score (by eye)</span>
          <StatusPill state={refusalState === "idle" && obsRow?.refusal_score ? "saved" : refusalState} />
        </div>
        <OptionRow options={REFUSAL} value={refusal} onPick={(v) => { setRefusal(v); void saveRefusal(v); }} />
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
