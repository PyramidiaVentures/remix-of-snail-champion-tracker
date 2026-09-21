import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Thermometer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/date";
import { addDays, roundOut } from "@/lib/metrics";
import { cumulativeMortality } from "@/lib/liveCount";
import { NoActiveTrial, useSiteFeeds, useSitePens, useSiteScope, useSiteTrial } from "@/lib/siteScope";
import { operatingDaysSentence, useSiteCalendar } from "@/lib/operatingDays";
import {
  REFUSAL_LABEL,
  REFUSAL_ORDER,
  computeDayReview,
  fetchDayInputs,
  type DayReviewPen,
} from "@/lib/dayExceptions";
import DashboardTrends from "@/components/DashboardTrends";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search['date'] === "string" ? { date: search['date'] } : {},
  head: () => ({
    meta: [
      { title: "Daily Dashboard — SNOVA Growth Tracker" },
      { name: "description", content: "Every exception, completeness figure and headline number for one day of the snail growth trial at the selected site." },
      { property: "og:title", content: "Daily Dashboard — SNOVA Growth Tracker" },
      { property: "og:description", content: "Exceptions, completeness and today's numbers for the selected site and date." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

/* ------------------------------------------------------------------- page */

function DashboardPage() {
  const search = Route.useSearch();
  const { siteId, siteName } = useSiteScope();
  const { calendar } = useSiteCalendar();

  const trial = useSiteTrial();
  const trialId = trial.data?.id;
  const pens = useSitePens();
  const feeds = useSiteFeeds();

  const assignments = useQuery({
    queryKey: ["dash-assignments", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id,treatment_id,start_date").eq("trial_id", trialId!)).data ?? [],
  });

  const treatments = useQuery({
    queryKey: ["dash-treatments", trialId],
    enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("treatments").select("id,label,feed_id").eq("trial_id", trialId!)).data ?? [],
  });

  // The last completed day: the most recent operating day before today. Today
  // itself is a half-told story — its evening feeding has not happened yet.
  const lastCompleted = calendar.previousOperatingDay(today());
  const date = search.date || lastCompleted;
  const isToday = date === today();
  const isLastCompleted = date === lastCompleted;

  const data = useQuery({
    queryKey: ["dash-data", trialId, date],
    enabled: !!trialId,
    queryFn: () => fetchDayInputs(trialId!, date),
  });

  const allPens = (pens.data ?? []) as DayReviewPen[];

  const [pickHint, setPickHint] = useState<string | null>(null);

  const setDate = (v: string) => {
    setPickHint(null);
    const params = new URLSearchParams(window.location.search);
    params.set("date", v);
    window.location.search = params.toString();
  };

  // A closed day cannot be chosen — the picker refuses it and says why.
  const pickDate = (v: string) => {
    if (!v) return;
    if (calendar.isNonOperating(v)) {
      setPickHint(`${longDate(v)} — no operations at ${siteName || "this site"} (${calendar.closedBecause(v)}).`);
      return;
    }
    setDate(v);
  };

  // Previous / Next step over closed days entirely.
  const prevDay = calendar.previousOperatingDay(date);
  const nextDay = calendar.nextOperatingDay(addDays(date, 1));
  const canGoNext = nextDay <= today();

  const isClosedDay = calendar.isNonOperating(date);

  const review = useMemo(
    () =>
      data.data
        ? computeDayReview({
            pens: allPens,
            assignments: assignments.data ?? [],
            trialInterval: trial.data?.weighing_interval_days,
            data: data.data,
            calendar,
            date,
            siteName: siteName || "",
          })
        : null,
    [data.data, allPens, assignments.data, trial.data?.weighing_interval_days, calendar, date, siteName],
  );

  const {
    exceptions = [],
    inProgress = [],
    pmExpected = calendar.pmExpected(date),
    amExpected = calendar.amExpected(date),
    closedReason = calendar.closedBecause(date),
    pmInProgress = false,
    amInProgress = false,
    trialPens = [],
    breederPens = [],
    watched = [],
    pmMissing = () => [] as string[],
    amMissing = () => [] as string[],
    pmComplete = () => 0,
    amComplete = () => 0,
  } = review ?? {};

  /* ----------------------------------------------------------- numbers */

  const d = data.data;
  const obsToday = (d?.obs ?? []).filter((o) => o.obs_date === date);

  const mortalityToday = (d?.pop ?? [])
    .filter((e) => e.event_date === date && e.event_type === "mortality")
    .reduce((s, e) => s + e.count, 0);
  const mortalityCum = watched.reduce((s, p) => s + cumulativeMortality(p.id, d?.pop ?? [], date), 0);

  const treatmentByPen = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments.data ?? []) if (!m.has(a.pen_id)) m.set(a.pen_id, a.treatment_id);
    return m;
  }, [assignments.data]);
  const breederPenIds = useMemo(() => new Set(breederPens.map((p) => p.id)), [breederPens]);
  const isBreeder = (id: string) => breederPenIds.has(id);

  const feedName = (id: string) => (feeds.data ?? []).find((f) => f.id === id)?.name ?? "";
  const treatmentOfPen = (penId: string) =>
    (treatments.data ?? []).find((t) => t.id === (assignments.data ?? []).find((a) => a.pen_id === penId)?.treatment_id);

  const offeredByTreatment = (treatments.data ?? []).map((t) => ({
    label: t.label,
    feed: feedName(t.feed_id),
    grams: obsToday
      .filter((o) => o.offered_g != null && treatmentOfPen(o.pen_id)?.id === t.id)
      .reduce((s, o) => s + (o.offered_g ?? 0), 0),
  }));
  const offeredTotal = offeredByTreatment.reduce((s, r) => s + r.grams, 0);

  const refusalCounts = REFUSAL_ORDER.map((score) => ({
    score,
    count: obsToday.filter((o) => o.refusal_score === score && !isBreeder(o.pen_id)).length,
  }));

  const temps = (d?.welfare ?? []).map((w) => w.temp_c).filter((v): v is number => v != null);
  const hums = (d?.welfare ?? []).map((w) => w.humidity_pct).filter((v): v is number => v != null);
  const tempVal = temps.length ? temps[0] : null;
  const humVal = hums.length ? hums[0] : null;

  const loading = trial.isLoading || data.isPending || !review;

  // A closed day reached by URL or a stale link shows one line and nothing
  // else — no exception list, no empty tables.
  if (isClosedDay) {
    return (
      <div className="space-y-5">
        <header className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{siteName || "—"}</div>
          <h1 className="text-2xl font-bold">Daily dashboard</h1>
          <p className="text-base font-medium">Showing {longDate(date)}</p>
          <p className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
            {longDate(date)} — no operations at {siteName || "this site"}
            {calendar.closedBecause(date) ? ` (${calendar.closedBecause(date)})` : ""}.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => setDate(prevDay)}
              className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
            >
              ← Previous day
            </button>
            <label className="block">
              <span className="text-xs text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => pickDate(e.currentTarget.value)}
                className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setDate(nextDay)}
              className="rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:opacity-40"
            >
              Next day →
            </button>
          </div>
          {pickHint && <p className="text-xs text-amber-600">{pickHint}</p>}
          {calendar.nonOperatingWeekdays.length > 0 && (
            <p className="text-xs text-muted-foreground">{operatingDaysSentence(calendar)}</p>
          )}
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{siteName || "—"}</div>
        <h1 className="text-2xl font-bold">Daily dashboard</h1>
        <p className="text-base font-medium">Showing {longDate(date)}</p>
        <p className="text-sm text-muted-foreground">
          {isToday
            ? "Today is still under way — this evening's feeding has not happened yet."
            : isLastCompleted
              ? "The last completed day. This morning's check may still be in progress."
              : "A past day."}
        </p>
        <Link to="/photos" search={{ date }} className="inline-block text-sm text-primary underline">
          Photo review — look at the evidence
        </Link>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => setDate(prevDay)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
          >
            ← Previous day
          </button>
          <label className="block">
            <span className="text-xs text-muted-foreground">Date</span>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => pickDate(e.currentTarget.value)}
              className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() => setDate(nextDay)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm disabled:opacity-40"
          >
            Next day →
          </button>
        </div>
        {pickHint && <p className="text-xs text-amber-600">{pickHint}</p>}
        {calendar.nonOperatingWeekdays.length > 0 && (
          <p className="text-xs text-muted-foreground">{operatingDaysSentence(calendar)}</p>
        )}
      </header>


      {!!siteId && !trial.isLoading && !trial.data ? (
        <NoActiveTrial siteName={siteName} />
      ) : (
        <>
          {/* 1 — EXCEPTIONS */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
              <AlertTriangle className="h-4 w-4 text-earth" /> Exceptions
            </h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : exceptions.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> Nothing out of place — the day is clean.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {exceptions.map((e) => (
                  <li key={e.key} className="py-2">
                    {!e.to ? (
                      <span className="flex items-start gap-2">
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {e.group}
                        </span>
                        {e.text}
                      </span>
                    ) : (
                    <Link
                      to={e.to}
                      search={e.penId ? { pen: e.penId } : { pen: "" }}
                      className="flex items-start justify-between gap-3"
                    >
                      <span>
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {e.group}
                        </span>
                        {e.text}
                      </span>
                      <span className="shrink-0 text-xs text-primary underline">open</span>
                    </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 1b — IN PROGRESS */}
          {!loading && inProgress.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">In progress</h2>
              <p className="text-xs text-muted-foreground">
                {pmInProgress
                  ? "This evening's feeding has not happened yet — nothing here is late."
                  : "The morning check for this feeding happens this morning — nothing here is late."}
              </p>
              <ul className="divide-y divide-border text-sm">
                {inProgress.map((e) => (
                  <li key={e.key} className="py-2">
                    <Link to={e.to!} search={e.penId ? { pen: e.penId } : { pen: "" }} className="flex items-start justify-between gap-3">
                      <span>
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {e.group}
                        </span>
                        {e.text}
                      </span>
                      <span className="shrink-0 text-xs text-primary underline">open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}



          {/* 2 — COMPLETENESS */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
              <ClipboardList className="h-4 w-4" /> Completeness
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Figure label="Trial pens · PM" value={pmExpected ? `${pmComplete(trialPens)}/${trialPens.length}` : "not expected"} />
              <Figure label="Trial pens · AM" value={amExpected ? `${amComplete(trialPens)}/${trialPens.length}` : "not expected"} />
              <Figure label="Breeder pens · PM" value={pmExpected ? `${pmComplete(breederPens)}/${breederPens.length}` : "not expected"} />
              <Figure label="Breeder pens · AM" value={amExpected ? `${amComplete(breederPens)}/${breederPens.length}` : "not expected"} />
            </div>
            <ul className="divide-y divide-border text-sm">
              {watched
                .map((p) => ({ p, pm: pmExpected ? pmMissing(p.id) : [], am: amExpected ? amMissing(p.id) : [] }))
                .filter((r) => r.pm.length > 0 || r.am.length > 0)
                .map(({ p, pm, am }) => (
                  <li key={p.id} className="py-2">
                    <span className="font-medium">
                      {p.label}
                      {p.role === "breeder" && <span className="ml-1 text-xs font-normal text-muted-foreground">breeder</span>}
                    </span>
                    <div className="text-xs text-amber-600">
                      {pm.length > 0 && <div>{pmInProgress ? "PM not yet recorded:" : "PM missing:"} {pm.join(", ")}</div>}
                      {am.length > 0 && <div>{amInProgress ? "AM not yet recorded:" : "AM missing:"} {am.join(", ")}</div>}
                    </div>

                  </li>
                ))}
              {!pmExpected && !amExpected ? (
                <li className="py-2 text-sm text-muted-foreground">
                  {closedReason} — no feeding or check expected at {siteName || "this site"}.
                </li>
              ) : (
                watched.every(
                  (p) =>
                    (!pmExpected || pmMissing(p.id).length === 0) &&
                    (!amExpected || amMissing(p.id).length === 0),
                ) && <li className="py-2 text-sm text-primary">Every expected entry is complete.</li>
              )}
              {pmExpected && !amExpected && (
                <li className="py-2 text-xs text-muted-foreground">
                  The morning check for this feeding is done on {calendar.checkDayFor(date)} — not yet due.
                </li>
              )}

            </ul>
          </section>

          {/* 3 — TODAY'S NUMBERS */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Numbers for the day</h2>

            <div className="grid grid-cols-2 gap-2">
              <Figure label="Deaths today" value={String(mortalityToday)} />
              <Figure label="Deaths, trial to date" value={String(mortalityCum)} />
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grams offered</h3>
              <table className="mt-1 w-full text-sm">
                <tbody className="divide-y divide-border">
                  {offeredByTreatment.map((r) => (
                    <tr key={r.label}>
                      <td className="py-1.5">{r.label}{r.feed ? ` · ${r.feed}` : ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{roundOut(r.grams, 1)} g</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-right tabular-nums">{roundOut(offeredTotal, 1)} g</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refusal, trial pens</h3>
              <div className="mt-1 grid grid-cols-5 gap-1 text-center">
                {refusalCounts.map((r) => (
                  <div key={r.score} className="rounded-lg border border-border px-1 py-2">
                    <div className="text-base font-semibold tabular-nums">{r.count}</div>
                    <div className="text-[10px] leading-tight text-muted-foreground">{REFUSAL_LABEL[r.score]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Thermometer className="h-3 w-3" /> Conditions
              </h3>
              <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
                <Reading
                  label="Temperature"
                  value={tempVal == null ? null : `${roundOut(tempVal, 1)} °C`}
                  bad={tempVal != null && (tempVal < 25 || tempVal > 30)}
                  range="25–30 °C"
                />
                <Reading
                  label="Humidity"
                  value={humVal == null ? null : `${roundOut(humVal, 0)} %`}
                  bad={humVal != null && (humVal < 70 || humVal > 95)}
                  range="70–95 %"
                />
              </div>
            </div>
          </section>

          {/* 4 — TRENDS */}
          <DashboardTrends
            trialId={trialId}
            treatmentByPen={treatmentByPen}
            treatments={(treatments.data ?? []).map((t) => ({ id: t.id, label: t.label }))}
            breederPenIds={breederPenIds}
            calendar={calendar}
          />
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Reading({ label, value, bad, range }: { label: string; value: string | null; bad: boolean; range: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${bad ? "border-destructive" : "border-border"}`}>
      <div className={`text-lg font-semibold tabular-nums ${bad ? "text-destructive" : ""}`}>{value ?? "—"}</div>
      <div className="text-[11px] text-muted-foreground">
        {label}
        {value == null ? " · not recorded" : bad ? ` · outside ${range}` : ""}
      </div>
    </div>
  );
}
