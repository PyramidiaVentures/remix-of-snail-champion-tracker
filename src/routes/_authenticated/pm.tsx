import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { today } from "@/lib/date";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { BookOpen, Save, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pm")({
  component: PmPage,
});

const PM_STEPS = [
  "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).",
  "Weigh a generous portion of each feed — enough that there WILL be leftovers tomorrow.",
  "Enter grams given for each pen × feed.",
  "Weigh a matching-size control portion of each feed; enter control given.",
  "Place feed dishes in each pen, rotating each feed's position from yesterday.",
  "Put control portions in the snail-free control cage beside the pens.",
  "Top up calcium and water dishes (never weighed, always present).",
  "Take the PM photo with the paper tag (feed + pen + date) in frame.",
];
const PM_PHOTO_STEP_INDEX = 7;

function PmPage() {
  const [date, setDate] = useState(today());
  const round = useQuery({
    queryKey: ["active-round"],
    queryFn: async () => (await supabase.from("rounds").select("*").eq("status", "active").maybeSingle()).data,
  });
  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("*").order("age_group")).data ?? [] });
  const feeds = useQuery({
    queryKey: ["round-feeds", round.data?.id],
    enabled: !!round.data,
    queryFn: async () => {
      const ids = round.data!.feed_ids;
      return (await supabase.from("feeds").select("*").in("id", ids)).data ?? [];
    },
  });

  const obs = useQuery({
    queryKey: ["obs-day", round.data?.id, date],
    enabled: !!round.data,
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", round.data!.id).eq("obs_date", date)).data ?? [],
  });

  const totalCells = (pens.data?.length ?? 0) * (feeds.data?.length ?? 0);
  const photosDone = (obs.data ?? []).filter((o) => o.photo_pm_url).length;
  const photosRemaining = Math.max(0, totalCells - photosDone);
  const allPhotos = totalCells > 0 && photosRemaining === 0;

  const overrides = PM_STEPS.map((_, i) =>
    i === PM_PHOTO_STEP_INDEX
      ? {
          forced: allPhotos,
          locked: true,
          subtitle: totalCells === 0
            ? "Set up pens & feeds first."
            : allPhotos
              ? `All ${totalCells} photos attached.`
              : `${photosRemaining} of ${totalCells} photos still needed.`,
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

function PmGivenGrid({ roundId, date, pens, feeds }: { roundId: string; date: string; pens: { id: string; label: string; age_group: string }[]; feeds: { id: string; name: string }[] }) {
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
      <h2 className="font-semibold">Grams given &amp; photos</h2>
      {pens.map((pen) => (
        <div key={pen.id} className="space-y-2">
          <div className="text-sm font-semibold">{pen.label} <span className="text-xs text-muted-foreground ml-1">{pen.age_group}</span></div>
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
                  <PhotoCapture
                    round_id={roundId} pen_id={pen.id} feed_id={feed.id} obs_date={date} kind="pm"
                    existingPath={row?.photo_pm_url ?? null}
                    onSaved={() => qc.invalidateQueries({ queryKey: ["obs-day", roundId, date] })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Save className="h-3 w-3" /> Numbers save on blur; photos save on capture. They save independently.</p>
    </section>
  );
}

function PmEvapControls({ roundId, date, feeds }: { roundId: string; date: string; feeds: { id: string; name: string }[] }) {
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
