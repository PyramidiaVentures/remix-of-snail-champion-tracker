import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { upsertRow, OBSERVATIONS_ROUND_KEY, EVAP_CONTROLS_KEY } from "@/lib/upsertRow";
import { useMemo, useState } from "react";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { SessionPhotoSlot } from "@/components/SessionPhotoSlot";
import { computeIntake, type EvapRow, type ObservationRow } from "@/lib/scoring";
import { BookOpen, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/am")({
  component: AmPage,
});

const AM_STEPS = [
  "Upload the AM photos (one per pen + one control) — leftovers untouched, tag in frame.",
  "Weigh leftover of each pen × feed; enter it.",
  "Weigh leftover of each control; enter it.",
  "Remove and bin ALL old feed; wipe dishes clean.",
];
const AM_PHOTO_STEP_INDEX = 0;

type PenRow = { id: string; label: string };
type FeedRow = { id: string; name: string };

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AmPage() {
  const round = useQuery({
    queryKey: ["active-round"],
    queryFn: async () => (await supabase.from("rounds").select("*").eq("status", "active").maybeSingle()).data,
  });

  const defaultDate = useMemo(() => yesterday(), []);
  const [date, setDate] = useState<string>(defaultDate);
  const isDefault = date === defaultDate;

  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("*").order("label")).data ?? [] });
  const feeds = useQuery({
    queryKey: ["round-feeds", round.data?.id],
    enabled: !!round.data,
    queryFn: async () => (await supabase.from("feeds").select("*").in("id", round.data!.feed_ids)).data ?? [],
  });

  const obs = useQuery({
    queryKey: ["obs-day", round.data?.id, date],
    enabled: !!round.data,
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", round.data!.id).eq("obs_date", date)).data ?? [],
  });
  const photos = useQuery({
    queryKey: ["session-photos", round.data?.id, date],
    enabled: !!round.data,
    queryFn: async () => (await supabase.from("session_photos").select("*").eq("round_id", round.data!.id).eq("obs_date", date)).data ?? [],
  });

  const anyPmForDate = (obs.data ?? []).some((o) => o.weight_given_g != null);
  const requiredSlots = (pens.data?.length ?? 0) + 1;
  const photosDone =
    (pens.data ?? []).filter((p) => photos.data?.some((r) => r.pen_id === p.id && r.photo_am_url)).length +
    (photos.data?.some((r) => r.pen_id === null && r.photo_am_url) ? 1 : 0);
  const photosRemaining = Math.max(0, requiredSlots - photosDone);
  const allPhotos = requiredSlots > 0 && photosRemaining === 0;

  const overrides = AM_STEPS.map((_, i) =>
    i === AM_PHOTO_STEP_INDEX
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: !pens.data?.length
            ? "Set up pens first."
            : allPhotos
              ? `All ${requiredSlots} AM photos uploaded.`
              : `${photosRemaining} of ${requiredSlots} AM photos still needed — take them BEFORE weighing.`,
        }
      : undefined,
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">AM Check · ~9:00 AM</div>
          <h1 className="text-2xl font-bold">Record what's left.</h1>
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
        {round.data && obs.data && !anyPmForDate && (
          <div className="mt-2 text-xs text-amber-700">No PM entry found for {date}. Pick a different date if catching up.</div>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium">Date (override)</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      <Checklist storageKey={`am-checklist-${date}`} title="AM steps" items={AM_STEPS} overrides={overrides} />

      {!round.data && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No active round.
        </div>
      )}

      {round.data && feeds.data && pens.data && (
        <>
          <AmPhotoSlots roundId={round.data.id} date={date} pens={pens.data} />
          <AmLeftoverGrid roundId={round.data.id} date={date} pens={pens.data} feeds={feeds.data} />
          <AmEvapLeftovers roundId={round.data.id} date={date} feeds={feeds.data} />
        </>
      )}
    </div>
  );
}

type SaveState = "idle" | "saving" | "saved" | "failed";
function StatusPill({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving") return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />saving</span>;
  if (state === "saved") return <span className="inline-flex items-center gap-1 text-[10px] text-primary"><CheckCircle2 className="h-3 w-3" />saved</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" />failed — retry</span>;
}

function AmPhotoSlots({ roundId, date, pens }: { roundId: string; date: string; pens: PenRow[] }) {
  const qc = useQueryClient();
  const photos = useQuery({
    queryKey: ["session-photos", roundId, date],
    queryFn: async () => (await supabase.from("session_photos").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const urlFor = (pen_id: string | null) =>
    photos.data?.find((r) => (pen_id === null ? r.pen_id === null : r.pen_id === pen_id))?.photo_am_url ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">AM photos (one per pen + control)</h2>
      <p className="text-xs text-muted-foreground">Reminder: take the photos before weighing so leftovers stay untouched. Upload from your camera roll.</p>
      {pens.map((pen) => (
        <SessionPhotoSlot key={pen.id}
          round_id={roundId} pen_id={pen.id} obs_date={date} kind="am"
          label={`${pen.label} — leftovers`}
          existingUrl={urlFor(pen.id)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["session-photos", roundId, date] })}
        />
      ))}
      <SessionPhotoSlot
        round_id={roundId} pen_id={null} obs_date={date} kind="am"
        label="Control cage (snail-free)"
        existingUrl={urlFor(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["session-photos", roundId, date] })}
      />
    </section>
  );
}

function AmLeftoverGrid({ roundId, date, pens, feeds }: { roundId: string; date: string; pens: PenRow[]; feeds: FeedRow[] }) {
  const qc = useQueryClient();
  const obs = useQuery({
    queryKey: ["obs-day", roundId, date],
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const evaps = useQuery({
    queryKey: ["evap-day", roundId, date],
    queryFn: async () => (await supabase.from("evap_controls").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });

  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const setKey = (k: string, v: SaveState) => setStatus((s) => ({ ...s, [k]: v }));

  const saveLeftover = async (pen_id: string, feed_id: string, weight_leftover_g: number) => {
    const key = `${pen_id}:${feed_id}`;
    setKey(key, "saving");
    try {
      await upsertRow(
        "observations",
        { round_id: roundId, pen_id, feed_id, obs_date: date, weight_leftover_g },
        OBSERVATIONS_ROUND_KEY,
      );
      setKey(key, "saved");
      qc.invalidateQueries({ queryKey: ["obs-day", roundId, date] });
    } catch {
      setKey(key, "failed");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <h2 className="font-semibold">Grams leftover</h2>
      {pens.map((pen) => (
        <div key={pen.id} className="space-y-2">
          <div className="text-sm font-semibold">{pen.label}</div>
          {feeds.map((feed) => {
            const row = obs.data?.find((o) => o.pen_id === pen.id && o.feed_id === feed.id);
            const evap = evaps.data?.find((e) => e.feed_id === feed.id) as EvapRow | undefined;
            const given = row?.weight_given_g;
            const leftover = row?.weight_leftover_g;
            const intake = row ? computeIntake(row as ObservationRow, evap) : null;

            const warn = leftover != null && given != null && leftover > given;
            const noPm = given == null;
            const key = `${pen.id}:${feed.id}`;
            return (
              <div key={feed.id} className={`rounded-lg border p-3 space-y-2 ${warn ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-sm font-medium">{feed.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {noPm ? <span className="text-amber-600">No PM entry for this date yet</span> : `Given: ${given} g`}
                    </div>
                  </div>
                  <StatusPill state={status[key] ?? (leftover != null ? "saved" : "idle")} />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number" inputMode="decimal" step="0.1"
                    defaultValue={leftover ?? ""}
                    key={`${date}-${pen.id}-${feed.id}-${leftover ?? "empty"}`}
                    onBlur={(e) => {
                      const v = e.currentTarget.value;
                      if (v !== "") void saveLeftover(pen.id, feed.id, Number(v));
                    }}
                    placeholder="leftover (g)"
                    className="num-input flex-1"
                  />
                  {intake != null && <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-primary">{intake.toFixed(1)}</div>
                    <div className="text-[10px] text-muted-foreground">g intake</div>
                  </div>}
                </div>
                {warn && <p className="mt-1 text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Leftover &gt; given — please check the weighing.</p>}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function AmEvapLeftovers({ roundId, date, feeds }: { roundId: string; date: string; feeds: FeedRow[] }) {
  const qc = useQueryClient();
  const evaps = useQuery({
    queryKey: ["evap-day", roundId, date],
    queryFn: async () => (await supabase.from("evap_controls").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const save = async (feed_id: string, control_leftover_g: number) => {
    await upsertRow(
      "evap_controls",
      { round_id: roundId, feed_id, obs_date: date, control_leftover_g },
      EVAP_CONTROLS_KEY,
    );
    qc.invalidateQueries({ queryKey: ["evap-day", roundId, date] });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">Control leftovers</h2>
      {feeds.map((f) => {
        const row = evaps.data?.find((e) => e.feed_id === f.id);
        const given = row?.control_given_g;
        const noPm = given == null;
        return (
          <NumberField key={`${f.id}-${date}-${row?.control_leftover_g ?? "empty"}`}
            label={`${f.name} — control leftover`}
            suffix={noPm ? "no PM control for this date" : `given ${given} g`}
            defaultValue={row?.control_leftover_g ?? ""}
            onBlur={(e) => {
              const v = e.currentTarget.value;
              if (v !== "") void save(f.id, Number(v));
            }}
          />
        );
      })}
    </section>
  );
}
