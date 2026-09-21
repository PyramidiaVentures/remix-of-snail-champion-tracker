import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Thermometer } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/date";
import { addDays, roundOut } from "@/lib/metrics";
import { cumulativeMortality, liveCount } from "@/lib/liveCount";
import { buildSchedule, type SchedulePen } from "@/lib/weighSchedule";
import { NoActiveTrial, useSiteFeeds, useSitePens, useSiteScope, useSiteTrial } from "@/lib/siteScope";
import DashboardTrends from "@/components/DashboardTrends";
import type { Tables } from "@/integrations/supabase/types";

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

/* ------------------------------------------------------------------ labels */

const EVENT_LABEL: Record<string, string> = {
  mortality: "Death",
  escape: "Escape",
  removal: "Removal",
  addition: "Addition",
};
const CAUSE_LABEL: Record<string, string> = {
  disease: "disease",
  predation: "predation",
  handling: "handling",
  unknown: "unknown",
  harvested: "harvested",
  other: "other",
};
const FLAG_LABEL: Record<string, string> = {
  shell_damage: "Shell damage",
  lethargy: "Lethargy",
  abnormal_mucus: "Abnormal mucus",
  foul_smell: "Foul smell",
  mould_in_dish: "Mould in dish",
  visible_dead: "Visible dead",
};
const REFUSAL_LABEL: Record<string, string> = {
  none_left: "None left",
  trace: "Trace",
  about_25: "About 25%",
  about_50: "About 50%",
  most_left: "Most left",
};
const REFUSAL_ORDER = ["none_left", "trace", "about_25", "about_50", "most_left"] as const;

// The same wording the two field screens use for their SOP steps, so an
// unticked step is named here exactly as the operator sees it.
const PM_STEPS = [
  "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).",
  "Check each dish against the discard criteria. If the remaining feed is sound, top up. If it fails any criterion, empty and clean the dish first.",
  "Weigh the portion for each pen and enter grams offered.",
  "Record the dish action: topped up, emptied and refilled, or emptied because spoiled.",
  "Place feed in each pen, rotating the dish position from yesterday.",
  "Top up calcium and water dishes (never weighed, always present).",
  "Upload one PM photo per pen, dish and paper tag in frame.",
];
const PM_PHOTO_STEP_INDEX = 6;
const AM_STEPS = [
  "Upload the AM photos (one per pen) — dish untouched, tag in frame.",
  "Record the refusal score for each pen by eye. Do not weigh.",
  "Record snail activity and any signs of sickness.",
  "Record temperature and humidity.",
  "Log any deaths, escapes or removals.",
  "Empty and clean any dish whose remaining feed fails the discard criteria.",
];
const AM_PHOTO_STEP_INDEX = 0;

/** Ticked steps as the Checklist component stores them (today's ticks only). */
function readChecklist(storageKey: string, length: number): boolean[] {
  const empty = Array.from({ length }, () => false);
  if (typeof window === "undefined") return empty;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { date: string; done: boolean[] };
    const stamp = new Date().toISOString().slice(0, 10);
    if (parsed.date !== stamp || parsed.done.length !== length) return empty;
    return parsed.done;
  } catch {
    return empty;
  }
}

const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

type Exception = {
  key: string;
  group: string;
  text: string;
  to: "/pm" | "/am" | "/weigh" | "/population";
  penId?: string;
};

/* ------------------------------------------------------------------- page */

function DashboardPage() {
  const search = Route.useSearch();
  const date = search.date || today();
  const { siteId, siteName } = useSiteScope();

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

  const data = useQuery({
    queryKey: ["dash-data", trialId, date],
    enabled: !!trialId,
    queryFn: async () => {
      const [obs, welfare, photos, pop, biomass] = await Promise.all([
        supabase.from("observations")
          .select("pen_id,obs_date,offered_g,dish_action,refusal_score,feed_id")
          .eq("trial_id", trialId!).lte("obs_date", date),
        supabase.from("welfare_checks").select("*").eq("trial_id", trialId!).eq("obs_date", date),
        supabase.from("session_photos").select("pen_id,photo_am_url,photo_pm_url")
          .eq("trial_id", trialId!).eq("obs_date", date),
        supabase.from("population_events").select("id,pen_id,event_date,event_type,count,cause")
          .eq("trial_id", trialId!),
        supabase.from("biomass_events").select("pen_id,event_date,net_biomass_g,live_count")
          .eq("trial_id", trialId!),
      ]);
      return {
        obs: obs.data ?? [],
        welfare: (welfare.data ?? []) as Tables<"welfare_checks">[],
        photos: photos.data ?? [],
        pop: pop.data ?? [],
        biomass: biomass.data ?? [],
      };
    },
  });

  const allPens = pens.data ?? [];
  const assignedIds = useMemo(
    () => new Set((assignments.data ?? []).map((a) => a.pen_id)),
    [assignments.data],
  );
  const trialPens = allPens.filter((p) => p.role !== "breeder" && assignedIds.has(p.id));
  const breederPens = allPens.filter((p) => p.role === "breeder");
  const watched = [...trialPens, ...breederPens];
  const isBreeder = (id: string) => breederPens.some((p) => p.id === id);
  const labelOf = (id: string) => allPens.find((p) => p.id === id)?.label ?? "Pen";

  const d = data.data;
  const obsToday = (d?.obs ?? []).filter((o) => o.obs_date === date);
  const obsFor = (id: string) => obsToday.find((o) => o.pen_id === id);
  const welfareFor = (id: string) => (d?.welfare ?? []).find((w) => w.pen_id === id);
  const photoFor = (id: string) => (d?.photos ?? []).find((p) => p.pen_id === id);

  /* ------------------------------------------------------- completeness */

  const pmMissing = (id: string) => {
    const row = obsFor(id);
    const miss: string[] = [];
    if (!isBreeder(id) && row?.offered_g == null) miss.push("grams offered");
    if (!row?.dish_action) miss.push("dish action");
    if (!photoFor(id)?.photo_pm_url) miss.push("PM photo");
    return miss;
  };
  const pmTotal = (id: string) => (isBreeder(id) ? 2 : 3);

  const amMissing = (id: string) => {
    const w = welfareFor(id);
    const miss: string[] = [];
    if (isBreeder(id)) {
      if (!w?.substrate_condition) miss.push("substrate condition");
    } else {
      if (!obsFor(id)?.refusal_score) miss.push("refusal score");
      if (!w?.activity) miss.push("activity");
    }
    if (!photoFor(id)?.photo_am_url) miss.push("AM photo");
    return miss;
  };
  // Trial pens: refusal score, activity and photo. Breeder pens: substrate and photo.
  const amTotal = (id: string) => (isBreeder(id) ? 2 : 3);

  const pmComplete = (list: typeof allPens) => list.filter((p) => pmMissing(p.id).length === 0).length;
  const amComplete = (list: typeof allPens) => list.filter((p) => amMissing(p.id).length === 0).length;

  const pmPhotosAll =
    watched.length > 0 && watched.every((p) => !!photoFor(p.id)?.photo_pm_url);
  const amPhotosAll =
    watched.length > 0 && watched.every((p) => !!photoFor(p.id)?.photo_am_url);

  /* ---------------------------------------------------------- schedule */

  const startDateByPen = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments.data ?? []) if (!m.has(a.pen_id)) m.set(a.pen_id, a.start_date);
    return m;
  }, [assignments.data]);

  const schedule = useMemo(
    () =>
      buildSchedule({
        pens: allPens as SchedulePen[],
        trialInterval: trial.data?.weighing_interval_days,
        startDateByPen,
        events: (d?.biomass ?? []).filter((b) => b.event_date <= date),
        today: date,
      }),
    [allPens, trial.data?.weighing_interval_days, startDateByPen, d?.biomass, date],
  );

  /* -------------------------------------------------------- exceptions */

  const exceptions: Exception[] = [];

  // Population events logged on the day.
  for (const e of (d?.pop ?? []).filter((r) => r.event_date === date)) {
    exceptions.push({
      key: `pop-${e.id}`,
      group: "Population",
      text: `${labelOf(e.pen_id)} — ${EVENT_LABEL[e.event_type] ?? e.event_type} ×${e.count}, cause ${CAUSE_LABEL[e.cause ?? "unknown"] ?? "unknown"}`,
      to: "/population",
      penId: e.pen_id,
    });
  }

  // Health flags, and mouldy substrate in breeder pens.
  for (const w of d?.welfare ?? []) {
    for (const f of w.health_flags ?? []) {
      exceptions.push({
        key: `flag-${w.id}-${f}`,
        group: "Health",
        text: `${labelOf(w.pen_id)} — ${FLAG_LABEL[f] ?? f}`,
        to: "/am",
        penId: w.pen_id,
      });
    }
    if (w.substrate_condition === "mouldy" && isBreeder(w.pen_id)) {
      exceptions.push({
        key: `mould-${w.id}`,
        group: "Health",
        text: `${labelOf(w.pen_id)} (breeder) — substrate recorded as mouldy`,
        to: "/am",
        penId: w.pen_id,
      });
    }
  }

  // Missing and partial sessions.
  for (const p of watched) {
    const miss = pmMissing(p.id);
    if (miss.length === pmTotal(p.id)) {
      exceptions.push({ key: `pm-none-${p.id}`, group: "PM session", text: `${p.label} — no PM entry`, to: "/pm", penId: p.id });
    } else if (miss.length > 0) {
      exceptions.push({ key: `pm-part-${p.id}`, group: "PM session", text: `${p.label} — partial PM entry, missing ${miss.join(", ")}`, to: "/pm", penId: p.id });
    }
  }
  for (const p of watched) {
    const miss = amMissing(p.id);
    if (miss.length === amTotal(p.id)) {
      exceptions.push({ key: `am-none-${p.id}`, group: "AM session", text: `${p.label} — no AM entry`, to: "/am", penId: p.id });
    } else if (miss.length > 0) {
      exceptions.push({ key: `am-part-${p.id}`, group: "AM session", text: `${p.label} — partial AM entry, missing ${miss.join(", ")}`, to: "/am", penId: p.id });
    }
  }

  // SOP steps still unticked.
  const pmTicks = readChecklist(`pm-checklist-${date}`, PM_STEPS.length);
  PM_STEPS.forEach((step, i) => {
    const done = i === PM_PHOTO_STEP_INDEX ? pmPhotosAll : pmTicks[i];
    if (!done) exceptions.push({ key: `pmstep-${i}`, group: "PM checklist", text: `Step ${i + 1} not ticked — ${step}`, to: "/pm" });
  });
  const amTicks = readChecklist(`am-checklist-${date}`, AM_STEPS.length);
  AM_STEPS.forEach((step, i) => {
    const done = i === AM_PHOTO_STEP_INDEX ? amPhotosAll : amTicks[i];
    if (!done) exceptions.push({ key: `amstep-${i}`, group: "AM checklist", text: `Step ${i + 1} not ticked — ${step}`, to: "/am" });
  });

  // Consecutive refusal runs ending on the selected date.
  const runLength = (penId: string, score: string) => {
    const byDate = new Map((d?.obs ?? []).filter((o) => o.pen_id === penId).map((o) => [o.obs_date, o.refusal_score]));
    let n = 0;
    let cursor = date;
    while (byDate.get(cursor) === score) {
      n += 1;
      cursor = addDays(cursor, -1);
    }
    return n;
  };
  for (const p of trialPens) {
    for (const score of ["most_left", "none_left"] as const) {
      const n = runLength(p.id, score);
      if (n >= 3) {
        exceptions.push({
          key: `run-${score}-${p.id}`,
          group: "Refusal",
          text: `${p.label} — ${n} consecutive days at "${REFUSAL_LABEL[score]}"`,
          to: "/am",
          penId: p.id,
        });
      }
    }
  }

  // Dish emptied because spoiled.
  for (const o of obsToday.filter((r) => r.dish_action === "emptied_spoiled")) {
    exceptions.push({
      key: `spoiled-${o.pen_id}`,
      group: "Dish",
      text: `${labelOf(o.pen_id)} — dish emptied because spoiled`,
      to: "/pm",
      penId: o.pen_id,
    });
  }

  // Weighings overdue.
  for (const row of schedule.filter((r) => r.overdueDays > 0).sort((a, b) => b.overdueDays - a.overdueDays)) {
    exceptions.push({
      key: `overdue-${row.penId}`,
      group: "Weighing",
      text: `${row.label} — overdue for weighing by ${row.overdueDays} day${row.overdueDays === 1 ? "" : "s"}`,
      to: "/weigh",
      penId: row.penId,
    });
  }

  // Mean-weight jumps and live-count disagreements on the day's weighings.
  for (const b of (d?.biomass ?? []).filter((r) => r.event_date === date)) {
    const prior = (d?.biomass ?? [])
      .filter((r) => r.pen_id === b.pen_id && r.event_date < date)
      .sort((x, y) => x.event_date.localeCompare(y.event_date))
      .at(-1);
    if (prior && prior.live_count > 0 && b.live_count > 0) {
      const before = prior.net_biomass_g / prior.live_count;
      const now = b.net_biomass_g / b.live_count;
      if (before > 0) {
        const change = ((now - before) / before) * 100;
        if (Math.abs(change) > 25) {
          exceptions.push({
            key: `jump-${b.pen_id}`,
            group: "Weighing",
            text: `${labelOf(b.pen_id)} — mean weight changed ${change > 0 ? "+" : ""}${roundOut(change, 1)}% since ${prior.event_date}`,
            to: "/weigh",
            penId: b.pen_id,
          });
        }
      }
    }
    const pen = allPens.find((p) => p.id === b.pen_id);
    const ledger = liveCount(pen, d?.pop ?? [], date);
    if (pen && ledger !== b.live_count) {
      exceptions.push({
        key: `ledger-${b.pen_id}`,
        group: "Population",
        text: `${pen.label} — counted ${b.live_count} live, ledger says ${ledger}`,
        to: "/population",
        penId: b.pen_id,
      });
    }
  }

  /* ----------------------------------------------------------- numbers */

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

  const loading = trial.isLoading || data.isPending;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{siteName || "—"}</div>
        <h1 className="text-2xl font-bold">Daily dashboard</h1>
        <p className="text-sm text-muted-foreground">{longDate(date)}</p>
        <Link to="/photos" search={{ date }} className="inline-block text-sm text-primary underline">
          Photo review — look at the evidence
        </Link>
        <label className="block">
          <span className="text-xs text-muted-foreground">Date</span>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => {
              const v = e.currentTarget.value;
              const params = new URLSearchParams(window.location.search);
              params.set("date", v);
              window.location.search = params.toString();
            }}
            className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
          />
        </label>
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
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 2 — COMPLETENESS */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
              <ClipboardList className="h-4 w-4" /> Completeness
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Figure label="Trial pens · PM" value={`${pmComplete(trialPens)}/${trialPens.length}`} />
              <Figure label="Trial pens · AM" value={`${amComplete(trialPens)}/${trialPens.length}`} />
              <Figure label="Breeder pens · PM" value={`${pmComplete(breederPens)}/${breederPens.length}`} />
              <Figure label="Breeder pens · AM" value={`${amComplete(breederPens)}/${breederPens.length}`} />
            </div>
            <ul className="divide-y divide-border text-sm">
              {watched
                .map((p) => ({ p, pm: pmMissing(p.id), am: amMissing(p.id) }))
                .filter((r) => r.pm.length > 0 || r.am.length > 0)
                .map(({ p, pm, am }) => (
                  <li key={p.id} className="py-2">
                    <span className="font-medium">
                      {p.label}
                      {p.role === "breeder" && <span className="ml-1 text-xs font-normal text-muted-foreground">breeder</span>}
                    </span>
                    <div className="text-xs text-amber-600">
                      {pm.length > 0 && <div>PM missing: {pm.join(", ")}</div>}
                      {am.length > 0 && <div>AM missing: {am.join(", ")}</div>}
                    </div>
                  </li>
                ))}
              {watched.every((p) => pmMissing(p.id).length === 0 && amMissing(p.id).length === 0) && (
                <li className="py-2 text-sm text-primary">Every pen is complete for both sessions.</li>
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
