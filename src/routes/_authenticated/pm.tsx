import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { today } from "@/lib/date";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { SessionPhotoSlot } from "@/components/SessionPhotoSlot";
import { BookOpen, Save, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pm")({
  component: PmPage,
});

const PM_STEPS = [
  "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).",
  "Weigh a generous portion of each feed — enough that there WILL be leftovers tomorrow.",
  "Enter grams given for each pen × feed.",
  "Weigh a matching-size control portion of each feed; enter control given.",
  "Place feed in each pen, rotating each feed's position from yesterday.",
  "Put control portions in the snail-free control cage beside the pens.",
  "Top up calcium and water dishes (never weighed, always present).",
  "Upload one PM photo per pen (all its feeds together, tag in frame) plus one control-cage photo.",
];
const PM_PHOTO_STEP_INDEX = 7;

type PenRow = { id: string; label: string };
type FeedRow = { id: string; name: string };

function PmPage() {
  const [date, setDate] = useState(today());
  const round = useQuery({
    queryKey: ["active-round"],
    queryFn: async () => (await supabase.from("rounds").select("*").eq("status", "active").maybeSingle()).data,
  });
  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("*").order("label")).data ?? [] });
  const feeds = useQuery({
    queryKey: ["round-feeds", round.data?.id],
    enabled: !!round.data,
    queryFn: async () => {
      const ids = round.data!.feed_ids;
      return (await supabase.from("feeds").select("*").in("id", ids)).data ?? [];
    },
  });
  const photos = useQuery({
    queryKey: ["session-photos", round.data?.id, date],
    enabled: !!round.data,
    queryFn: async () => (await supabase.from("session_photos").select("*").eq("round_id", round.data!.id).eq("obs_date", date)).data ?? [],
  });

  const requiredSlots = (pens.data?.length ?? 0) + 1; // pens + control
  const photosDone =
    (pens.data ?? []).filter((p) => photos.data?.some((r) => r.pen_id === p.id && r.photo_pm_url)).length +
    (photos.data?.some((r) => r.pen_id === null && r.photo_pm_url) ? 1 : 0);
  const photosRemaining = Math.max(0, requiredSlots - photosDone);
  const allPhotos = requiredSlots > 0 && photosRemaining === 0;

  const overrides = PM_STEPS.map((_, i) =>
    i === PM_PHOTO_STEP_INDEX
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: !pens.data?.length
            ? "Set up pens first."
            : allPhotos
              ? `All ${requiredSlots} photos uploaded.`
              : `${photosRemaining} of ${requiredSlots} photos still needed.`,
        }
      : undefined,
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">PM Feeding · ~4:30 PM</div>
          <h1 className="text-2xl font-bold">Give more than they can finish.</h1>
        </div>
        <Link to="/guide" className="text-primary flex items-center gap-1 text-sm"><BookOpen className="h-4 w-4" />Guide</Link>
      </header>

      <label className="block">
        <span className="text-sm font-medium">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      <Checklist storageKey={`pm-checklist-${date}`} title="PM steps" items={PM_STEPS} overrides={overrides} />

      {!round.data && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No active round. <Link to="/rounds" className="text-primary underline">Start one.</Link>
        </div>
      )}

      {round.data && feeds.data && pens.data && (
        <>
          <PmPhotoSlots roundId={round.data.id} date={date} pens={pens.data} />
          <PmGivenGrid roundId={round.data.id} date={date} pens={pens.data} feeds={feeds.data} />
          <PmEvapControls roundId={round.data.id} date={date} feeds={feeds.data} />
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

function PmPhotoSlots({ roundId, date, pens }: { roundId: string; date: string; pens: PenRow[] }) {
  const qc = useQueryClient();
  const photos = useQuery({
    queryKey: ["session-photos", roundId, date],
    queryFn: async () => (await supabase.from("session_photos").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const urlFor = (pen_id: string | null) =>
    photos.data?.find((r) => (pen_id === null ? r.pen_id === null : r.pen_id === pen_id))?.photo_pm_url ?? null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">PM photos (one per pen + control)</h2>
      <p className="text-xs text-muted-foreground">Take the photos on your phone first (so you can share them via WhatsApp too), then upload each from your camera roll.</p>
      {pens.map((pen) => (
        <SessionPhotoSlot key={pen.id}
          round_id={roundId} pen_id={pen.id} obs_date={date} kind="pm"
          label={`${pen.label} — all feeds`}
          existingUrl={urlFor(pen.id)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["session-photos", roundId, date] })}
        />
      ))}
      <SessionPhotoSlot
        round_id={roundId} pen_id={null} obs_date={date} kind="pm"
        label="Control cage (snail-free)"
        existingUrl={urlFor(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["session-photos", roundId, date] })}
      />
    </section>
  );
}

function PmGivenGrid({ roundId, date, pens, feeds }: { roundId: string; date: string; pens: PenRow[]; feeds: FeedRow[] }) {
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ["obs-day", roundId, date],
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });

  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const setKey = (k: string, v: SaveState) => setStatus((s) => ({ ...s, [k]: v }));

  const saveNumber = async (pen_id: string, feed_id: string, weight_given_g: number) => {
    const key = `${pen_id}:${feed_id}`;
    setKey(key, "saving");
    try {
      const { data: earliest } = await supabase.from("observations").select("obs_date")
        .eq("round_id", roundId).eq("feed_id", feed_id).order("obs_date").limit(1);
      const firstDay = earliest?.[0]?.obs_date ?? date;
      const is_acclimation = firstDay === date && (!earliest || earliest.length === 0 || earliest[0].obs_date === date);
      const { error } = await supabase.from("observations").upsert({
        round_id: roundId, pen_id, feed_id, obs_date: date,
        weight_given_g, is_acclimation,
      }, { onConflict: "round_id,pen_id,feed_id,obs_date" });
      if (error) throw error;
      setKey(key, "saved");
      qc.invalidateQueries({ queryKey: ["obs-day", roundId, date] });
    } catch {
      setKey(key, "failed");
    }
  };

  const rowOf = (pen_id: string, feed_id: string) =>
    existing.data?.find((o) => o.pen_id === pen_id && o.feed_id === feed_id);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <h2 className="font-semibold">Grams given</h2>
      {pens.map((pen) => (
        <div key={pen.id} className="space-y-2">
          <div className="text-sm font-semibold">{pen.label}</div>
          <div className="grid grid-cols-1 gap-2">
            {feeds.map((feed) => {
              const row = rowOf(pen.id, feed.id);
              const key = `${pen.id}:${feed.id}`;
              return (
                <div key={feed.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div className="text-sm font-medium">{feed.name}</div>
                    <StatusPill state={status[key] ?? (row?.weight_given_g != null ? "saved" : "idle")} />
                  </div>
                  <NumberField
                    label="Grams given"
                    suffix="g"
                    defaultValue={row?.weight_given_g ?? ""}
                    onBlur={(e) => {
                      const v = e.currentTarget.value;
                      if (v !== "") void saveNumber(pen.id, feed.id, Number(v));
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Save className="h-3 w-3" /> Numbers save on blur; photos save on upload. They save independently.</p>
    </section>
  );
}

function PmEvapControls({ roundId, date, feeds }: { roundId: string; date: string; feeds: FeedRow[] }) {
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ["evap-day", roundId, date],
    queryFn: async () => (await supabase.from("evap_controls").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const save = useMutation({
    mutationFn: async (input: { feed_id: string; control_given_g: number }) => {
      const { error } = await supabase.from("evap_controls").upsert({
        round_id: roundId, feed_id: input.feed_id, obs_date: date,
        control_given_g: input.control_given_g,
      }, { onConflict: "round_id,feed_id,obs_date" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evap-day", roundId, date] }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">Evaporation controls (snail-free cage)</h2>
      {feeds.map((f) => (
        <NumberField key={f.id}
          label={`${f.name} — control given`}
          suffix="g"
          defaultValue={existing.data?.find((e) => e.feed_id === f.id)?.control_given_g ?? ""}
          onBlur={(e) => {
            const v = e.currentTarget.value;
            if (v !== "") save.mutate({ feed_id: f.id, control_given_g: Number(v) });
          }}
        />
      ))}
    </section>
  );
}
