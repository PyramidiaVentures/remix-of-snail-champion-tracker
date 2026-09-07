import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import {
  computeMetrics, daysBetween, intervalExtras, meanOf, addDays,
  type PenMetrics, type TrialMetrics,
} from "@/lib/metrics";
import { readIncludeAcclimation } from "@/lib/acclimation";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/results")({
  component: ResultsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    pen: typeof search['pen'] === "string" ? search['pen'] : "",
  }),
  head: () => ({
    meta: [
      { title: "Trial Results — SNOVA Growth Tracker" },
      { name: "description", content: "Growth, survival and feed-offered figures for the active snail feeding trial, computed live from recorded weighings and feeding records." },
      { property: "og:title", content: "Trial Results — SNOVA Growth Tracker" },
      { property: "og:description", content: "Growth, survival and feed-offered figures for the active snail feeding trial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const COLORS = [
  "var(--color-primary)", "#b45309", "#0369a1", "#7c3aed",
  "#be123c", "#15803d", "#a16207", "#0f766e",
];

type View = "treatment" | "pen";

function ResultsPage() {
  const [view, setView] = useState<View>("treatment");
  const [dryMatter, setDryMatter] = useState(false);
  const includeAcclimation = readIncludeAcclimation();

  const trial = useQuery({
    queryKey: ["active-trial"],
    queryFn: async () =>
      (await supabase.from("trials").select("*").eq("status", "active").limit(1)).data?.[0] ?? null,
  });
  const trialId = trial.data?.id;

  const pens = useQuery({ queryKey: ["pens"], queryFn: async () => (await supabase.from("pens").select("id,label").order("label")).data ?? [] });
  const feeds = useQuery({ queryKey: ["feeds"], queryFn: async () => (await supabase.from("feeds").select("id,name,dm_percent")).data ?? [] });
  const treatments = useQuery({
    queryKey: ["treatments", trialId], enabled: !!trialId,
    queryFn: async () => (await supabase.from("treatments").select("id,label,feed_id").eq("trial_id", trialId!)).data ?? [],
  });
  const assignments = useQuery({
    queryKey: ["assignments", trialId], enabled: !!trialId,
    queryFn: async () => (await supabase.from("pen_assignments").select("pen_id,treatment_id").eq("trial_id", trialId!)).data ?? [],
  });
  const observations = useQuery({
    queryKey: ["trial-observations", trialId], enabled: !!trialId,
    queryFn: async () => (await supabase.from("observations").select("pen_id,feed_id,obs_date,offered_g,dish_action").eq("trial_id", trialId!)).data ?? [],
  });
  const biomass = useQuery({
    queryKey: ["trial-biomass", trialId], enabled: !!trialId,
    queryFn: async () => (await supabase.from("biomass_events").select("pen_id,event_date,net_biomass_g,live_count").eq("trial_id", trialId!)).data ?? [],
  });

  const metrics: TrialMetrics | null = useMemo(() => {
    if (!trial.data || !pens.data || !feeds.data || !treatments.data || !assignments.data || !observations.data || !biomass.data) return null;
    const assignedPens = pens.data.filter((p) => assignments.data!.some((a) => a.pen_id === p.id));
    return computeMetrics({
      trial: { id: trial.data.id, start_date: trial.data.start_date, acclimation_days: trial.data.acclimation_days },
      pens: assignedPens,
      feeds: feeds.data,
      treatments: treatments.data,
      assignments: assignments.data,
      observations: observations.data,
      biomass: biomass.data,
      includeAcclimation,
      dryMatter,
    });
  }, [trial.data, pens.data, feeds.data, treatments.data, assignments.data, observations.data, biomass.data, includeAcclimation, dryMatter]);

  if (!trial.isLoading && !trial.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Results</h1>
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No trial is active. <Link to="/trial" className="text-primary underline">Set up and start a trial.</Link>
        </div>
      </div>
    );
  }

  const basis = metrics?.dmBasis ? "dry matter" : "fresh";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-sm text-muted-foreground">
          Every figure is calculated from the records as they stand — correct an entry and the numbers update.
          Treatment figures are the average of the pens in that treatment.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm space-y-3">
        <div className="flex gap-2">
          {(["treatment", "pen"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                view === v ? "border-primary bg-primary/10 text-primary" : "border-border"
              }`}
            >
              {v === "treatment" ? "Treatment means" : "Individual pens"}
            </button>
          ))}
        </div>

        <label
          className={`flex items-center gap-3 text-sm ${metrics?.dmAvailable ? "" : "opacity-50"}`}
          title={metrics?.dmAvailable ? undefined : "Add dry-matter % to all feeds to enable."}
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            disabled={!metrics?.dmAvailable}
            checked={dryMatter && !!metrics?.dmAvailable}
            onChange={(e) => setDryMatter(e.target.checked)}
          />
          <span>
            Show feed on a dry-matter basis
            <span className="block text-xs text-muted-foreground">
              {metrics?.dmAvailable ? `Currently showing ${basis} weight.` : "Add dry-matter % to all feeds to enable."}
            </span>
          </span>
        </label>

        <p className="text-xs text-muted-foreground">
          Acclimation days are {includeAcclimation ? "included" : "excluded"} — change this on the{" "}
          <Link to="/trial" className="text-primary underline">trial page</Link>.
        </p>
      </section>

      {metrics && <Charts metrics={metrics} view={view} />}
      {metrics && <SummaryTable metrics={metrics} />}
      {metrics && trial.data && (
        <PenDetail
          metrics={metrics}
          observations={observations.data ?? []}
          biomass={biomass.data ?? []}
          startDate={trial.data.start_date}
          acclimationDays={trial.data.acclimation_days}
          includeAcclimation={includeAcclimation}
        />
      )}
    </div>
  );
}

/* ---------- charts ---------- */

interface Series { name: string; points: { x: string; y: number | null }[] }

function seriesFor(
  metrics: TrialMetrics,
  view: View,
  pick: (pen: PenMetrics) => { x: string; y: number | null }[],
): Series[] {
  if (view === "pen") {
    return metrics.pens.map((p) => ({ name: p.label, points: pick(p) }));
  }
  return metrics.treatments.map((t) => {
    const perPen = t.pens.map(pick);
    const xs = Array.from(new Set(perPen.flat().map((p) => p.x))).sort();
    return {
      name: t.label,
      points: xs.map((x) => {
        const vals = perPen
          .map((pts) => pts.find((p) => p.x === x)?.y)
          .filter((v): v is number => v != null && Number.isFinite(v));
        return { x, y: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
      }),
    };
  });
}

function LineChartCard({ title, note, series, unit }: { title: string; note?: string; series: Series[]; unit?: string }) {
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort();
  const data = xs.map((x) => {
    const row: Record<string, string | number | null> = { x };
    for (const s of series) row[s.name] = s.points.find((p) => p.x === x)?.y ?? null;
    return row;
  });
  const hasData = data.some((row) => series.some((s) => row[s.name] != null));

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="text-xs text-muted-foreground mb-1">{note}</p>}
      {hasData ? (
        <div className="h-60">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} unit={unit} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s, i) => (
                <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">Not enough recorded data yet.</p>
      )}
    </section>
  );
}

function Charts({ metrics, view }: { metrics: TrialMetrics; view: View }) {
  const basisLabel = metrics.dmBasis ? "dry matter" : "fresh weight";

  const perInterval = seriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ x: i.to, y: i.offeredPerKgGain })));

  const cumulativeConversion = seriesFor(metrics, view, (p) => {
    let offered = 0;
    let gain = 0;
    return p.intervals.map((i) => {
      offered += metrics.dmBasis ? (i.offeredDm_g ?? 0) : i.offered_g;
      gain += i.gain_g ?? 0;
      return { x: i.to, y: gain > 0 ? offered / gain : null };
    });
  });

  const growth = seriesFor(metrics, view, (p) =>
    p.weightSeries.map((w) => ({ x: w.date, y: w.meanWeight })));

  const sgr = seriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ x: i.to, y: i.sgr })));

  const survival = seriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ x: i.to, y: i.survival })));

  const feedingRate = seriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ x: i.to, y: i.feedingRate })));

  const cumulativeOffered = seriesFor(metrics, view, (p) =>
    p.offeredSeries.map((o) => ({ x: o.date, y: o.cumulative })));

  const dishData = metrics.treatments.map((t) => ({
    treatment: t.label,
    "Mean carry-over days": round(t.meanCarryOverDays),
    "Longest carry-over run": round(t.maxCarryOverDays),
    "Spoiled dishes (%)": round(t.spoilageRate),
  }));

  return (
    <>
      <LineChartCard
        title="Feed offered per kg gain — each weighing interval"
        note={`kg of feed offered (${basisLabel}) for every kg of snail gained. Lower is better.`}
        series={perInterval}
      />
      <LineChartCard
        title="Feed offered per kg gain — cumulative"
        note={`Running total since the first weighing (${basisLabel}).`}
        series={cumulativeConversion}
      />
      <LineChartCard
        title="Mean weight per snail"
        note="Grams per snail at each weighing."
        series={growth}
        unit=" g"
      />
      <LineChartCard
        title="Growth rate per day"
        note="Specific growth rate, % per day, for each interval."
        series={sgr}
        unit="%"
      />
      <LineChartCard
        title="Survival"
        note="Percentage of snails surviving each interval."
        series={survival}
        unit="%"
      />
      <LineChartCard
        title="Feeding rate"
        note="Feed offered per day as a percentage of body weight."
        series={feedingRate}
        unit="%"
      />
      <LineChartCard
        title="Cumulative feed offered"
        note="Grams of feed offered since the trial began."
        series={cumulativeOffered}
        unit=" g"
      />

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="font-semibold">Carry-over and spoilage by treatment</h2>
        <p className="text-xs text-muted-foreground mb-1">
          How long dishes are topped up before being emptied, and how often feed spoils.
        </p>
        <div className="h-60">
          <ResponsiveContainer>
            <BarChart data={dishData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="treatment" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Mean carry-over days" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Longest carry-over run" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Spoiled dishes (%)" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}

/* ---------- summary ---------- */

function round(v: number | null | undefined, dp = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Number(v.toFixed(dp));
}

function cell(v: number | null | undefined, dp = 2, suffix = "") {
  const r = round(v, dp);
  return r == null ? "—" : `${r}${suffix}`;
}

function SummaryTable({ metrics }: { metrics: TrialMetrics }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-2">Treatment summary</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Treatment</th>
              <th className="py-2 pr-3">Feed offered (g)</th>
              <th className="py-2 pr-3">Total gain (g)</th>
              <th className="py-2 pr-3">Feed offered per kg gain</th>
              <th className="py-2 pr-3">Growth (%/day)</th>
              <th className="py-2 pr-3">Survival (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {metrics.treatments.map((t) => (
              <tr key={t.treatmentId}>
                <td className="py-2 pr-3 font-medium">{t.label}</td>
                <td className="py-2 pr-3">{cell(t.cumOffered_g, 0)}</td>
                <td className="py-2 pr-3">{cell(t.totalGain_g, 1)}</td>
                <td className="py-2 pr-3">{cell(t.offeredPerKgGain)}</td>
                <td className="py-2 pr-3">{cell(t.meanSgr)}</td>
                <td className="py-2 pr-3">{cell(t.survival, 1)}</td>
              </tr>
            ))}
            {metrics.treatments.length === 0 && (
              <tr><td colSpan={6} className="py-3 text-muted-foreground">No treatments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A figure shows as “—” when it cannot be calculated: no gain, a missing weighing, or a pen with no snails.
      </p>
    </section>
  );
}

/* ---------- pen detail ---------- */

interface PenDetailProps {
  metrics: TrialMetrics;
  observations: { pen_id: string; obs_date: string; offered_g: number | null; dish_action: string | null }[];
  biomass: { pen_id: string; event_date: string; live_count: number }[];
  startDate: string;
  acclimationDays: number;
  includeAcclimation: boolean;
}

function PenDetail({
  metrics, observations, biomass, startDate, acclimationDays, includeAcclimation,
}: PenDetailProps) {
  const navigate = useNavigate({ from: "/results" });
  const { pen: penParam } = Route.useSearch();

  const pens = useMemo(
    () => [...metrics.pens].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [metrics.pens],
  );
  const selected = pens.find((p) => p.penId === penParam) ?? pens[0];

  const acclimationEnd = addDays(startDate, acclimationDays ?? 0);
  const dateIncluded = (d: string) => includeAcclimation || d >= acclimationEnd;

  const rows = useMemo(() => {
    if (!selected) return [];
    const penObs = observations.filter((o) => o.pen_id === selected.penId);
    return selected.intervals.map((iv) => {
      const extras = intervalExtras(iv, penObs, dateIncluded);
      const usable = iv.gain_g != null && iv.gain_g > 0;
      return {
        iv,
        extras,
        liveStart:
          biomass.find((b) => b.pen_id === selected.penId && b.event_date === iv.from)?.live_count ?? null,
        perKgFresh: usable ? iv.offered_g / iv.gain_g! : null,
        perKgDm: usable && iv.offeredDm_g != null ? iv.offeredDm_g / iv.gain_g! : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, observations, biomass, includeAcclimation, acclimationEnd]);

  if (!selected) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const totalGain = selected.totalGain_g;
  const totals = {
    days: rows.reduce((s, r) => s + daysBetween(r.iv.from, r.iv.to), 0),
    liveStart: first?.liveStart ?? null,
    liveEnd: last?.iv.survivingCount ?? null,
    meanWeightStart: first && Number.isFinite(first.iv.meanWeight1) ? first.iv.meanWeight1 : null,
    meanWeightEnd: last && Number.isFinite(last.iv.meanWeight2) ? last.iv.meanWeight2 : null,
    gain: totalGain,
    offered: selected.cumOffered_g,
    perKgFresh: totalGain != null && totalGain > 0 ? selected.cumOffered_g / totalGain : null,
    perKgDm:
      totalGain != null && totalGain > 0 && selected.cumOfferedDm_g != null
        ? selected.cumOfferedDm_g / totalGain
        : null,
    sgr: selected.meanSgr,
    survival: selected.survival,
    missing: rows.reduce((s, r) => s + r.extras.missingFeedingDays, 0),
    maxCarry: selected.maxCarryOverDays,
    spoilage: meanOf(rows.map((r) => r.extras.spoilageRate)),
  };

  const headers = [
    "Start", "End", "Days", "Live start", "Live end", "Mean wt start (g)", "Mean wt end (g)",
    "Gain (g)", "Feed offered (g)", "Feed / kg gain", "Feed / kg gain (DM)", "SGR (%/day)",
    "Survival (%)", "Missing feeding days", "Max carry-over days", "Spoilage (%)",
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">Pen detail</h2>
      <p className="text-xs text-muted-foreground mb-2">
        One row for each weighing interval in the selected pen.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {pens.map((p) => (
          <button
            key={p.penId}
            type="button"
            onClick={() => navigate({ search: { pen: p.penId }, replace: true })}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              p.penId === selected.penId
                ? "border-primary bg-primary/10 text-primary"
                : "border-border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              {headers.map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {rows.map((r) => (
              <tr key={`${r.iv.from}-${r.iv.to}`}>
                <td className="py-2 pr-3">{r.iv.from}</td>
                <td className="py-2 pr-3">{r.iv.to}</td>
                <td className="py-2 pr-3">{daysBetween(r.iv.from, r.iv.to)}</td>
                <td className="py-2 pr-3">{r.liveStart ?? "—"}</td>
                <td className="py-2 pr-3">{r.iv.survivingCount}</td>
                <td className="py-2 pr-3">{cell(Number.isFinite(r.iv.meanWeight1) ? r.iv.meanWeight1 : null)}</td>
                <td className="py-2 pr-3">{cell(Number.isFinite(r.iv.meanWeight2) ? r.iv.meanWeight2 : null)}</td>
                <td className="py-2 pr-3">{cell(r.iv.gain_g, 1)}</td>
                <td className="py-2 pr-3">{cell(r.iv.offered_g, 0)}</td>
                <td className="py-2 pr-3">{cell(r.perKgFresh)}</td>
                <td className="py-2 pr-3">{cell(r.perKgDm)}</td>
                <td className="py-2 pr-3">{cell(r.iv.sgr)}</td>
                <td className="py-2 pr-3">{cell(r.iv.survival, 1)}</td>
                <td className="py-2 pr-3">{r.extras.missingFeedingDays}</td>
                <td className="py-2 pr-3">{cell(r.extras.maxCarryOverDays, 0)}</td>
                <td className="py-2 pr-3">{cell(r.extras.spoilageRate, 1)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="py-3 text-muted-foreground whitespace-normal">
                  This pen needs at least two weighings before intervals can be shown.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-medium tabular-nums">
                <td className="py-2 pr-3" colSpan={2}>Trial to date</td>
                <td className="py-2 pr-3">{totals.days}</td>
                <td className="py-2 pr-3">{totals.liveStart ?? "—"}</td>
                <td className="py-2 pr-3">{totals.liveEnd ?? "—"}</td>
                <td className="py-2 pr-3">{cell(totals.meanWeightStart)}</td>
                <td className="py-2 pr-3">{cell(totals.meanWeightEnd)}</td>
                <td className="py-2 pr-3">{cell(totals.gain, 1)}</td>
                <td className="py-2 pr-3">{cell(totals.offered, 0)}</td>
                <td className="py-2 pr-3">{cell(totals.perKgFresh)}</td>
                <td className="py-2 pr-3">{cell(totals.perKgDm)}</td>
                <td className="py-2 pr-3">{cell(totals.sgr)}</td>
                <td className="py-2 pr-3">{cell(totals.survival, 1)}</td>
                <td className="py-2 pr-3">{totals.missing}</td>
                <td className="py-2 pr-3">{cell(totals.maxCarry, 0)}</td>
                <td className="py-2 pr-3">{cell(totals.spoilage, 1)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A figure shows as “—” when it cannot be calculated: no gain, a missing weighing, or a pen with no snails.
      </p>
    </section>
  );
}
