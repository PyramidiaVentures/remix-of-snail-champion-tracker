import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { today } from "@/lib/date";
import { Checklist } from "@/components/Checklist";
import { NumberField } from "@/components/NumberField";
import { computeIntake, type EvapRow, type ObservationRow } from "@/lib/scoring";
import { BookOpen, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/am")({
  component: AmPage,
});

const AM_STEPS = [
  "Take the AM photo first — leftovers untouched, tag in frame.",
  "Weigh leftover of each pen × feed; enter it.",
  "Weigh leftover of each control; enter it.",
  "Record snail activity and deaths count per pen.",
  "Remove and bin ALL old feed; wipe dishes clean.",
  "(Optional) temperature and humidity per pen.",
];

function AmPage() {
  const [date, setDate] = useState(today());
  const round = useQuery({
    queryKey: ["active-round"],
    queryFn: async () => (await supabase.from("rounds").select("*").eq("status", "active").maybeSingle()).data,
  });
  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("*").order("age_group")).data ?? [] });
  const feeds = useQuery({
    queryKey: ["round-feeds", round.data?.id],
    enabled: !!round.data,
    queryFn: async () => (await supabase.from("feeds").select("*").in("id", round.data!.feed_ids)).data ?? [],
  });

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">AM Check · ~9:00 AM</div>
          <h1 className="text-2xl font-bold">Record what's left.</h1>
        </div>
        <Link to="/guide" className="text-primary flex items-center gap-1 text-sm"><BookOpen className="h-4 w-4" />Guide</Link>
      </header>

      <label className="block">
        <span className="text-sm font-medium">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="mt-1 rounded-lg border border-input bg-card px-3 py-2" />
      </label>

      <Checklist storageKey={`am-checklist-${date}`} title="AM steps" items={AM_STEPS} />

      {!round.data && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No active round.
        </div>
      )}

      {round.data && feeds.data && pens.data && (
        <>
          <AmLeftoverGrid roundId={round.data.id} date={date} pens={pens.data} feeds={feeds.data} />
          <AmEvapLeftovers roundId={round.data.id} date={date} feeds={feeds.data} />
          <PenDailyGrid date={date} pens={pens.data} />
        </>
      )}
    </div>
  );
}

function AmLeftoverGrid({ roundId, date, pens, feeds }: { roundId: string; date: string; pens: { id: string; label: string; age_group: string }[]; feeds: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const obs = useQuery({
    queryKey: ["obs-day", roundId, date],
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const evaps = useQuery({
    queryKey: ["evap-day", roundId, date],
    queryFn: async () => (await supabase.from("evap_controls").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });

  const save = useMutation({
    mutationFn: async (input: { pen_id: string; feed_id: string; weight_leftover_g: number }) => {
      const { error } = await supabase.from("observations")
        .update({ weight_leftover_g: input.weight_leftover_g })
        .eq("round_id", roundId).eq("pen_id", input.pen_id).eq("feed_id", input.feed_id).eq("obs_date", date);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["obs-day", roundId, date] }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <h2 className="font-semibold">Grams leftover</h2>
      {pens.map((pen) => (
        <div key={pen.id} className="space-y-2">
          <div className="text-sm font-semibold">{pen.label} <span className="text-xs text-muted-foreground ml-1">{pen.age_group}</span></div>
          {feeds.map((feed) => {
            const row = obs.data?.find((o) => o.pen_id === pen.id && o.feed_id === feed.id) as ObservationRow | undefined;
            const evap = evaps.data?.find((e) => e.feed_id === feed.id) as EvapRow | undefined;
            const given = row?.weight_given_g;
            const leftover = row?.weight_leftover_g;
            const intake = row ? computeIntake(row, evap) : null;
            const warn = leftover != null && given != null && leftover > given;
            const noPmYet = given == null;
            return (
              <div key={feed.id} className={`rounded-lg border p-3 ${warn ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
                <div className="flex items-baseline justify-between mb-1">
                  <div>
                    <div className="text-sm font-medium">{feed.name}</div>
                    <div className="text-xs text-muted-foreground">Given: {given != null ? `${given} g` : "—"}</div>
                  </div>
                  {intake != null && <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-primary">{intake.toFixed(1)}</div>
                    <div className="text-[10px] text-muted-foreground">g intake (evap-corrected)</div>
                  </div>}
                </div>
                <input
                  type="number" inputMode="decimal" step="0.1"
                  disabled={noPmYet}
                  defaultValue={leftover ?? ""}
                  onBlur={(e) => {
                    const v = e.currentTarget.value;
                    if (v !== "") save.mutate({ pen_id: pen.id, feed_id: feed.id, weight_leftover_g: Number(v) });
                  }}
                  placeholder={noPmYet ? "enter PM first" : "leftover (g)"}
                  className="num-input"
                />
                {warn && <p className="mt-1 text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Leftover &gt; given — please check the weighing.</p>}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function AmEvapLeftovers({ roundId, date, feeds }: { roundId: string; date: string; feeds: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const evaps = useQuery({
    queryKey: ["evap-day", roundId, date],
    queryFn: async () => (await supabase.from("evap_controls").select("*").eq("round_id", roundId).eq("obs_date", date)).data ?? [],
  });
  const save = useMutation({
    mutationFn: async (input: { feed_id: string; control_leftover_g: number }) => {
      const { error } = await supabase.from("evap_controls")
        .update({ control_leftover_g: input.control_leftover_g })
        .eq("round_id", roundId).eq("feed_id", input.feed_id).eq("obs_date", date);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["evap-day", roundId, date] }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">Control leftovers</h2>
      {feeds.map((f) => {
        const row = evaps.data?.find((e) => e.feed_id === f.id);
        const given = row?.control_given_g;
        return (
          <NumberField key={f.id}
            label={`${f.name} — control leftover`}
            suffix={given != null ? `given ${given} g` : "no PM control"}
            disabled={given == null}
            defaultValue={row?.control_leftover_g ?? ""}
            onBlur={(e) => {
              const v = e.currentTarget.value;
              if (v !== "") save.mutate({ feed_id: f.id, control_leftover_g: Number(v) });
            }}
          />
        );
      })}
    </section>
  );
}

function PenDailyGrid({ date, pens }: { date: string; pens: { id: string; label: string }[] }) {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["pen-daily", date],
    queryFn: async () => (await supabase.from("pen_daily").select("*").eq("obs_date", date)).data ?? [],
  });
  const upsert = useMutation({
    mutationFn: async (input: { pen_id: string; patch: Record<string, unknown> }) => {
      const existing = data.data?.find((d) => d.pen_id === input.pen_id);
      const patch = input.patch as never;
      if (existing) {
        const { error } = await supabase.from("pen_daily").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("pen_daily").insert({ pen_id: input.pen_id, obs_date: date, ...(input.patch as Record<string, never>) });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pen-daily", date] }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
      <h2 className="font-semibold">Pen readings</h2>
      {pens.map((pen) => {
        const row = data.data?.find((d) => d.pen_id === pen.id);
        return (
          <div key={pen.id} className="rounded-lg border border-border p-3 space-y-2">
            <div className="text-sm font-semibold">{pen.label}</div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Snail activity</div>
              <div className="grid grid-cols-3 gap-1">
                {(["active", "mixed", "mostly_sealed"] as const).map((a) => (
                  <button key={a} type="button"
                    onClick={() => upsert.mutate({ pen_id: pen.id, patch: { snail_activity: a } })}
                    className={`rounded-md py-2 text-xs font-medium ${row?.snail_activity === a ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                    {a === "mostly_sealed" ? "mostly sealed" : a}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs">
                <span className="text-muted-foreground">Deaths</span>
                <input type="number" min={0} defaultValue={row?.deaths_count ?? 0}
                  onBlur={(e) => upsert.mutate({ pen_id: pen.id, patch: { deaths_count: Number(e.target.value) } })}
                  className="mt-0.5 w-full rounded border border-input bg-background px-2 py-1.5 text-base" />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Temp °C</span>
                <input type="number" step="0.1" defaultValue={row?.temp_c ?? ""}
                  onBlur={(e) => { const v = e.target.value; if (v !== "") upsert.mutate({ pen_id: pen.id, patch: { temp_c: Number(v) } }); }}
                  className="mt-0.5 w-full rounded border border-input bg-background px-2 py-1.5 text-base" />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Humidity %</span>
                <input type="number" step="1" defaultValue={row?.humidity_pct ?? ""}
                  onBlur={(e) => { const v = e.target.value; if (v !== "") upsert.mutate({ pen_id: pen.id, patch: { humidity_pct: Number(v) } }); }}
                  className="mt-0.5 w-full rounded border border-input bg-background px-2 py-1.5 text-base" />
              </label>
            </div>
          </div>
        );
      })}
    </section>
  );
}
