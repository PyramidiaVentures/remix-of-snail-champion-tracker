import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/date";
import { addDays, roundOut } from "@/lib/metrics";
import { liveCount } from "@/lib/liveCount";
import { buildSchedule, type SchedulePen } from "@/lib/weighSchedule";
import type { OperatingCalendar } from "@/lib/operatingDays";

/* ------------------------------------------------------------------ labels */

export const EVENT_LABEL: Record<string, string> = {
  mortality: "Death",
  escape: "Escape",
  removal: "Removal",
  addition: "Addition",
};
export const CAUSE_LABEL: Record<string, string> = {
  disease: "disease",
  predation: "predation",
  handling: "handling",
  unknown: "unknown",
  harvested: "harvested",
  other: "other",
};
export const FLAG_LABEL: Record<string, string> = {
  shell_damage: "Shell damage",
  lethargy: "Lethargy",
  abnormal_mucus: "Abnormal mucus",
  foul_smell: "Foul smell",
  mould_in_dish: "Mould in dish",
  visible_dead: "Visible dead",
};
export const REFUSAL_LABEL: Record<string, string> = {
  none_left: "None left",
  trace: "Trace",
  about_25: "About 25%",
  about_50: "About 50%",
  most_left: "Most left",
};
export const REFUSAL_ORDER = ["none_left", "trace", "about_25", "about_50", "most_left"] as const;

// The same wording the two field screens use for their SOP steps, so an
// unticked step is named exactly as the operator sees it.
export const PM_STEPS = [
  "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt).",
  "Check each dish against the discard criteria. If the remaining feed is sound, top up. If it fails any criterion, empty and clean the dish first.",
  "Weigh the portion for each pen and enter grams offered.",
  "Record the dish action: topped up, emptied and refilled, or emptied because spoiled.",
  "Place feed in each pen, rotating the dish position from yesterday.",
  "Top up calcium and water dishes (never weighed, always present).",
  "Upload one PM photo per pen, dish and paper tag in frame.",
];
export const PM_PHOTO_STEP_INDEX = 6;
export const AM_STEPS = [
  "Upload the AM photos (one per pen) — dish untouched, tag in frame.",
  "Record the refusal score for each pen by eye. Do not weigh.",
  "Record snail activity and any signs of sickness.",
  "Record temperature and humidity.",
  "Log any deaths, escapes or removals.",
  "Empty and clean any dish whose remaining feed fails the discard criteria.",
];
export const AM_PHOTO_STEP_INDEX = 0;

// SOP ticks live in the database (table sop_checklists), so a step ticked on a
// field phone is visible to everyone. They arrive through DayInputs.checklists.

export type DayException = {
  key: string;
  group: string;
  text: string;
  to?: "/pm" | "/am" | "/weigh" | "/population";
  penId?: string;
};

export type DayInputs = {
  obs: {
    pen_id: string;
    obs_date: string;
    offered_g: number | null;
    dish_action: string | null;
    refusal_score: string | null;
    feed_id: string | null;
  }[];
  welfare: {
    id: string;
    pen_id: string;
    health_flags: string[] | null;
    substrate_condition: string | null;
    activity: string | null;
    temp_c: number | null;
    humidity_pct: number | null;
  }[];
  photos: { pen_id: string; photo_am_url: string | null; photo_pm_url: string | null }[];
  pop: {
    id: string;
    pen_id: string;
    event_date: string;
    event_type: "mortality" | "escape" | "removal" | "addition";
    count: number;
    cause: string | null;
  }[];
  biomass: { pen_id: string; event_date: string; net_biomass_g: number; live_count: number }[];
  checklists: { session: string; steps: boolean[] | null }[];
};

/** Fetch every dataset the day review reads, for one trial and date. */
export async function fetchDayInputs(trialId: string, date: string): Promise<DayInputs> {
  const [obs, welfare, photos, pop, biomass, checklists] = await Promise.all([
    supabase.from("observations")
      .select("pen_id,obs_date,offered_g,dish_action,refusal_score,feed_id")
      .eq("trial_id", trialId).lte("obs_date", date),
    supabase.from("welfare_checks")
      .select("id,pen_id,health_flags,substrate_condition,activity,temp_c,humidity_pct")
      .eq("trial_id", trialId).eq("obs_date", date),
    supabase.from("session_photos").select("pen_id,photo_am_url,photo_pm_url")
      .eq("trial_id", trialId).eq("obs_date", date),
    supabase.from("population_events").select("id,pen_id,event_date,event_type,count,cause")
      .eq("trial_id", trialId),
    supabase.from("biomass_events").select("pen_id,event_date,net_biomass_g,live_count")
      .eq("trial_id", trialId),
    supabase.from("sop_checklists").select("session,steps")
      .eq("trial_id", trialId).eq("obs_date", date),
  ]);
  return {
    obs: obs.data ?? [],
    welfare: welfare.data ?? [],
    photos: photos.data ?? [],
    pop: (pop.data ?? []) as DayInputs["pop"],
    biomass: biomass.data ?? [],
    checklists: checklists.data ?? [],
  };
}

/** The date the day review defaults to: the last completed operating day. */
export const lastCompletedDay = (calendar: OperatingCalendar) =>
  calendar.previousOperatingDay(today());

export type DayReviewPen = {
  id: string;
  label: string;
  role: string | null;
  initial_snail_count: number;
  weighing_interval_days: number | null;
};

export type DayReview = ReturnType<typeof computeDayReview>;

/**
 * The single source of truth for a day's exceptions, in-progress items and
 * session completeness. The dashboard and the Home summary both call this, so
 * they can never disagree.
 */
export function computeDayReview(args: {
  pens: DayReviewPen[];
  assignments: { pen_id: string; start_date: string }[];
  trialInterval: number | null | undefined;
  data: DayInputs;
  calendar: OperatingCalendar;
  date: string;
  siteName: string;
}) {
  const { pens: allPens, assignments, trialInterval, data: d, calendar, date, siteName } = args;

  const pmExpected = calendar.pmExpected(date);
  const amExpected = calendar.amExpected(date);
  const closedReason = calendar.closedBecause(date);

  // The most recent cycle is still running: the morning check for the last
  // completed day may be happening right now, and today's evening feeding has
  // not happened at all yet. Those gaps are "in progress", not exceptions.
  const lastCompleted = lastCompletedDay(calendar);
  const isToday = date === today();
  const isLastCompleted = date === lastCompleted;
  const amInProgress = amExpected && (isLastCompleted || isToday);
  const pmInProgress = pmExpected && isToday;

  const assignedIds = new Set(assignments.map((a) => a.pen_id));
  const trialPens = allPens.filter((p) => p.role !== "breeder" && assignedIds.has(p.id));
  const breederPens = allPens.filter((p) => p.role === "breeder");
  const watched = [...trialPens, ...breederPens];
  const isBreeder = (id: string) => breederPens.some((p) => p.id === id);
  const labelOf = (id: string) => allPens.find((p) => p.id === id)?.label ?? "Pen";

  const obsToday = d.obs.filter((o) => o.obs_date === date);
  const obsFor = (id: string) => obsToday.find((o) => o.pen_id === id);
  const welfareFor = (id: string) => d.welfare.find((w) => w.pen_id === id);
  const photoFor = (id: string) => d.photos.find((p) => p.pen_id === id);

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
  const amTotal = (id: string) => (isBreeder(id) ? 2 : 3);

  const pmComplete = (list: DayReviewPen[]) => list.filter((p) => pmMissing(p.id).length === 0).length;
  const amComplete = (list: DayReviewPen[]) => list.filter((p) => amMissing(p.id).length === 0).length;

  const pmPhotosAll = watched.length > 0 && watched.every((p) => !!photoFor(p.id)?.photo_pm_url);
  const amPhotosAll = watched.length > 0 && watched.every((p) => !!photoFor(p.id)?.photo_am_url);

  const startDateByPen = new Map<string, string>();
  for (const a of assignments) if (!startDateByPen.has(a.pen_id)) startDateByPen.set(a.pen_id, a.start_date);

  const schedule = buildSchedule({
    pens: allPens as SchedulePen[],
    trialInterval,
    startDateByPen,
    events: d.biomass.filter((b) => b.event_date <= date),
    today: date,
    isOperating: calendar.isOperating,
    nextOperatingDay: calendar.nextOperatingDay,
  });

  const exceptions: DayException[] = [];

  // On a closed day the site is not expected to do anything — one line, rather
  // than every pen listed as missing.
  if (closedReason) {
    exceptions.push({
      key: "closed",
      group: "Closed",
      text: `${closedReason} — no operations at ${siteName || "this site"}`,
    });
  }

  // Population events logged on the day.
  for (const e of d.pop.filter((r) => r.event_date === date)) {
    exceptions.push({
      key: `pop-${e.id}`,
      group: "Population",
      text: `${labelOf(e.pen_id)} — ${EVENT_LABEL[e.event_type] ?? e.event_type} ×${e.count}, cause ${CAUSE_LABEL[e.cause ?? "unknown"] ?? "unknown"}`,
      to: "/population",
      penId: e.pen_id,
    });
  }

  // Health flags, and mouldy substrate in breeder pens.
  for (const w of d.welfare) {
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

  // Missing and partial sessions — only for sessions that were expected and
  // whose window has closed. A session still under way is listed as in progress.
  const inProgress: DayException[] = [];
  for (const p of pmExpected ? watched : []) {
    const miss = pmMissing(p.id);
    if (miss.length === 0) continue;
    const whole = miss.length === pmTotal(p.id);
    const text = whole
      ? `${p.label} — no PM entry`
      : `${p.label} — partial PM entry, missing ${miss.join(", ")}`;
    const pending = whole
      ? `${p.label} — evening feeding not yet recorded`
      : `${p.label} — evening entry in progress, still to record ${miss.join(", ")}`;
    (pmInProgress ? inProgress : exceptions).push({
      key: `pm-${p.id}`, group: "PM session", text: pmInProgress ? pending : text, to: "/pm", penId: p.id,
    });
  }
  for (const p of amExpected ? watched : []) {
    const miss = amMissing(p.id);
    if (miss.length === 0) continue;
    const whole = miss.length === amTotal(p.id);
    const text = whole
      ? `${p.label} — no AM entry`
      : `${p.label} — partial AM entry, missing ${miss.join(", ")}`;
    const pending = whole
      ? `${p.label} — morning check not yet recorded`
      : `${p.label} — morning entry in progress, still to record ${miss.join(", ")}`;
    (amInProgress ? inProgress : exceptions).push({
      key: `am-${p.id}`, group: "AM session", text: amInProgress ? pending : text, to: "/am", penId: p.id,
    });
  }

  // SOP steps still unticked.
  const pmTicks = readChecklist(`pm-checklist-${date}`, PM_STEPS.length);
  (pmExpected && !pmInProgress ? PM_STEPS : []).forEach((step, i) => {
    const done = i === PM_PHOTO_STEP_INDEX ? pmPhotosAll : pmTicks[i];
    if (!done) exceptions.push({ key: `pmstep-${i}`, group: "PM checklist", text: `Step ${i + 1} not ticked — ${step}`, to: "/pm" });
  });
  const amTicks = readChecklist(`am-checklist-${date}`, AM_STEPS.length);
  (amExpected && !amInProgress ? AM_STEPS : []).forEach((step, i) => {
    const done = i === AM_PHOTO_STEP_INDEX ? amPhotosAll : amTicks[i];
    if (!done) exceptions.push({ key: `amstep-${i}`, group: "AM checklist", text: `Step ${i + 1} not ticked — ${step}`, to: "/am" });
  });

  // Consecutive refusal runs ending on the selected date.
  const runLength = (penId: string, score: string) => {
    const byDate = new Map(d.obs.filter((o) => o.pen_id === penId).map((o) => [o.obs_date, o.refusal_score]));
    // Consecutive OPERATING days: a closure neither breaks a run nor counts
    // towards one.
    let n = 0;
    let cursor = date;
    while (calendar.isNonOperating(cursor)) cursor = addDays(cursor, -1);
    while (byDate.get(cursor) === score) {
      n += 1;
      cursor = calendar.previousOperatingDay(cursor);
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
  for (const b of d.biomass.filter((r) => r.event_date === date)) {
    const prior = d.biomass
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
    const ledger = liveCount(pen, d.pop, date);
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

  return {
    exceptions,
    inProgress,
    pmExpected,
    amExpected,
    closedReason,
    pmInProgress,
    amInProgress,
    lastCompleted,
    trialPens,
    breederPens,
    watched,
    schedule,
    pmMissing,
    amMissing,
    pmComplete,
    amComplete,
  };
}

/**
 * A one-line breakdown of the largest exception categories, e.g.
 * "3 pens missing entries · 1 death · 2 pens overdue for weighing".
 */
export function summarizeExceptions(exceptions: DayException[]): string {
  const counts = new Map<string, number>();
  const bump = (label: string, n = 1) => counts.set(label, (counts.get(label) ?? 0) + n);
  for (const e of exceptions) {
    if (e.group === "PM session" || e.group === "AM session") bump("pens missing entries");
    else if (e.key.startsWith("pop-")) {
      const m = /— (\w+) ×(\d+)/.exec(e.text);
      const n = m ? Number(m[2]) : 1;
      if (m?.[1] === "Death") bump("death", n);
      else bump("other population event", n);
    }
    else if (e.key.startsWith("ledger-")) bump("count disagreement");
    else if (e.group === "Health") bump("health flag");
    else if (e.group === "Refusal") bump("refusal run");
    else if (e.group === "Dish") bump("spoiled dish");
    else if (e.key.startsWith("overdue-")) bump("pen overdue for weighing");
    else if (e.key.startsWith("jump-")) bump("weight jump");
    else if (e.group === "PM checklist" || e.group === "AM checklist") bump("unticked SOP step");
    else bump(e.group.toLowerCase());
  }
  const plural = (label: string, n: number) =>
    n === 1 ? label : label.endsWith("s") ? label : `${label}s`;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${n} ${plural(label, n)}`)
    .join(" · ");
}
