/**
 * Trial metrics — everything is computed on read from stored inputs.
 * Nothing here is persisted, so correcting an input or adding a dry-matter %
 * retroactively updates every figure.
 *
 * Headline conversion: "FCR (feed eaten)" — feed offered minus the weighed
 * leftover (corrected for water loss on the control feed), per kg gain.
 * Secondary: "Feed offered per kg gain" — never labelled FCR.
 *
 * Interval feed window: the team weighs BEFORE the evening feed, so an
 * interval from weighing A to weighing B counts feedings A <= obs_date < B.
 */

export interface ControlReading {
  obs_date: string;
  offered_g: number;
  remaining_g: number | null;
}

export type RetentionStatus = "dry feed, not corrected" | "measured" | "from test" | "not tested";

export interface RetentionContext {
  /** The trial's control feed — the only feed ever corrected. */
  controlFeedId: string | null;
  readings: ControlReading[];
  /** Nights from feeding date D to the morning it was weighed (normally 1). */
  nightsFor: (date: string) => number;
  /** Next feeding day after D — used to find consecutive test readings. */
  nextFeedingDay: (date: string) => string;
}

export interface Retention {
  retention: number;
  retentionNight: number;
  nights: number;
  status: RetentionStatus;
}

/** Build a lookup for the water-loss retention applied to a feeding. */
export function makeRetention(ctx: RetentionContext | null | undefined) {
  const nightsFor = ctx?.nightsFor ?? (() => 1);
  const perNight = new Map<string, number>();
  for (const r of ctx?.readings ?? []) {
    if (r.remaining_g == null || !(r.offered_g > 0)) continue;
    const n = Math.max(1, nightsFor(r.obs_date));
    perNight.set(r.obs_date, Math.pow(r.remaining_g / r.offered_g, 1 / n));
  }
  // Runs of consecutive readings (consecutive feeding days).
  const dates = Array.from(perNight.keys()).sort();
  const runs: { end: string; mean: number }[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (!cur.length) return;
    const m = cur.reduce((s, d) => s + perNight.get(d)!, 0) / cur.length;
    runs.push({ end: cur[cur.length - 1]!, mean: m });
    cur = [];
  };
  for (const d of dates) {
    const prev = cur[cur.length - 1];
    if (prev && ctx && ctx.nextFeedingDay(prev) !== d) flush();
    cur.push(d);
  }
  flush();

  return (feedId: string | null | undefined, date: string): Retention => {
    const nights = Math.max(1, nightsFor(date));
    if (!ctx?.controlFeedId || feedId !== ctx.controlFeedId) {
      return { retention: 1, retentionNight: 1, nights, status: "dry feed, not corrected" };
    }
    const measured = perNight.get(date);
    if (measured != null) {
      return { retention: Math.pow(measured, nights), retentionNight: measured, nights, status: "measured" };
    }
    if (runs.length) {
      // Most recent test ending on or before D; a feeding before any test
      // uses the earliest test.
      const before = runs.filter((r) => r.end <= date);
      const run = before.length ? before[before.length - 1]! : runs[0]!;
      return { retention: Math.pow(run.mean, nights), retentionNight: run.mean, nights, status: "from test" };
    }
    return { retention: 1, retentionNight: 1, nights, status: "not tested" };
  };
}

export interface FeedEaten {
  leftoverAsOffered_g: number;
  eaten_g: number;
  shareLeft: number; // 0..1+
}

/** Feed eaten for one feeding. Null when offered or leftover is missing. */
export function feedEaten(
  offered_g: number | null | undefined,
  leftover_g: number | null | undefined,
  retention: number,
): FeedEaten | null {
  if (offered_g == null || leftover_g == null || !(offered_g > 0) || !(retention > 0)) return null;
  const leftoverAsOffered_g = leftover_g / retention;
  const eaten_g = Math.min(offered_g, Math.max(0, offered_g - leftoverAsOffered_g));
  return { leftoverAsOffered_g, eaten_g, shareLeft: leftoverAsOffered_g / offered_g };
}

/** Share-left bands used by charts and advisories. */
export const SHARE_BANDS = [
  { key: "b0_2", label: "0–2%", meaning: "Rising means feed-limited — portions may be too small." },
  { key: "b2_5", label: "2–5%", meaning: "Close to eaten out." },
  { key: "b5_10", label: "5–10% (target)", meaning: "Target band." },
  { key: "b10_25", label: "10–25%", meaning: "A little over-portioned." },
  { key: "b25_50", label: "25–50%", meaning: "Over-portioned — consider cutting." },
  { key: "b50", label: "Over 50%", meaning: "Rising means cut portions." },
] as const;
export type ShareBand = (typeof SHARE_BANDS)[number]["key"];

export function shareBand(share: number): ShareBand {
  const pct = share * 100;
  if (pct < 2) return "b0_2";
  if (pct < 5) return "b2_5";
  if (pct < 10) return "b5_10";
  if (pct < 25) return "b10_25";
  if (pct <= 50) return "b25_50";
  return "b50";
}

/** Historical visual score → band ("visual estimate"). Never used in eaten_g. */
export const SCORE_BAND: Record<string, ShareBand> = {
  none_left: "b0_2",
  trace: "b2_5",
  about_25: "b10_25",
  about_50: "b25_50",
  most_left: "b50",
};

/** Band for one observation: weighed leftover first, else the visual score. */
export function observationBand(
  o: { feed_id?: string | null; obs_date: string; offered_g: number | null; leftover_g?: number | null; refusal_score?: string | null },
  retentionFor: ReturnType<typeof makeRetention>,
): { band: ShareBand; visual: boolean; shareLeft: number | null } | null {
  const e = feedEaten(o.offered_g, o.leftover_g, retentionFor(o.feed_id, o.obs_date).retention);
  if (e) return { band: shareBand(e.shareLeft), visual: false, shareLeft: e.shareLeft };
  if (o.refusal_score && SCORE_BAND[o.refusal_score]) return { band: SCORE_BAND[o.refusal_score]!, visual: true, shareLeft: null };
  return null;
}

/** Minimum coverage of weighed leftovers before FCR (feed eaten) is shown. */
export const EATEN_COVERAGE_MIN = 0.9;

export interface MetricsInput {
  trial: { id: string; start_date: string; acclimation_days: number };
  pens: { id: string; label: string }[];
  feeds: { id: string; name: string; dm_percent: number | null }[];
  treatments: { id: string; label: string; feed_id: string }[];
  assignments: { pen_id: string; treatment_id: string }[];
  observations: {
    pen_id: string;
    feed_id: string;
    obs_date: string;
    offered_g: number | null;
    dish_action: string | null;
    leftover_g?: number | null;
  }[];
  biomass: {
    pen_id: string;
    event_date: string;
    net_biomass_g: number;
    live_count: number;
  }[];
  includeAcclimation: boolean;
  dryMatter: boolean;
  retention?: RetentionContext | null;
}

export interface IntervalMetrics {
  from: string;
  to: string;
  days: number;
  meanWeight1: number;
  meanWeight2: number;
  survivingCount: number;
  gain_g: number | null;
  offered_g: number;
  offeredDm_g: number | null;
  /** kg feed offered per kg gain — null when gain is not positive. */
  offeredPerKgGain: number | null;
  /** Sum of eaten_g over feedings with a weighed leftover. */
  eaten_g: number;
  eatenDm_g: number | null;
  feedingDays: number;
  leftoverDays: number;
  leftoverCoverage: number | null;
  /** FCR (feed eaten) — null when gain <= 0 or coverage < 90%. */
  eatenPerKgGain: number | null;
  meanShareLeft: number | null;
  sgr: number | null;
  survival: number | null;
  feedingRate: number | null;
}

export interface PenMetrics {
  penId: string;
  label: string;
  treatmentId: string | null;
  intervals: IntervalMetrics[];
  cumOffered_g: number;
  cumOfferedDm_g: number | null;
  cumEaten_g: number;
  feedingDays: number;
  leftoverDays: number;
  leftoverCoverage: number | null;
  eatenPerKgGain: number | null;
  meanShareLeft: number | null;
  totalGain_g: number | null;
  offeredPerKgGain: number | null;
  meanSgr: number | null;
  survival: number | null;
  meanFeedingRate: number | null;
  weightSeries: { date: string; meanWeight: number; liveCount: number }[];
  offeredSeries: { date: string; cumulative: number }[];
}

export interface TreatmentMetrics {
  treatmentId: string;
  label: string;
  pens: PenMetrics[];
  cumOffered_g: number | null;
  cumEaten_g: number | null;
  totalGain_g: number | null;
  offeredPerKgGain: number | null;
  eatenPerKgGain: number | null;
  /** Pens with a complete FCR (feed eaten) / pens in the treatment. */
  eatenCompletePens: number;
  meanShareLeft: number | null;
  meanSgr: number | null;
  survival: number | null;
  meanFeedingRate: number | null;
}

export interface TrialMetrics {
  pens: PenMetrics[];
  treatments: TreatmentMetrics[];
  dmAvailable: boolean;
  dmBasis: boolean;
}

const DAY = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

export function addDays(date: string, n: number): string {
  const d = new Date(Date.parse(date) + n * DAY);
  return d.toISOString().slice(0, 10);
}

/** Mean of the non-null values; null when nothing qualifies. */
export function meanOf(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const EMPTYING_ACTIONS = new Set(["emptied_refilled", "emptied_spoiled"]);

/**
 * Carry-over age per recorded date (breeder pens only — trial pens no longer
 * carry feed over): calendar days since the dish was last emptied.
 */
export function carryOverDaysSeries(
  actionsByDate: { date: string; action: string | null }[],
): { date: string; days: number }[] {
  const sorted = [...actionsByDate].sort((a, b) => a.date.localeCompare(b.date));
  const out: { date: string; days: number }[] = [];
  let lastEmptied: string | null = null;
  for (const row of sorted) {
    if (row.action != null && EMPTYING_ACTIONS.has(row.action)) {
      lastEmptied = row.date;
      out.push({ date: row.date, days: 0 });
    } else if (lastEmptied) {
      out.push({ date: row.date, days: daysBetween(lastEmptied, row.date) });
    }
  }
  return out;
}

/** True when feeding date d falls in the interval's feed window [from, to). */
export function inFeedWindow(d: string, iv: { from: string; to: string }): boolean {
  return d >= iv.from && d < iv.to;
}

export interface IntervalExtras {
  missingFeedingDays: number;
}

/**
 * Feeding-day figures for one weighing interval, shared by Results and the
 * interval_summary export. Window is [from, to). Closed days are not expected.
 */
export function intervalExtras(
  interval: { from: string; to: string },
  penObservations: { obs_date: string; offered_g: number | null }[],
  dateIncluded: (d: string) => boolean,
  isOperating: (d: string) => boolean = () => true,
): IntervalExtras {
  const fedDates = new Set(
    penObservations
      .filter((o) => o.offered_g != null && inFeedWindow(o.obs_date, interval) && dateIncluded(o.obs_date))
      .map((o) => o.obs_date),
  );
  let missing = 0;
  for (let d = interval.from; d < interval.to; d = addDays(d, 1)) {
    if (!dateIncluded(d)) continue;
    if (!isOperating(d)) continue;
    if (!fedDates.has(d)) missing += 1;
  }
  return { missingFeedingDays: missing };
}

/**
 * Specific growth rate, % per day. Single definition — used by the Results
 * interval table and the live preview on Weigh Day.
 */
export function specificGrowthRate(
  meanWeight1: number | null,
  meanWeight2: number | null,
  days: number,
): number | null {
  if (meanWeight1 == null || meanWeight2 == null) return null;
  if (!(meanWeight1 > 0) || !(meanWeight2 > 0) || !(days > 0)) return null;
  return ((Math.log(meanWeight2) - Math.log(meanWeight1)) / days) * 100;
}

const perKg = (feed: number | null, gain: number | null) =>
  feed != null && gain != null && gain > 0 ? feed / 1000 / (gain / 1000) : null;

export function computeMetrics(input: MetricsInput): TrialMetrics {
  const {
    trial, pens, feeds, treatments, assignments,
    observations, biomass, includeAcclimation, dryMatter,
  } = input;

  const dmByFeed = new Map(feeds.map((f) => [f.id, f.dm_percent]));
  const treatmentByPen = new Map(assignments.map((a) => [a.pen_id, a.treatment_id]));
  const retentionFor = makeRetention(input.retention);

  const trialFeedIds = new Set(treatments.map((t) => t.feed_id));
  const dmAvailable =
    trialFeedIds.size > 0 &&
    Array.from(trialFeedIds).every((id) => dmByFeed.get(id) != null);
  const dmBasis = dryMatter && dmAvailable;

  const acclimationEnd = addDays(trial.start_date, trial.acclimation_days);
  const dateIncluded = (d: string) => includeAcclimation || d >= acclimationEnd;

  const penMetrics: PenMetrics[] = pens.map((pen) => {
    const penObs = observations
      .filter((o) => o.pen_id === pen.id && dateIncluded(o.obs_date))
      .sort((a, b) => a.obs_date.localeCompare(b.obs_date));

    const dayFigures = (date: string) => {
      const rows = penObs.filter((o) => o.obs_date === date);
      let fresh = 0;
      let dm: number | null = 0;
      let fed = false;
      let eaten = 0;
      let eatenDm: number | null = 0;
      let weighed = false;
      let offeredWeighed = 0;
      let leftWeighed = 0;
      for (const o of rows) {
        const pct = dmByFeed.get(o.feed_id);
        if (o.offered_g != null) fed = true;
        fresh += o.offered_g ?? 0;
        dm = dm == null || pct == null ? null : dm + (o.offered_g ?? 0) * (pct / 100);
        const e = feedEaten(o.offered_g, o.leftover_g, retentionFor(o.feed_id, o.obs_date).retention);
        if (e) {
          weighed = true;
          eaten += e.eaten_g;
          eatenDm = eatenDm == null || pct == null ? null : eatenDm + e.eaten_g * (pct / 100);
          offeredWeighed += o.offered_g!;
          leftWeighed += e.leftoverAsOffered_g;
        }
      }
      return {
        fresh, dm, fed, eaten, eatenDm, weighed,
        shareLeft: weighed && offeredWeighed > 0 ? leftWeighed / offeredWeighed : null,
      };
    };

    const weighings = biomass
      .filter((b) => b.pen_id === pen.id)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));

    const weightSeries = weighings
      .filter((w) => w.live_count > 0)
      .map((w) => ({
        date: w.event_date,
        meanWeight: w.net_biomass_g / w.live_count,
        liveCount: w.live_count,
      }));

    const intervals: IntervalMetrics[] = [];
    for (let i = 1; i < weighings.length; i++) {
      const a = weighings[i - 1];
      const b = weighings[i];
      // An interval must measure gain and feed over exactly the same days.
      if (!dateIncluded(a.event_date)) continue;
      const days = daysBetween(a.event_date, b.event_date);
      const valid = a.live_count > 0 && b.live_count > 0 && days > 0;

      const meanWeight1 = valid ? a.net_biomass_g / a.live_count : NaN;
      const meanWeight2 = valid ? b.net_biomass_g / b.live_count : NaN;
      // Gain = change in MEAN weight × surviving count.
      const gain_g = valid ? (meanWeight2 - meanWeight1) * b.live_count : null;

      let offered = 0;
      let offeredDm: number | null = 0;
      let eaten = 0;
      let eatenDm: number | null = 0;
      let feedingDays = 0;
      let leftoverDays = 0;
      const shares: number[] = [];
      // Weighing happens before the evening feed: window is [A, B).
      for (let d = a.event_date; d < b.event_date; d = addDays(d, 1)) {
        if (!dateIncluded(d)) continue;
        const f = dayFigures(d);
        offered += f.fresh;
        offeredDm = offeredDm == null || f.dm == null ? null : offeredDm + f.dm;
        if (f.fed) feedingDays += 1;
        if (f.weighed) {
          leftoverDays += 1;
          eaten += f.eaten;
          eatenDm = eatenDm == null || f.eatenDm == null ? null : eatenDm + f.eatenDm;
          if (f.shareLeft != null) shares.push(f.shareLeft);
        }
      }

      const coverage = feedingDays > 0 ? leftoverDays / feedingDays : null;
      const basisOffered = dmBasis ? offeredDm : offered;
      const basisEaten = dmBasis ? eatenDm : eaten;
      intervals.push({
        from: a.event_date,
        to: b.event_date,
        days,
        meanWeight1,
        meanWeight2,
        survivingCount: b.live_count,
        gain_g,
        offered_g: offered,
        offeredDm_g: offeredDm,
        offeredPerKgGain: perKg(basisOffered, gain_g),
        eaten_g: eaten,
        eatenDm_g: eatenDm,
        feedingDays,
        leftoverDays,
        leftoverCoverage: coverage,
        eatenPerKgGain: coverage != null && coverage >= EATEN_COVERAGE_MIN ? perKg(basisEaten, gain_g) : null,
        meanShareLeft: meanOf(shares),
        sgr: valid ? specificGrowthRate(meanWeight1, meanWeight2, days) : null,
        survival: valid ? (b.live_count / a.live_count) * 100 : null,
        feedingRate:
          valid && a.net_biomass_g > 0 ? (offered / days / a.net_biomass_g) * 100 : null,
      });
    }

    const cumOffered = intervals.reduce((s, i) => s + i.offered_g, 0);
    const cumOfferedDm = intervals.reduce<number | null>(
      (s, i) => (s == null || i.offeredDm_g == null ? null : s + i.offeredDm_g),
      0,
    );
    const cumEaten = intervals.reduce((s, i) => s + i.eaten_g, 0);
    const cumEatenDm = intervals.reduce<number | null>(
      (s, i) => (s == null || i.eatenDm_g == null ? null : s + i.eatenDm_g),
      0,
    );
    const feedingDays = intervals.reduce((s, i) => s + i.feedingDays, 0);
    const leftoverDays = intervals.reduce((s, i) => s + i.leftoverDays, 0);
    const coverage = feedingDays > 0 ? leftoverDays / feedingDays : null;
    const gains = intervals.map((i) => i.gain_g).filter((g): g is number => g != null);
    const totalGain = intervals.length && gains.length === intervals.length
      ? gains.reduce((a, b) => a + b, 0)
      : null;

    const first = weightSeries[0];
    const last = weightSeries[weightSeries.length - 1];
    const survival =
      first && last && first.liveCount > 0 && weightSeries.length > 1
        ? (last.liveCount / first.liveCount) * 100
        : null;

    let running = 0;
    const offeredSeries = Array.from(new Set(penObs.map((o) => o.obs_date)))
      .sort()
      .map((date) => {
        running += dayFigures(date).fresh;
        return { date, cumulative: running };
      });

    return {
      penId: pen.id,
      label: pen.label,
      treatmentId: treatmentByPen.get(pen.id) ?? null,
      intervals,
      cumOffered_g: cumOffered,
      cumOfferedDm_g: cumOfferedDm,
      cumEaten_g: cumEaten,
      feedingDays,
      leftoverDays,
      leftoverCoverage: coverage,
      eatenPerKgGain:
        coverage != null && coverage >= EATEN_COVERAGE_MIN ? perKg(dmBasis ? cumEatenDm : cumEaten, totalGain) : null,
      meanShareLeft: meanOf(intervals.map((i) => i.meanShareLeft)),
      totalGain_g: totalGain,
      offeredPerKgGain: perKg(dmBasis ? cumOfferedDm : cumOffered, totalGain),
      meanSgr: meanOf(intervals.map((i) => i.sgr)),
      survival,
      meanFeedingRate: meanOf(intervals.map((i) => i.feedingRate)),
      weightSeries,
      offeredSeries,
    };
  });

  // Treatment figures are the MEAN of the pen figures, never a pooled total.
  const treatmentMetrics: TreatmentMetrics[] = treatments.map((t) => {
    const group = penMetrics.filter((p) => p.treatmentId === t.id);
    const complete = group.filter((p) => p.eatenPerKgGain != null);
    return {
      treatmentId: t.id,
      label: t.label,
      pens: group,
      cumOffered_g: meanOf(group.map((p) => (dmBasis ? p.cumOfferedDm_g : p.cumOffered_g))),
      cumEaten_g: meanOf(group.map((p) => p.cumEaten_g)),
      totalGain_g: meanOf(group.map((p) => p.totalGain_g)),
      offeredPerKgGain: meanOf(group.map((p) => p.offeredPerKgGain)),
      // Only shown once every pen in the treatment has a complete figure.
      eatenPerKgGain: group.length && complete.length === group.length ? meanOf(complete.map((p) => p.eatenPerKgGain)) : null,
      eatenCompletePens: complete.length,
      meanShareLeft: meanOf(group.map((p) => p.meanShareLeft)),
      meanSgr: meanOf(group.map((p) => p.meanSgr)),
      survival: meanOf(group.map((p) => p.survival)),
      meanFeedingRate: meanOf(group.map((p) => p.meanFeedingRate)),
    };
  });

  return { pens: penMetrics, treatments: treatmentMetrics, dmAvailable, dmBasis };
}

/** Round a value for display/export only. Never round inside calculations. */
export function roundOut(v: number | null | undefined, dp: number): number | null {
  if (v == null || typeof v !== "number" || !Number.isFinite(v)) return null;
  return Number(v.toFixed(dp));
}

/** Label for an incomplete FCR (feed eaten). */
export function incompleteLabel(leftoverDays: number, feedingDays: number): string {
  return `incomplete (${leftoverDays} of ${feedingDays} days weighed)`;
}
