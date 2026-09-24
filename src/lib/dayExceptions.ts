import { feedEaten, makeRetention } from "@/lib/metrics";
import { retentionContext } from "@/lib/retention";
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
/** Over-portioning: share left above 15% on 3 consecutive feedings. */
export const OVER_PORTION_SHARE = 0.15;
/** Under-portioning: share left below 2% on 2 consecutive feedings. */
export const UNDER_PORTION_SHARE = 0.02;

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
  "Cut/collect fresh feed.",
  "Weigh each pen's portion and enter grams.",
  "Put the feed in the clean dish, rotating the dish position.",
  "Only during a water-loss test: put the standard amount of leaves in the control dish (nothing to enter).",
  "Calcium and water.",
  "PM photo.",
];
export const PM_CONTROL_STEP_INDEX = 3;
export const PM_PHOTO_STEP_INDEX = 5;
export const AM_STEPS = [
  "Photo each dish untouched, tag in frame.",
  "Take out all leftover feed, weigh it on the zeroed scale, enter grams, throw it away, clean the dish.",
  "Only during a water-loss test: weigh what is left in the control dish, enter grams, throw it away.",
  "Activity, health flags, minimum and maximum temperature and humidity.",
  "Log any deaths, escapes or removals.",
];
export const AM_PHOTO_STEP_INDEX = 0;
export const AM_CONTROL_STEP_INDEX = 2;

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
    leftover_g: number | null;
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
    temp_min_c: number | null;
    temp_max_c: number | null;
    humidity_min_pct: number | null;
    humidity_max_pct: number | null;
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
  /** The control dish reading for the date (null when none saved). */
  control: { remaining_g: number | null } | null;
  /** Every control-dish reading for the trial up to the date. */
  controlReadings: { obs_date: string; offered_g: number; remaining_g: number | null; feed_id: string }[];
};

/** Fetch every dataset the day review reads, for one trial and date. */
export async function fetchDayInputs(trialId: string, date: string): Promise<DayInputs> {
  const [obs, welfare, photos, pop, biomass, checklists, control, controlReadings] = await Promise.all([
    supabase.from("observations")
      .select("pen_id,obs_date,offered_g,dish_action,refusal_score,leftover_g,feed_id")
      .eq("trial_id", trialId).lte("obs_date", date),
    supabase.from("welfare_checks")
      .select("id,pen_id,health_flags,substrate_condition,activity,temp_c,humidity_pct,temp_min_c,temp_max_c,humidity_min_pct,humidity_max_pct")
      .eq("trial_id", trialId).eq("obs_date", date),
    supabase.from("session_photos").select("pen_id,photo_am_url,photo_pm_url")
      .eq("trial_id", trialId).eq("obs_date", date),
    supabase.from("population_events").select("id,pen_id,event_date,event_type,count,cause")
      .eq("trial_id", trialId),
    supabase.from("biomass_events").select("pen_id,event_date,net_biomass_g,live_count")
      .eq("trial_id", trialId),
    supabase.from("sop_checklists").select("session,steps")
      .eq("trial_id", trialId).eq("obs_date", date),
    supabase.from("moisture_controls").select("remaining_g")
      .eq("trial_id", trialId).eq("obs_date", date).maybeSingle(),
    supabase.from("moisture_controls").select("obs_date,offered_g,remaining_g,feed_id")
      .eq("trial_id", trialId).lte("obs_date", date),
  ]);
  return {
    obs: obs.data ?? [],
    welfare: welfare.data ?? [],
    photos: photos.data ?? [],
    pop: (pop.data ?? []) as DayInputs["pop"],
    biomass: biomass.data ?? [],
    checklists: checklists.data ?? [],
    control: control.data ?? null,
    controlReadings: (controlReadings.data ?? []).map((c) => ({ ...c, offered_g: Number(c.offered_g), remaining_g: c.remaining_g == null ? null : Number(c.remaining_g) })),
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
  /** The water-loss test is running: the control dish counts in the AM check. */
  controlActive?: boolean;
  /** The trial's control feed — the only feed corrected for water loss. */
  controlFeedId?: string | null;
}) {
  const { pens: allPens, assignments, trialInterval, data: d, calendar, date, siteName } = args;
  const controlActive = !!args.controlActive;

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
    // Trial-pen dishes are emptied every morning; only breeders record a dish action.
    if (isBreeder(id) && !row?.dish_action) miss.push("dish action");
    if (!photoFor(id)?.photo_pm_url) miss.push("PM photo");
    return miss;
  };
  const pmTotal = (_id: string) => 2;

  const amMissing = (id: string) => {
    const w = welfareFor(id);
    const miss: string[] = [];
    if (isBreeder(id)) {
      if (!w?.substrate_condition) miss.push("substrate condition");
    } else {
      // A weighed leftover — or, on older days, the visual score it replaced.
      const o = obsFor(id);
      if (o?.leftover_g == null && !o?.refusal_score) miss.push("leftover (g)");
      if (!w?.activity) miss.push("activity");
    }
    if (!photoFor(id)?.photo_am_url) miss.push("AM photo");
    return miss;
  };
  const amTotal = (id: string) => (isBreeder(id) ? 2 : 3);

  const pmComplete = (list: DayReviewPen[]) => list.filter((p) => pmMissing(p.id).length === 0).length;
  const amComplete = (list: DayReviewPen[]) => list.filter((p) => amMissing(p.id).length === 0).length;

  const controlMissing = controlActive && (d.control?.remaining_g ?? null) == null;

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

  // The control dish: a missing reading is an exception, never a hard stop.
  if (amExpected && controlMissing) {
    const item = {
      key: "am-control", group: "AM session", to: "/am" as const,
      text: amInProgress ? "Control dish — reading not yet recorded" : "Control dish — no leftover reading",
    };
    (amInProgress ? inProgress : exceptions).push(item);
  }

  // SOP steps still unticked.
  const ticksFor = (session: string, length: number) => {
    const steps = d.checklists.find((c) => c.session === session)?.steps ?? null;
    return Array.from({ length }, (_, i) => Boolean(steps?.[i]));
  };
  const pmTicks = ticksFor("pm", PM_STEPS.length);
  (pmExpected && !pmInProgress ? PM_STEPS : []).forEach((step, i) => {
    const done = i === PM_PHOTO_STEP_INDEX ? pmPhotosAll : i === PM_CONTROL_STEP_INDEX && !controlActive ? true : pmTicks[i];
    if (!done) exceptions.push({ key: `pmstep-${i}`, group: "PM checklist", text: `Step ${i + 1} not ticked — ${step}`, to: "/pm" });
  });
  const amTicks = ticksFor("am", AM_STEPS.length);
  (amExpected && !amInProgress ? AM_STEPS : []).forEach((step, i) => {
    const done = i === AM_PHOTO_STEP_INDEX ? amPhotosAll : i === AM_CONTROL_STEP_INDEX && !controlActive ? true : amTicks[i];
    if (!done) exceptions.push({ key: `amstep-${i}`, group: "AM checklist", text: `Step ${i + 1} not ticked — ${step}`, to: "/am" });
  });

  // Portioning runs from the weighed leftover (share left), over consecutive
  // OPERATING days ending on the selected date. Visual scores never count.
  const retentionFor = makeRetention(
    retentionContext(
      args.controlFeedId,
      d.controlReadings.filter((c) => c.feed_id === args.controlFeedId),
      calendar,
    ),
  );
  const shareRun = (penId: string, test: (share: number) => boolean) => {
    const byDate = new Map<string, number | null>();
    for (const o of d.obs.filter((r) => r.pen_id === penId)) {
      const e = feedEaten(o.offered_g, o.leftover_g, retentionFor(o.feed_id, o.obs_date).retention);
      byDate.set(o.obs_date, e ? e.shareLeft : null);
    }
    let n = 0;
    let cursor = date;
    while (calendar.isNonOperating(cursor)) cursor = addDays(cursor, -1);
    for (;;) {
      const v = byDate.get(cursor);
      if (v == null || !test(v)) break;
      n += 1;
      cursor = calendar.previousOperatingDay(cursor);
    }
    return n;
  };
  for (const p of trialPens) {
    const over = shareRun(p.id, (v) => v > OVER_PORTION_SHARE);
    if (over >= 3) {
      exceptions.push({
        key: `run-over-${p.id}`,
        group: "Refusal",
        text: `${p.label} — more than 15% left on ${over} feedings in a row: consider cutting the portion`,
        to: "/am",
        penId: p.id,
      });
    }
    const under = shareRun(p.id, (v) => v < UNDER_PORTION_SHARE);
    if (under >= 2) {
      exceptions.push({
        key: `run-under-${p.id}`,
        group: "Refusal",
        text: `${p.label} — less than 2% left on ${under} feedings in a row: may be feed-limited`,
        to: "/am",
        penId: p.id,
      });
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
    controlActive,
    controlMissing,
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
    else if (e.group === "Refusal") bump("portioning run");
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
