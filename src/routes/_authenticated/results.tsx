import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { scoreRound, computeIntake, type EvapRow, type ObservationRow } from "@/lib/scoring";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/results")({
  component: ResultsPage,
});

function ResultsPage() {
  const rounds = useQuery({ queryKey: ["rounds"], queryFn: async () => (await supabase.from("rounds").select("*").order("round_number")).data ?? [] });
  const feeds = useQuery({ queryKey: ["feeds"], queryFn: async () => (await supabase.from("feeds").select("*")).data ?? [] });
  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("*").order("label")).data ?? [] });
  const obs = useQuery({ queryKey: ["all-obs"], queryFn: async () => (await supabase.from("observations").select("*")).data ?? [] });
  const evaps = useQuery({ queryKey: ["all-evaps"], queryFn: async () => (await supabase.from("evap_controls").select("*")).data ?? [] });

  const activeRound = rounds.data?.find((r) => r.status === "active") ?? rounds.data?.[rounds.data.length - 1];

  const activeResult = useMemo(() => {
    if (!activeRound || !pens.data || !obs.data || !evaps.data) return null;
    const roundObs = obs.data.filter((o) => o.round_id === activeRound.id) as ObservationRow[];
    const roundEvaps = evaps.data.filter((e) => e.round_id === activeRound.id) as EvapRow[];
    return scoreRound(roundObs, roundEvaps, activeRound.champion_feed_id, pens.data.map((p) => p.id), activeRound.feed_ids, false);
  }, [activeRound, pens.data, obs.data, evaps.data]);

  const feedName = (id: string) => feeds.data?.find((f) => f.id === id)?.name ?? "…";

  // Champion trend
  const championTrend = useMemo(() => {
    if (!rounds.data || !obs.data || !evaps.data) return [];
    return rounds.data
      .filter((r) => r.champion_feed_id)
      .map((r) => {
        const rows = (obs.data ?? []).filter((o) => o.round_id === r.id && o.feed_id === r.champion_feed_id && !o.is_acclimation);
        const evapMap = new Map((evaps.data ?? []).filter((e) => e.round_id === r.id).map((e) => [`${e.feed_id}|${e.obs_date}`, e]));
        const intakes = rows.map((o) => computeIntake(o as ObservationRow, evapMap.get(`${o.feed_id}|${o.obs_date}`) as EvapRow | undefined)).filter((v): v is number => v != null);
        const avg = intakes.length ? intakes.reduce((a, b) => a + b, 0) / intakes.length : 0;
        return { round: `R${r.round_number}`, champion: feedName(r.champion_feed_id!), intake: Number(avg.toFixed(2)) };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds.data, obs.data, evaps.data, feeds.data]);

  // Leaderboard: compute global_score for every feed across all rounds it was in
  const leaderboard = useMemo(() => {
    if (!rounds.data || !feeds.data || !pens.data || !obs.data || !evaps.data) return [];
    const scoresByFeed = new Map<string, { global: number; round: number }>();
    for (const r of rounds.data) {
      const roundObs = obs.data.filter((o) => o.round_id === r.id) as ObservationRow[];
      const roundEvaps = evaps.data.filter((e) => e.round_id === r.id) as EvapRow[];
      const res = scoreRound(roundObs, roundEvaps, r.champion_feed_id, pens.data.map((p) => p.id), r.feed_ids, false);
      for (const fid of r.feed_ids) {
        const rs = res.perFeed[fid]?.round_score;
        if (rs == null || isNaN(rs)) continue;
        const global = rs * r.champion_global_value;
        const prev = scoresByFeed.get(fid);
        if (!prev || prev.round < r.round_number) scoresByFeed.set(fid, { global, round: r.round_number });
      }
    }
    return Array.from(scoresByFeed.entries())
      .map(([fid, v]) => ({ feed: feedName(fid), fid, ...v, feedObj: feeds.data.find((f) => f.id === fid) }))
      .sort((a, b) => b.global - a.global);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds.data, feeds.data, pens.data, obs.data, evaps.data]);

  const roundBarData = activeRound && activeResult
    ? activeRound.feed_ids.map((fid: string) => ({
        feed: feedName(fid),
        score: Number(activeResult.perFeed[fid]?.round_score?.toFixed(2) ?? 0),
        ...Object.fromEntries((pens.data ?? []).map((p) => [p.label, Number(activeResult.perFeed[fid]?.pen_ratios[p.id]?.toFixed(2) ?? 0)])),
      }))
    : [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-sm text-muted-foreground">Reliable at the top (best feeds) and bottom (clear rejects); middle rankings are approximate.</p>
      </header>

      {activeRound && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="font-semibold">Round {activeRound.round_number} — champion-relative scores</h2>
            <span className="text-xs uppercase text-muted-foreground">{activeRound.status}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={roundBarData}>
                <XAxis dataKey="feed" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="score" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Per-pen breakdown:
            <div className="mt-1 space-y-1">
              {activeRound.feed_ids.map((fid: string) => (
                <div key={fid} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium text-foreground">{feedName(fid)}:</span>
                  {(pens.data ?? []).map((p) => {
                    const r = activeResult?.perFeed[fid]?.pen_ratios[p.id];
                    return <span key={p.id}>{p.label}: {r != null && !isNaN(r) ? r.toFixed(2) : "—"}</span>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {championTrend.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-semibold mb-2">Champion intake across rounds</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={championTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="round" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="intake" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="font-semibold mb-2">Leaderboard</h2>
        <ol className="divide-y divide-border">
          {leaderboard.map((row, i) => (
            <li key={row.fid} className="py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold w-6 text-muted-foreground tabular-nums">{i + 1}</span>
                <div>
                  <div className="font-medium">{row.feed}</div>
                  <div className="text-xs text-muted-foreground">
                    Round {row.round}{row.feedObj?.cost_per_kg != null ? ` · ${row.feedObj.cost_per_kg}/kg` : ""}
                    
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums">{row.global.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">global score</div>
              </div>
            </li>
          ))}
          {leaderboard.length === 0 && <li className="py-2 text-sm text-muted-foreground">No scored rounds yet.</li>}
        </ol>
      </section>
    </div>
  );
}
