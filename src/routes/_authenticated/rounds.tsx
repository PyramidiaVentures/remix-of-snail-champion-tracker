import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { today } from "@/lib/date";
import { scoreRound, type ObservationRow, type EvapRow } from "@/lib/scoring";
import { Trophy, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rounds")({
  component: RoundsPage,
});

function RoundsPage() {
  const rounds = useQuery({
    queryKey: ["rounds"],
    queryFn: async () => (await supabase.from("rounds").select("*").order("round_number", { ascending: false })).data ?? [],
  });
  const active = rounds.data?.find((r) => r.status === "active");
  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => (await supabase.from("feeds").select("*").order("name")).data ?? [],
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Rounds</h1>
        <p className="text-sm text-muted-foreground">Same 3 feeds tested simultaneously in all pens.</p>
      </header>

      {active ? (
        <ActiveRoundCard roundId={active.id} />
      ) : (
        <StartRound feeds={feeds.data ?? []} rounds={rounds.data ?? []} />
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="font-semibold mb-2">History</h2>
        <ul className="divide-y divide-border">
          {rounds.data?.map((r) => (
            <li key={r.id} className="py-2 text-sm flex items-center justify-between">
              <div>
                <div className="font-medium">Round {r.round_number} <span className="ml-2 text-xs uppercase text-muted-foreground">{r.status}</span></div>
                <div className="text-xs text-muted-foreground">{r.start_date}{r.end_date ? ` → ${r.end_date}` : ""}</div>
              </div>
              {r.champion_feed_id && <FeedName id={r.champion_feed_id} className="text-primary font-medium text-xs" />}
            </li>
          ))}
          {rounds.data?.length === 0 && <li className="text-sm text-muted-foreground">No rounds yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function FeedName({ id, className }: { id: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["feed", id],
    queryFn: async () => (await supabase.from("feeds").select("name").eq("id", id).maybeSingle()).data,
  });
  return <span className={className}>{data?.name ?? "…"}</span>;
}

function StartRound({ feeds, rounds }: { feeds: { id: string; name: string }[]; rounds: { round_number: number; champion_feed_id: string | null; champion_global_value: number }[] }) {
  const qc = useQueryClient();
  const nextNumber = (rounds[0]?.round_number ?? 0) + 1;
  const lastClosed = rounds.find((r) => r.champion_feed_id);
  const lockedChampion = lastClosed?.champion_feed_id ?? null;
  const [picks, setPicks] = useState<string[]>(lockedChampion ? [lockedChampion] : []);

  const togglePick = (id: string) => {
    if (lockedChampion && id === lockedChampion) return;
    setPicks((p) => p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p);
  };

  const start = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rounds").insert({
        round_number: nextNumber,
        start_date: today(),
        status: "active",
        champion_feed_id: lockedChampion,
        feed_ids: picks,
        champion_global_value: lastClosed?.champion_global_value ?? 1.0,
      });
      if (error) throw error;
      await supabase.from("feeds").update({ status: "active" }).in("id", picks);
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-1">Start round {nextNumber}</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {lockedChampion ? "Champion is locked in. Pick 2 challengers." : "Round 1: pick 3 feeds."}
      </p>
      <ul className="space-y-1 mb-3">
        {feeds.map((f) => {
          const locked = lockedChampion === f.id;
          const on = picks.includes(f.id);
          return (
            <li key={f.id}>
              <button type="button" onClick={() => togglePick(f.id)}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${on ? "border-primary bg-accent" : "border-border bg-background"} ${locked ? "opacity-90" : ""}`}>
                <span className="font-medium">{f.name}</span>
                {locked ? <span className="text-xs text-primary font-semibold">CHAMPION</span> : on ? <span className="text-xs">✓ selected</span> : <span className="text-xs text-muted-foreground">tap to select</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <button disabled={picks.length !== 3} onClick={() => start.mutate()}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-3 text-primary-foreground font-semibold disabled:opacity-50">
        <PlayCircle className="h-5 w-5" /> Start round
      </button>
      {feeds.length < 3 && <p className="mt-2 text-xs text-destructive">Need at least 3 feeds in the library — <Link to="/setup" className="underline">add some</Link>.</p>}
    </section>
  );
}

function ActiveRoundCard({ roundId }: { roundId: string }) {
  const qc = useQueryClient();
  const [includeAccl, setIncludeAccl] = useState(false);

  const round = useQuery({
    queryKey: ["round", roundId],
    queryFn: async () => (await supabase.from("rounds").select("*").eq("id", roundId).maybeSingle()).data,
  });
  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("*")).data ?? [] });
  const feeds = useQuery({ queryKey: ["feeds"], queryFn: async () => (await supabase.from("feeds").select("*")).data ?? [] });
  const obs = useQuery({
    queryKey: ["obs", roundId],
    queryFn: async () => (await supabase.from("observations").select("*").eq("round_id", roundId)).data ?? [],
  });
  const evaps = useQuery({
    queryKey: ["evaps", roundId],
    queryFn: async () => (await supabase.from("evap_controls").select("*").eq("round_id", roundId)).data ?? [],
  });

  const result = useMemo(() => {
    if (!round.data || !pens.data || !obs.data || !evaps.data) return null;
    return scoreRound(
      obs.data as ObservationRow[],
      evaps.data as EvapRow[],
      round.data.champion_feed_id,
      pens.data.map((p) => p.id),
      round.data.feed_ids,
      includeAccl,
    );
  }, [round.data, pens.data, obs.data, evaps.data, includeAccl]);

  const promote = useMutation({
    mutationFn: async () => {
      const rd = round.data;
      if (!rd || !result?.winnerFeedId) return;
      const newGlobal = rd.champion_feed_id
        ? rd.champion_global_value * (result.winnerScore > 0 ? result.winnerScore : 1)
        : rd.champion_global_value;
      const nextChampion = rd.champion_feed_id && result.winnerScore > 1
        ? result.winnerFeedId
        : rd.champion_feed_id ?? result.winnerFeedId;
      await supabase.from("rounds").update({
        status: "closed",
        end_date: today(),
        champion_feed_id: nextChampion,
        champion_global_value: nextChampion === rd.champion_feed_id ? rd.champion_global_value : newGlobal,
      }).eq("id", rd.id);
      const losers = (rd.feed_ids as string[]).filter((f) => f !== nextChampion && f !== rd.champion_feed_id);
      if (losers.length) await supabase.from("feeds").update({ status: "eliminated" }).in("id", losers);
      await supabase.from("feeds").update({ status: "champion" }).eq("id", nextChampion);
    },
    onSuccess: () => qc.invalidateQueries(),
  });

  if (!round.data) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Active</div>
          <h2 className="text-xl font-bold">Round {round.data.round_number}</h2>
          <div className="text-xs text-muted-foreground">Started {round.data.start_date}</div>
        </div>
        <Trophy className="h-6 w-6 text-primary" />
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Round-close checklist</div>
        <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
          <li>Review the past days of data (drop day 1 acclimation).</li>
          <li>Check the ranking below.</li>
          <li>Promote the winner to champion.</li>
          <li>Load 2 new challengers when starting next round.</li>
          <li>Relabel dishes for the new round.</li>
        </ol>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeAccl} onChange={(e) => setIncludeAccl(e.target.checked)} />
        Include day 1 (acclimation) in scoring
      </label>

      <div>
        <div className="text-sm font-medium mb-2">Ranking</div>
        <ul className="space-y-2">
          {(round.data.feed_ids as string[])
            .map((fid) => ({ fid, score: result?.perFeed[fid]?.round_score }))
            .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
            .map(({ fid, score }, i) => {
              const feed = feeds.data?.find((f) => f.id === fid);
              const isChamp = fid === round.data!.champion_feed_id;
              return (
                <li key={fid} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold w-6 text-muted-foreground">{i + 1}</span>
                    <div>
                      <div className="font-medium">{feed?.name ?? "…"}</div>
                      {isChamp && <div className="text-[10px] uppercase text-primary font-semibold">Champion</div>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">{score != null && !isNaN(score) ? score.toFixed(2) : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">round score</div>
                  </div>
                </li>
              );
            })}
        </ul>
      </div>

      <button onClick={() => promote.mutate()} disabled={!result?.winnerFeedId}
        className="w-full rounded-lg bg-primary py-3 text-primary-foreground font-semibold disabled:opacity-50">
        Promote to champion &amp; close round
      </button>
    </section>
  );
}
