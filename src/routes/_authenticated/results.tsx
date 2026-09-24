import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSiteTrial } from "@/lib/siteScope";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { retentionContext } from "@/lib/retention";
import {
  computeMetrics, daysBetween, intervalExtras, meanOf, addDays, incompleteLabel, makeRetention, feedingShare, portionChanges, meanOf as meanOfValues,
  METRIC_EXPLANATIONS, METRIC_LABELS,
  type PenMetrics, type TrialMetrics,
} from "@/lib/metrics";
import { readIncludeAcclimation } from "@/lib/acclimation";
import { useAllSiteCalendars } from "@/lib/operatingDays";
import { WeighingReport } from "@/components/WeighingReport";

import {
  XAxis, YAxis, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, CartesianGrid, ComposedChart, Bar, Cell, ReferenceArea, Scatter,
} from "recharts";

export const Route = createFileRoute("/_authenticated/results")({
  component: ResultsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    pen: typeof search['pen'] === "string" ? search['pen'] : "",
    from: typeof search['from'] === "string" ? search['from'] : "",
    to: typeof search['to'] === "string" ? search['to'] : "",
    hide: typeof search['hide'] === "string" ? search['hide'] : "",
    hs: typeof search['hs'] === "string" ? search['hs'] : "",
    weighing: typeof search['weighing'] === "string" ? search['weighing'] : "",
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

function fmtShort(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function listToSet(v: string) {
  return new Set(v.split(",").map((s) => s.trim()).filter(Boolean));
}

function ResultsPage() {
  const [view, setView] = useState<View>("treatment");
  const [dryMatter, setDryMatter] = useState(false);
  const includeAcclimation = readIncludeAcclimation();

  const navigate = useNavigate({ from: "/results" });
  const search = Route.useSearch();
  const hiddenColumns = useMemo(() => listToSet(search.hide), [search.hide]);
  const hiddenSeries = useMemo(() => listToSet(search.hs), [search.hs]);

  const { calendarFor } = useAllSiteCalendars();
  // The active trial of the site selected in the header — never "first active trial found".
  const trial = useSiteTrial();
  const trialId = trial.data?.id;
  // Closed days never count as missing feeding days.
  const isOperating = calendarFor(trial.data?.site_id).isOperating;

  // Results span every site, so each pen is named with its site: "Pen 1" exists at both.
  const pens = useQuery({
    queryKey: ["pens", "with-site"],
    queryFn: async () => {
      const [{ data: rows }, { data: sites }] = await Promise.all([
        supabase.from("pens").select("id,label,site_id,role").order("label"),
        supabase.from("sites").select("id,name"),
      ]);
      const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));
      // Breeder pens never enter a treatment mean, so Results drops them here.
      return (rows ?? []).filter((p) => p.role !== "breeder").map((p) => ({
        id: p.id,
        label: siteName.get(p.site_id) ? `${p.label} · ${siteName.get(p.site_id)}` : p.label,
      }));
    },
  });

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
    queryFn: async () => (await supabase.from("observations").select("pen_id,feed_id,obs_date,offered_g,dish_action,leftover_g,refusal_score").eq("trial_id", trialId!)).data ?? [],
  });
  const biomass = useQuery({
    queryKey: ["trial-biomass", trialId], enabled: !!trialId,
    queryFn: async () => (await supabase.from("biomass_events").select("pen_id,event_date,net_biomass_g,live_count").eq("trial_id", trialId!)).data ?? [],
  });

  const controlReadings = useQuery({
    queryKey: ["moisture-controls", trialId, trial.data?.control_feed_id], enabled: !!trialId,
    queryFn: async () => (await supabase.from("moisture_controls").select("obs_date,offered_g,remaining_g,feed_id").eq("trial_id", trialId!)).data ?? [],
  });
  const siteCalendar = calendarFor(trial.data?.site_id);
  const retention = useMemo(
    () => retentionContext(
      trial.data?.control_feed_id,
      (controlReadings.data ?? [])
        .filter((c) => c.feed_id === trial.data?.control_feed_id)
        .map((c) => ({ obs_date: c.obs_date, offered_g: Number(c.offered_g), remaining_g: c.remaining_g == null ? null : Number(c.remaining_g) })),
      siteCalendar,
    ),
    [controlReadings.data, trial.data?.control_feed_id, siteCalendar],
  );

  // Breeder pens are never part of a treatment mean, so Results never sees them.
  const assignedPens = useMemo(
    () =>
      (pens.data ?? [])
        .filter((p) => (assignments.data ?? []).some((a) => a.pen_id === p.id))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [pens.data, assignments.data],
  );

  // "" = all pens, "none" = none, otherwise a comma-separated list of pen ids.
  const selectedPenIds = useMemo(() => {
    if (search.pen === "none") return new Set<string>();
    if (!search.pen) return new Set(assignedPens.map((p) => p.id));
    const want = listToSet(search.pen);
    return new Set(assignedPens.filter((p) => want.has(p.id)).map((p) => p.id));
  }, [search.pen, assignedPens]);

  // Weighing dates kept by the range filter. Because a range is contiguous,
  // keeping only the weighings inside it means every interval that survives has
  // BOTH of its weighing dates inside the range.
  const weighDates = useMemo(
    () => Array.from(new Set((biomass.data ?? []).map((b) => b.event_date))).sort(),
    [biomass.data],
  );
  const keptDates = useMemo(
    () => weighDates.filter((d) => (!search.from || d >= search.from) && (!search.to || d <= search.to)),
    [weighDates, search.from, search.to],
  );
  const selectedIntervals = useMemo(
    () => keptDates.slice(1).map((to, i) => ({ from: keptDates[i]!, to })),
    [keptDates],
  );
  const rangeStart = keptDates[0];
  const rangeEnd = keptDates[keptDates.length - 1];

  // Feed offered is only ever summed across the same days the intervals cover.
  const scopedBiomass = useMemo(
    () => (biomass.data ?? []).filter((b) => keptDates.includes(b.event_date) && selectedPenIds.has(b.pen_id)),
    [biomass.data, keptDates, selectedPenIds],
  );
  const scopedObservations = useMemo(
    () =>
      rangeStart && rangeEnd
        ? (observations.data ?? [])
            .filter(
              (o) => o.feed_id != null && o.obs_date >= rangeStart && o.obs_date < rangeEnd && selectedPenIds.has(o.pen_id),
            )
            .map((o) => ({ ...o, feed_id: o.feed_id as string }))
        : [],
    [observations.data, rangeStart, rangeEnd, selectedPenIds],
  );

  const metrics: TrialMetrics | null = useMemo(() => {
    if (!trial.data || !pens.data || !feeds.data || !treatments.data || !assignments.data || !observations.data || !biomass.data) return null;
    if (selectedIntervals.length === 0 || selectedPenIds.size === 0) return null;
    return computeMetrics({
      trial: { id: trial.data.id, start_date: trial.data.start_date, acclimation_days: trial.data.acclimation_days },
      pens: assignedPens.filter((p) => selectedPenIds.has(p.id)),
      feeds: feeds.data,
      treatments: treatments.data,
      assignments: assignments.data.filter((a) => selectedPenIds.has(a.pen_id)),
      observations: scopedObservations,
      biomass: scopedBiomass,
      includeAcclimation,
      dryMatter,
      retention,
    });
  }, [retention, trial.data, pens.data, feeds.data, treatments.data, assignments.data, observations.data, biomass.data, assignedPens, selectedPenIds, scopedObservations, scopedBiomass, selectedIntervals.length, includeAcclimation, dryMatter]);


  // "Weighing of <date>": the same metrics, over every recorded day, for the
  // pens whose interval ends on that weighing.
  const closedSessions = useQuery({
    queryKey: ["weighing-sessions", trial.data?.site_id],
    enabled: !!trial.data?.site_id,
    queryFn: async () =>
      (await supabase.from("weighing_sessions").select("session_date,closed_at").eq("site_id", trial.data!.site_id).not("closed_at", "is", null).order("session_date", { ascending: false })).data ?? [],
  });
  const weighingInput = useMemo(() => {
    if (!search.weighing || !trial.data || !feeds.data || !treatments.data || !assignments.data || !observations.data || !biomass.data) return null;
    return {
      trial: { id: trial.data.id, start_date: trial.data.start_date, acclimation_days: trial.data.acclimation_days },
      pens: assignedPens,
      feeds: feeds.data,
      treatments: treatments.data,
      assignments: assignments.data,
      observations: observations.data.filter((o) => o.feed_id != null).map((o) => ({ ...o, feed_id: o.feed_id as string })),
      biomass: biomass.data,
      includeAcclimation,
      dryMatter,
      retention,
    };
  }, [search.weighing, trial.data, feeds.data, treatments.data, assignments.data, observations.data, biomass.data, assignedPens, includeAcclimation, dryMatter, retention]);

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

  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const toggleSeries = (name: string) => {
    const next = new Set(hiddenSeries);
    if (next.has(name)) next.delete(name); else next.add(name);
    setSearch({ hs: Array.from(next).join(",") });
  };
  const setPens = (ids: string[]) => {
    if (ids.length === 0) return setSearch({ pen: "none" });
    if (ids.length === assignedPens.length) return setSearch({ pen: "" });
    setSearch({ pen: ids.join(",") });
  };
  const addPen = (id: string) => assignedPens.map((p) => p.id).filter((x) => selectedPenIds.has(x) || x === id);
  const removePen = (id: string) => assignedPens.map((p) => p.id).filter((x) => selectedPenIds.has(x) && x !== id);


  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-sm text-muted-foreground">
          Every figure is calculated from the records as they stand — correct an entry and the numbers update.
          Treatment figures are the average of the pens in that treatment.
        </p>
      </header>

      {search.weighing && (
        <WeighingReport
          input={weighingInput}
          sessions={closedSessions.data ?? []}
          date={search.weighing}
          onPick={(d) => void navigate({ search: (prev) => ({ ...prev, weighing: d }) })}
        />
      )}

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm space-y-3">
        <div className="flex items-end gap-2">
          <label className="flex-1 text-xs text-muted-foreground">
            From
            <input
              type="date"
              value={search.from}
              min={weighDates[0] ?? undefined}
              max={weighDates[weighDates.length - 1] ?? undefined}
              onChange={(e) => setSearch({ from: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            />
          </label>
          <label className="flex-1 text-xs text-muted-foreground">
            To
            <input
              type="date"
              value={search.to}
              min={weighDates[0] ?? undefined}
              max={weighDates[weighDates.length - 1] ?? undefined}
              onChange={(e) => setSearch({ to: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground"
            />
          </label>
        </div>

        <p className="text-sm">
          {selectedIntervals.length === 0 ? (
            <span className="text-destructive">
              No complete weighing interval in this range. Widen the dates.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Showing {selectedIntervals.length}{" "}
              {selectedIntervals.length === 1 ? "interval" : "intervals"}:{" "}
              {selectedIntervals.map((i) => `${fmtShort(i.from)} – ${fmtShort(i.to)}`).join(", ")}.
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={() => navigate({ search: { pen: "", from: "", to: "", hide: "", hs: "", weighing: search.weighing }, replace: true })}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium"
        >
          Reset view
        </button>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase text-muted-foreground">Pens</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSearch({ pen: "" })}
                className="rounded-lg border border-border px-2 py-1 text-xs font-medium">Select all</button>
              <button type="button" onClick={() => setSearch({ pen: "none" })}
                className="rounded-lg border border-border px-2 py-1 text-xs font-medium">Clear all</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {assignedPens.map((p) => {
              const on = selectedPenIds.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPens(on ? removePen(p.id) : addPen(p.id))}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    on ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

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
              {v === "treatment" ? "Group by treatment" : "Group by pen"}
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
            Show {METRIC_LABELS.biologicalFcr} on a dry-matter basis
            <span className="block text-xs text-muted-foreground">
              {metrics?.dmAvailable ? metrics.dmBasis ? `${METRIC_LABELS.biologicalFcrDm}: ${METRIC_EXPLANATIONS.biologicalFcrDm}.` : `${METRIC_LABELS.biologicalFcr}: ${METRIC_EXPLANATIONS.biologicalFcr}.` : "Add dry-matter % to all feeds to enable."}
            </span>
          </span>
        </label>

        <p className="text-xs text-muted-foreground">
          Acclimation days are {includeAcclimation ? "included" : "excluded"} — change this on the{" "}
          <Link to="/trial" className="text-primary underline">trial page</Link>.
        </p>
      </section>

      {selectedPenIds.size === 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          Select at least one pen.
        </div>
      )}

      {metrics && trial.data && (

        <PenDetail
          metrics={metrics}
          observations={scopedObservations}
          isOperating={isOperating}
          biomass={scopedBiomass}
          startDate={trial.data.start_date}
          acclimationDays={trial.data.acclimation_days}
          includeAcclimation={includeAcclimation}
          hiddenColumns={hiddenColumns}
          onToggleColumn={(key) => {
            const next = new Set(hiddenColumns);
            if (next.has(key)) next.delete(key); else next.add(key);
            setSearch({ hide: Array.from(next).join(",") });
          }}
        />
      )}
      {metrics && rangeStart && rangeEnd && (
        <Charts
          metrics={metrics}
          view={view}
          domain={[rangeStart, rangeEnd]}
          observations={scopedObservations}
          isOperating={isOperating}
          startDate={trial.data?.start_date ?? rangeStart}
          acclimationDays={trial.data?.acclimation_days ?? 0}
          includeAcclimation={includeAcclimation}
          hiddenSeries={hiddenSeries}
          onToggleSeries={toggleSeries}
        />
      )}

      {metrics && trial.data && (
        <PortionsChart
          metrics={metrics}
          view={view}
          observations={observations.data ?? []}
          retentionFor={makeRetention(retention)}
          isOperating={isOperating}
          from={search.from}
          to={search.to}
          targetMin={Number(trial.data.target_left_min_pct)}
          targetMax={Number(trial.data.target_left_max_pct)}
        />
      )}

      {metrics && <SummaryTable metrics={metrics} />}
      {metrics && trial.data?.control_feed_id && (
        <p className="text-xs text-muted-foreground">
          Water-loss correction for {(feeds.data ?? []).find((f) => f.id === trial.data?.control_feed_id)?.name ?? "the control feed"}:{" "}
          {(() => {
            const r = makeRetention(retention)(trial.data?.control_feed_id, rangeEnd ?? "");
            return r.status === "not tested"
              ? "not tested — leftovers are not corrected."
              : `${r.status}, ${(r.retentionNight * 100).toFixed(1)}% of weight kept per night. Every observation's status is in the observations export.`;
          })()}
        </p>
      )}
    </div>
  );
}

/* ---------- charts ---------- */

const ms = (d: string) => Date.parse(`${d}T00:00:00`);

interface Series { name: string; points: { x: string; y: number | null }[] }
interface Span { from: string; to: string; y: number | null }
interface SpanSeries { name: string; spans: Span[] }

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

/** Same averaging rule as seriesFor, but for values that cover a date span. */
function spanSeriesFor(
  metrics: TrialMetrics,
  view: View,
  pick: (pen: PenMetrics) => Span[],
): SpanSeries[] {
  if (view === "pen") {
    return metrics.pens.map((p) => ({ name: p.label, spans: pick(p) }));
  }
  return metrics.treatments.map((t) => {
    const perPen = t.pens.map(pick);
    const keys = Array.from(new Set(perPen.flat().map((s) => `${s.from}|${s.to}`))).sort();
    return {
      name: t.label,
      spans: keys.map((k) => {
        const [from, to] = k.split("|") as [string, string];
        const vals = perPen
          .map((sp) => sp.find((s) => s.from === from && s.to === to)?.y)
          .filter((v): v is number => v != null && Number.isFinite(v));
        return { from, to, y: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
      }),
    };
  });
}

interface ToggleProps { hiddenSeries: Set<string>; onToggleSeries: (name: string) => void }
type Domain = [string, string];

function ChartLegend({ hiddenSeries, onToggleSeries }: ToggleProps) {
  return (
    <Legend
      wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
      onClick={(e) => onToggleSeries(String((e as { dataKey?: unknown }).dataKey ?? e.value))}
      formatter={(value: string) => (
        <span style={{ opacity: hiddenSeries.has(value) ? 0.4 : 1 }}>{value}</span>
      )}
    />
  );
}

function timeAxisProps(domain: Domain, ticks: number[]) {
  return {
    dataKey: "x" as const,
    type: "number" as const,
    scale: "time" as const,
    domain: [ms(domain[0]), ms(domain[1])] as [number, number],
    ticks,
    tickFormatter: (v: number) => fmtShort(new Date(v).toISOString().slice(0, 10)),
    tick: { fontSize: 10 },
  };
}

function LineChartCard({
  title, note, series, unit, domain, hiddenSeries, onToggleSeries,
}: { title: string; note?: string; series: Series[]; unit?: string; domain: Domain } & ToggleProps) {
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort();
  const data = xs.map((x) => {
    const row: Record<string, number | null> = { x: ms(x) };
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
              <XAxis {...timeAxisProps(domain, xs.map(ms))} />
              <YAxis tick={{ fontSize: 10 }} unit={unit} />
              <Tooltip formatter={(v: number | string) => (typeof v === "number" ? Number(v.toFixed(2)) : v)} labelFormatter={(v) => fmtShort(new Date(Number(v)).toISOString().slice(0, 10))} />
              <ChartLegend hiddenSeries={hiddenSeries} onToggleSeries={onToggleSeries} />
              {series.map((s, i) => (
                <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]}
                  hide={hiddenSeries.has(s.name)}
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

/**
 * A metric measured over a period is drawn as a step held flat across the whole
 * interval, from its start date to its end date. Intervals with no value leave
 * a gap — nothing is plotted as zero.
 */
function IntervalChartCard({
  title, note, series, unit, domain, hiddenSeries, onToggleSeries,
}: { title: string; note?: string; series: SpanSeries[]; unit?: string; domain: Domain } & ToggleProps) {
  const edges = Array.from(
    new Set(series.flatMap((s) => s.spans.flatMap((sp) => [sp.from, sp.to]))),
  ).sort();

  const data = edges.map((x, idx) => {
    const row: Record<string, number | null> = { x: ms(x) };
    for (const s of series) {
      const covering = s.spans.find((sp) => sp.from <= x && x < sp.to);
      const ending = idx === edges.length - 1 ? s.spans.find((sp) => sp.to === x) : undefined;
      row[s.name] = (covering ?? ending)?.y ?? null;
    }
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
              <XAxis {...timeAxisProps(domain, edges.map(ms))} />
              <YAxis tick={{ fontSize: 10 }} unit={unit} />
              <Tooltip formatter={(v: number | string) => (typeof v === "number" ? Number(v.toFixed(2)) : v)} labelFormatter={(v) => fmtShort(new Date(Number(v)).toISOString().slice(0, 10))} />
              <ChartLegend hiddenSeries={hiddenSeries} onToggleSeries={onToggleSeries} />
              {series.map((s, i) => (
                <Line
                  key={s.name}
                  type="stepAfter"
                  dataKey={s.name}
                  stroke={COLORS[i % COLORS.length]}
                  hide={hiddenSeries.has(s.name)}
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 3 }}
                  connectNulls={false}
                />
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

function Charts({
  metrics, view, domain, observations, isOperating, startDate, acclimationDays, includeAcclimation,
  hiddenSeries, onToggleSeries,
}: {
  metrics: TrialMetrics;
  view: View;
  domain: Domain;
  observations: { pen_id: string; obs_date: string; offered_g: number | null; dish_action: string | null }[];
  isOperating: (d: string) => boolean;
  startDate: string;
  acclimationDays: number;
  includeAcclimation: boolean;
} & ToggleProps) {
  const dm = metrics.dmBasis;
  const toggles = { hiddenSeries, onToggleSeries, domain };

  const acclimationEnd = addDays(startDate, acclimationDays ?? 0);
  const dateIncluded = (d: string) => includeAcclimation || d >= acclimationEnd;
  
  const eatenPerInterval = spanSeriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ from: i.from, to: i.to, y: dm ? i.eatenDmPerKgGain : i.eatenPerKgGain })));

  const shareLeft = spanSeriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ from: i.from, to: i.to, y: i.meanShareLeft != null ? i.meanShareLeft * 100 : null })));

  const perInterval = spanSeriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ from: i.from, to: i.to, y: i.offeredPerKgGain })));

  const cumulativeConversion = seriesFor(metrics, view, (p) => {
    let offered = 0;
    let gain = 0;
    return p.intervals.map((i) => {
      offered += i.offered_g;
      gain += i.gain_g ?? 0;
      return { x: i.to, y: gain > 0 ? offered / gain : null };
    });
  });

  const growth = seriesFor(metrics, view, (p) =>
    p.weightSeries.map((w) => ({ x: w.date, y: w.meanWeight })));

  const sgr = spanSeriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ from: i.from, to: i.to, y: i.sgr })));

  const survival = spanSeriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ from: i.from, to: i.to, y: i.survival })));

  const feedingRate = spanSeriesFor(metrics, view, (p) =>
    p.intervals.map((i) => ({ from: i.from, to: i.to, y: i.feedingRate })));

  const cumulativeOffered = seriesFor(metrics, view, (p) =>
    p.offeredSeries.map((o) => ({ x: o.date, y: o.cumulative })));

  return (
    <>
      <IntervalChartCard
        title={`${dm ? METRIC_LABELS.biologicalFcrDm : METRIC_LABELS.biologicalFcr} — each weighing interval`}
        note={`kg of ${dm ? "dry matter eaten (feed eaten × the feed's dry-matter %" : "feed eaten (fresh weight"}, offered minus the weighed leftover, leaves corrected for water loss) per kg of snail gained. Shown only where at least 90% of feedings had a weighed leftover — otherwise eaten is not yet measured for this period.`}
        series={eatenPerInterval}
        {...toggles}
      />
      <IntervalChartCard
        title="Mean share left per interval"
        note="Leftover as a share of feed offered. Target band 5–10%."
        series={shareLeft}
        unit="%"
        {...toggles}
      />
      <IntervalChartCard
        title={`${METRIC_LABELS.economicFcr} — each weighing interval`}
        note={`kg of feed offered (fresh weight) for every kg of snail gained, held flat across the interval it covers. Lower is better. Tap a name in the key to hide or show it.`}
        series={perInterval}
        {...toggles}
      />
      <LineChartCard
        title={`${METRIC_LABELS.economicFcr} — cumulative`}
        note="Running total since the first weighing in range (fresh weight)."
        series={cumulativeConversion}
        {...toggles}
      />
      <LineChartCard
        title="Mean weight per snail"
        note="Grams per snail at each weighing."
        series={growth}
        unit=" g"
        {...toggles}
      />
      <IntervalChartCard
        title={METRIC_LABELS.sgr}
        note={`${METRIC_EXPLANATIONS.sgr}, across each weighing interval.`}
        series={sgr}
        unit="%"
        {...toggles}
      />
      <IntervalChartCard
        title="Survival"
        note="Percentage of snails surviving across each weighing interval."
        series={survival}
        unit="%"
        {...toggles}
      />
      <IntervalChartCard
        title="Feeding rate"
        note="Feed offered per day as a percentage of body weight, across each interval."
        series={feedingRate}
        unit="%"
        {...toggles}
      />
      <LineChartCard
        title="Cumulative feed offered"
        note="Grams of feed offered across the selected intervals."
        series={cumulativeOffered}
        unit=" g"
        {...toggles}
      />
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
  const dm = metrics.dmBasis;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-2">Treatment summary</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-2 pr-3">Treatment</th>
              <th className="py-2 pr-3">{dm ? METRIC_LABELS.biologicalFcrDm : METRIC_LABELS.biologicalFcr}</th>
              <th className="py-2 pr-3">{dm ? "Dry matter eaten (g)" : "Feed eaten (g)"}</th>
              <th className="py-2 pr-3">Share left (%)</th>
              <th className="py-2 pr-3">Feed offered (g)</th>
              <th className="py-2 pr-3">Total gain (g)</th>
              <th className="py-2 pr-3">{METRIC_LABELS.economicFcr}</th>
              <th className="py-2 pr-3">{METRIC_LABELS.sgr}</th>
              <th className="py-2 pr-3">Survival (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {metrics.treatments.map((t) => (
              <tr key={t.treatmentId}>
                <td className="py-2 pr-3 font-medium">{t.label}</td>
                <td className="py-2 pr-3">
                  {dm && t.dmMissing ? (
                    <span className="text-xs text-muted-foreground">add dry-matter % in Setup</span>
                  ) : (dm ? t.eatenDmPerKgGain : t.eatenPerKgGain) != null ? cell(dm ? t.eatenDmPerKgGain : t.eatenPerKgGain) : (
                    <span className="text-xs text-muted-foreground">
                      {cell(t.offeredPerKgGain)} offered — eaten not yet measured for this period ({t.eatenCompletePens} of {t.pens.length} pens complete)
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">{cell(dm ? t.cumEatenDm_g : t.cumEaten_g, 1)}</td>
                <td className="py-2 pr-3">{cell(t.meanShareLeft != null ? t.meanShareLeft * 100 : null, 1)}</td>
                <td className="py-2 pr-3">{cell(t.cumOffered_g, 1)}</td>
                <td className="py-2 pr-3">{cell(t.totalGain_g, 1)}</td>
                <td className="py-2 pr-3">{cell(t.offeredPerKgGain)}</td>
                <td className="py-2 pr-3">{cell(t.meanSgr)}</td>
                <td className="py-2 pr-3">{cell(t.survival, 1)}</td>
              </tr>
            ))}
            {metrics.treatments.length === 0 && (
              <tr><td colSpan={9} className="py-3 text-muted-foreground">No treatments yet.</td></tr>
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
  isOperating: (d: string) => boolean;
  biomass: { pen_id: string; event_date: string; live_count: number }[];
  startDate: string;
  acclimationDays: number;
  includeAcclimation: boolean;
  hiddenColumns: Set<string>;
  onToggleColumn: (key: string) => void;
}

const PEN_COLUMNS = [
  { key: "pen", label: "Pen" },
  { key: "from", label: "Start" },
  { key: "to", label: "End" },
  { key: "days", label: "Days" },
  { key: "liveStart", label: "Live start" },
  { key: "liveEnd", label: "Live end" },
  { key: "mwStart", label: "Mean wt start (g)" },
  { key: "mwEnd", label: "Mean wt end (g)" },
  { key: "gain", label: "Gain (g)" },
  { key: "fcrEaten", label: METRIC_LABELS.biologicalFcr },
  { key: "eaten", label: "Feed eaten (g)" },
  { key: "coverage", label: "Leftover coverage (%)" },
  { key: "shareLeft", label: "Share left (%)" },
  { key: "offered", label: "Feed offered (g)" },
  { key: "perKgFresh", label: METRIC_LABELS.economicFcr },
  { key: "fcrDm", label: METRIC_LABELS.biologicalFcrDm },
  { key: "eatenDm", label: "Dry matter eaten (g)" },
  { key: "sgr", label: METRIC_LABELS.sgr },
  { key: "survival", label: "Survival (%)" },
  { key: "missing", label: "Missing feeding days" },
] as const;

function PenDetail({
  metrics, observations, isOperating, biomass, startDate, acclimationDays, includeAcclimation,
  hiddenColumns, onToggleColumn,
}: PenDetailProps) {
  const [chooserOpen, setChooserOpen] = useState(false);

  const acclimationEnd = addDays(startDate, acclimationDays ?? 0);

  const penBlocks = useMemo(() => {
    const dateIncluded = (d: string) => includeAcclimation || d >= acclimationEnd;
    const sorted = [...metrics.pens].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }));
    return sorted.map((pen) => {
      const penObs = observations.filter((o) => o.pen_id === pen.penId);
      const rows = [...pen.intervals]
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((iv) => {
          const extras = intervalExtras(iv, penObs, dateIncluded, isOperating);
          const usable = iv.gain_g != null && iv.gain_g > 0;
          return {
            iv,
            extras,
            liveStart:
              biomass.find((b) => b.pen_id === pen.penId && b.event_date === iv.from)?.live_count ?? null,
            perKgFresh: usable ? iv.offered_g / iv.gain_g! : null,
          };
        });
      const first = rows[0];
      const last = rows[rows.length - 1];
      const totalGain = pen.totalGain_g;
      const totals = {
        days: rows.reduce((s, r) => s + daysBetween(r.iv.from, r.iv.to), 0),
        liveStart: first?.liveStart ?? null,
        liveEnd: last?.iv.survivingCount ?? null,
        meanWeightStart: first && Number.isFinite(first.iv.meanWeight1) ? first.iv.meanWeight1 : null,
        meanWeightEnd: last && Number.isFinite(last.iv.meanWeight2) ? last.iv.meanWeight2 : null,
        gain: totalGain,
        offered: pen.cumOffered_g,
        perKgFresh: totalGain != null && totalGain > 0 ? pen.cumOffered_g / totalGain : null,
        fcrDm: pen.eatenDmPerKgGain,
        eatenDm: pen.cumEatenDm_g,
        dmMissing: pen.dmMissing,
        sgr: pen.meanSgr,
        survival: pen.survival,
        missing: rows.reduce((s, r) => s + r.extras.missingFeedingDays, 0),
        fcrEaten: pen.eatenPerKgGain,
        eaten: pen.cumEaten_g,
        leftoverDays: pen.leftoverDays,
        feedingDays: pen.feedingDays,
        coverage: pen.leftoverCoverage,
        shareLeft: pen.meanShareLeft,
      };
      return { pen, rows, totals };
    });
  }, [metrics.pens, observations, biomass, includeAcclimation, acclimationEnd]);

  const visible = PEN_COLUMNS.filter((c) => !hiddenColumns.has(c.key));

  type Block = (typeof penBlocks)[number];

  const rowValue = (key: string, label: string, r: Block["rows"][number]) => {
    switch (key) {
      case "pen": return label;
      case "from": return r.iv.from;
      case "to": return r.iv.to;
      case "days": return daysBetween(r.iv.from, r.iv.to);
      case "liveStart": return r.liveStart ?? "—";
      case "liveEnd": return r.iv.survivingCount;
      case "mwStart": return cell(Number.isFinite(r.iv.meanWeight1) ? r.iv.meanWeight1 : null);
      case "mwEnd": return cell(Number.isFinite(r.iv.meanWeight2) ? r.iv.meanWeight2 : null);
      case "gain": return cell(r.iv.gain_g, 1);
      case "offered": return cell(r.iv.offered_g, 1);
      case "perKgFresh": return cell(r.perKgFresh);
      case "fcrDm": return r.iv.dmMissing ? "add dry-matter % in Setup" : r.iv.eatenDmPerKgGain != null ? cell(r.iv.eatenDmPerKgGain) : r.iv.gain_g != null && r.iv.gain_g > 0 ? incompleteLabel(r.iv.leftoverDays, r.iv.feedingDays) : "—";
      case "eatenDm": return r.iv.dmMissing ? "add dry-matter % in Setup" : cell(r.iv.eatenDm_g, 1);
      case "sgr": return cell(r.iv.sgr);
      case "survival": return cell(r.iv.survival, 1);
      case "missing": return r.extras.missingFeedingDays;
      case "fcrEaten": return r.iv.eatenPerKgGain != null ? cell(r.iv.eatenPerKgGain) : r.iv.gain_g != null && r.iv.gain_g > 0 ? incompleteLabel(r.iv.leftoverDays, r.iv.feedingDays) : "—";
      case "eaten": return cell(r.iv.eaten_g, 1);
      case "coverage": return cell(r.iv.leftoverCoverage != null ? r.iv.leftoverCoverage * 100 : null, 0);
      case "shareLeft": return cell(r.iv.meanShareLeft != null ? r.iv.meanShareLeft * 100 : null, 1);
      default: return "";
    }
  };

  const totalValue = (key: string, label: string, totals: Block["totals"]) => {
    switch (key) {
      case "pen": return label;
      case "from": return "Trial to date";
      case "to": return "";
      case "days": return totals.days;
      case "liveStart": return totals.liveStart ?? "—";
      case "liveEnd": return totals.liveEnd ?? "—";
      case "mwStart": return cell(totals.meanWeightStart);
      case "mwEnd": return cell(totals.meanWeightEnd);
      case "gain": return cell(totals.gain, 1);
      case "offered": return cell(totals.offered, 1);
      case "perKgFresh": return cell(totals.perKgFresh);
      case "fcrDm": return totals.dmMissing ? "add dry-matter % in Setup" : totals.fcrDm != null ? cell(totals.fcrDm) : totals.gain != null && totals.gain > 0 ? incompleteLabel(totals.leftoverDays, totals.feedingDays) : "—";
      case "eatenDm": return totals.dmMissing ? "add dry-matter % in Setup" : cell(totals.eatenDm, 1);
      case "sgr": return cell(totals.sgr);
      case "survival": return cell(totals.survival, 1);
      case "missing": return totals.missing;
      case "fcrEaten": return totals.fcrEaten != null ? cell(totals.fcrEaten) : totals.gain != null && totals.gain > 0 ? incompleteLabel(totals.leftoverDays, totals.feedingDays) : "—";
      case "eaten": return cell(totals.eaten, 1);
      case "coverage": return cell(totals.coverage != null ? totals.coverage * 100 : null, 0);
      case "shareLeft": return cell(totals.shareLeft != null ? totals.shareLeft * 100 : null, 1);
      default: return "";
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">Pen detail</h2>
      <p className="text-xs text-muted-foreground mb-2">
        One row for each weighing interval, for every selected pen.{" "}
        <Link to="/photos" className="text-primary underline">Photo review</Link>
      </p>

      <div className="mb-3">
        <button
          type="button"
          onClick={() => setChooserOpen((o) => !o)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium"
        >
          {chooserOpen ? "Hide columns list" : `Choose columns (${visible.length}/${PEN_COLUMNS.length})`}
        </button>
        {chooserOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
            {PEN_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!hiddenColumns.has(c.key)}
                  onChange={() => onToggleColumn(c.key)}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              {visible.map((c) => <th key={c.key} className="py-2 pr-3">{c.label}</th>)}
            </tr>
          </thead>
          {penBlocks.map((b) => (
            <tbody key={b.pen.penId} className="divide-y divide-border tabular-nums">
              {b.rows.map((r) => (
                <tr key={`${b.pen.penId}-${r.iv.from}-${r.iv.to}`}>
                  {visible.map((c) => (
                    <td key={c.key} className="py-2 pr-3">{rowValue(c.key, b.pen.label, r)}</td>
                  ))}
                </tr>
              ))}
              {b.rows.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(visible.length, 1)} className="py-3 text-muted-foreground whitespace-normal">
                    {b.pen.label}: at least two weighings are needed before intervals can be shown.
                  </td>
                </tr>
              ) : (
                <tr className="border-t-2 border-border bg-muted/40 font-medium">
                  {visible.map((c) => (
                    <td key={c.key} className="py-2 pr-3">{totalValue(c.key, b.pen.label, b.totals)}</td>
                  ))}
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A figure shows as “—” when it cannot be calculated: no gain, a missing weighing, or a pen with no snails.
      </p>
    </section>
  );
}


/* ---------- portions and leftovers ---------- */

interface PortionPoint {
  date: string;
  offered: number | null;
  eaten: number | null;
  sharePct: number | null;
  visual: boolean;
  changes: string[];
  changeMark: number | null;
}

function PortionsChart({
  metrics, view, observations, retentionFor, isOperating, from, to, targetMin, targetMax,
}: {
  metrics: TrialMetrics;
  view: View;
  observations: { pen_id: string; feed_id: string | null; obs_date: string; offered_g: number | null; leftover_g: number | null; refusal_score: string | null }[];
  retentionFor: ReturnType<typeof makeRetention>;
  isOperating: (d: string) => boolean;
  from: string;
  to: string;
  targetMin: number;
  targetMax: number;
}) {
  const groups =
    view === "pen"
      ? metrics.pens.map((p) => ({ name: p.label, pens: [p] }))
      : metrics.treatments.map((t) => ({ name: t.label, pens: t.pens }));

  const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}%`;

  const seriesFor = (pens: PenMetrics[]): PortionPoint[] => {
    const byDate = new Map<string, { offered: number[]; eaten: number[]; share: number[]; visual: boolean[]; changes: string[] }>();
    for (const pen of pens) {
      const shares = observations
        .filter((o) => o.pen_id === pen.penId && o.feed_id != null && isOperating(o.obs_date)
          && (!from || o.obs_date >= from) && (!to || o.obs_date <= to))
        .map((o) => feedingShare(o, retentionFor))
        .filter((x): x is NonNullable<typeof x> => x != null);
      for (const f of shares) {
        const b = byDate.get(f.obs_date) ?? { offered: [], eaten: [], share: [], visual: [], changes: [] };
        b.offered.push(f.offered_g);
        if (f.eaten_g != null) b.eaten.push(f.eaten_g);
        if (f.shareLeft != null) { b.share.push(f.shareLeft * 100); b.visual.push(f.visual); }
        byDate.set(f.obs_date, b);
      }
      for (const c of portionChanges(shares)) {
        const b = byDate.get(c.date);
        if (!b) continue;
        const txt = `${Math.round(c.previous_g)} g → ${Math.round(c.new_g)} g (${pct(c.change_pct)})`;
        b.changes.push(pens.length > 1 ? `${pen.label}: ${txt}` : txt);
      }
    }
    return Array.from(byDate.keys()).sort().map((date) => {
      const b = byDate.get(date)!;
      const offered = meanOfValues(b.offered);
      return {
        date,
        offered,
        eaten: meanOfValues(b.eaten),
        sharePct: meanOfValues(b.share),
        visual: b.visual.length > 0 && b.visual.every(Boolean),
        changes: b.changes,
        changeMark: b.changes.length ? offered : null,
      };
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
      <div>
        <h2 className="font-semibold">Portions and leftovers</h2>
        <p className="text-xs text-muted-foreground">
          Portion offered and eaten (g, left axis), share left (%, bars, right axis) with the {targetMin}–{targetMax}%
          target shaded. A dot marks every date the portion changed. Closed days are left out.
        </p>
      </div>
      {groups.map((g) => {
        const data = seriesFor(g.pens);
        if (!data.length) return null;
        return (
          <div key={g.name}>
            <div className="text-sm font-medium mb-1">{g.name}</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tickFormatter={fmtShort} tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="g" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <ReferenceArea yAxisId="pct" y1={targetMin} y2={targetMax} fill="var(--color-primary)" fillOpacity={0.12} />
                  <Bar yAxisId="pct" dataKey="sharePct" name="Share left (%)" barSize={10}>
                    {data.map((d) => (
                      <Cell
                        key={d.date}
                        fill={d.visual ? "transparent" : "#b45309"}
                        fillOpacity={d.visual ? 0 : 0.45}
                        stroke="#b45309"
                        strokeWidth={d.visual ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                  <Line yAxisId="g" type="linear" dataKey="offered" name="Offered (g)" stroke="var(--color-primary)" dot={false} connectNulls />
                  <Line yAxisId="g" type="linear" dataKey="eaten" name="Eaten (g)" stroke="#0369a1" dot={false} connectNulls />
                  <Scatter yAxisId="g" dataKey="changeMark" name="Portion changed" fill="var(--color-foreground)" shape="diamond" />
                  <Tooltip content={<PortionTooltip />} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-primary" />Offered (g)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4" style={{ background: "#0369a1" }} />Eaten (g)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-2" style={{ background: "#b45309", opacity: 0.45 }} />Share left, weighed</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-2 border" style={{ borderColor: "#b45309" }} />visual estimate (before weighed leftovers)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rotate-45 bg-foreground" />Portion changed</span>
      </div>
    </section>
  );
}

function PortionTooltip({ active, payload }: { active?: boolean; payload?: { payload: PortionPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm space-y-0.5">
      <div className="font-medium">{fmtShort(d.date)}</div>
      {d.offered != null && <div>Offered: {d.offered.toFixed(1)} g</div>}
      {d.eaten != null && <div>Eaten: {d.eaten.toFixed(1)} g</div>}
      {d.sharePct != null && <div>Share left: {d.sharePct.toFixed(1)}%{d.visual ? " (visual estimate)" : ""}</div>}
      {d.changes.map((c) => <div key={c} className="font-medium">{c}</div>)}
    </div>
  );
}
