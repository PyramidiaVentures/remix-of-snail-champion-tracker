import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { today } from "@/lib/date";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { BookOpen, Save } from "lucide-react";

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

      <Checklist storageKey={`pm-checklist-${date}`} title="PM steps" items={PM_STEPS} />

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

function PmGivenGrid({ roundId, date, pens, feeds }: { roundId: string; date: string; pens: { id: string; label: string; age_group: string }[]; feeds: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ["obs-day", roundId, date],
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (input: { pen_id: string; feed_id: string; weight_given_g: number }) => {
      // acclimation = first day this feed appears in the round
      const { data: earliest } = await supabase.from("observations").select("obs_date")
        .eq("round_id", roundId).eq("feed_id", input.feed_id).order("obs_date").limit(1);
      const firstDay = earliest?.[0]?.obs_date ?? date;
      const is_acclimation = firstDay === date && (!earliest || earliest.length === 0 || earliest[0].obs_date === date);

      const { error } = await supabase.from("observations").upsert({
        round_id: roundId, pen_id: input.pen_id, feed_id: input.feed_id, obs_date: date,
        weight_given_g: input.weight_given_g, is_acclimation,
      }, { onConflict: "round_id,pen_id,feed_id,obs_date" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obs-day", roundId, date] }),
  });

  const getVal = (pen_id: string, feed_id: string) =>
    existing.data?.find((o) => o.pen_id === pen_id && o.feed_id === feed_id)?.weight_given_g ?? "";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <h2 className="font-semibold">Grams given</h2>
      {pens.map((pen) => (
        <div key={pen.id} className="space-y-2">
          <div className="text-sm font-semibold">{pen.label} <span className="text-xs text-muted-foreground ml-1">{pen.age_group}</span></div>
          <div className="grid grid-cols-1 gap-2">
            {feeds.map((feed) => (
              <NumberField key={feed.id}
                label={feed.name}
                suffix="g"
                defaultValue={getVal(pen.id, feed.id) as number | ""}
                onBlur={(e) => {
                  const v = e.currentTarget.value;
                  if (v !== "") save.mutate({ pen_id: pen.id, feed_id: feed.id, weight_given_g: Number(v) });
                }}
              />
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground flex items-center gap-1"><Save className="h-3 w-3" /> Values save automatically when you tap out of a field.</p>
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
