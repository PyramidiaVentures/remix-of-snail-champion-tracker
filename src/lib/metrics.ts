/**
 * Trial metrics — everything is computed on read from stored inputs.
 * Nothing here is persisted, so correcting an input or adding a dry-matter %
 * retroactively updates every figure.
 *
 * The conversion metric is offer-based and is always called
 * "Feed offered per kg gain".
 */

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
  }[];
  biomass: {
    pen_id: string;
    event_date: string;
    net_biomass_g: number;
    live_count: number;
  }[];
  includeAcclimation: boolean;
  dryMatter: boolean;
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
  totalGain_g: number | null;
  offeredPerKgGain: number | null;
  meanSgr: number | null;
  survival: number | null;
  meanFeedingRate: number | null;
  meanCarryOverDays: number | null;
  maxCarryOverDays: number | null;
  spoilageRate: number | null;
  weightSeries: { date: string; meanWeight: number; liveCount: number }[];
  offeredSeries: { date: string; cumulative: number }[];
}

export interface TreatmentMetrics {
  treatmentId: string;
  label: string;
  pens: PenMetrics[];
  cumOffered_g: number | null;
  totalGain_g: number | null;
  offeredPerKgGain: number | null;
  meanSgr: number | null;
  survival: number | null;
  meanFeedingRate: number | null;
  meanCarryOverDays: number | null;
  maxCarryOverDays: number | null;
  spoilageRate: number | null;
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

function maxOf(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!xs.length) return null;
  return Math.max(...xs);
}

/** Lengths of each consecutive run of dish_action = 'topped_up'. */
export function carryOverRuns(actionsByDate: { date: string; action: string | null }[]): number[] {
  const sorted = [...actionsByDate].sort((a, b) => a.date.localeCompare(b.date));
  const runs: number[] = [];
  let run = 0;
  for (const row of sorted) {
    if (row.action === "topped_up") run += 1;
    else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

export interface IntervalExtras {
  missingFeedingDays: number;
  meanCarryOverDays: number | null;
  maxCarryOverDays: number | null;
  spoilageRate: number | null;
}

/**
 * Dish and feeding-day figures for one weighing interval.
 * Shared by the Results pen detail table and the interval_summary export so
 * the two can never drift apart.
 */
export function intervalExtras(
  interval: { from: string; to: string },
  penObservations: { obs_date: string; offered_g: number | null; dish_action: string | null }[],
  dateIncluded: (d: string) => boolean,
): IntervalExtras {
  const inRange = penObservations.filter(
    (o) => o.obs_date > interval.from && o.obs_date <= interval.to && dateIncluded(o.obs_date),
  );
  const byDate = new Map<string, string | null>();
  for (const o of inRange) if (o.dish_action != null) byDate.set(o.obs_date, o.dish_action);
  const runs = carryOverRuns(Array.from(byDate, ([date, action]) => ({ date, action })));
  const spoiled = Array.from(byDate.values()).filter((a) => a === "emptied_spoiled").length;

  const fedDates = new Set(inRange.filter((o) => o.offered_g != null).map((o) => o.obs_date));
  let missing = 0;
  for (let d = addDays(interval.from, 1); d <= interval.to; d = addDays(d, 1)) {
    if (!dateIncluded(d)) continue;
    if (!fedDates.has(d)) missing += 1;
  }

  return {
    missingFeedingDays: missing,
    meanCarryOverDays: byDate.size ? (runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0) : null,
    maxCarryOverDays: byDate.size ? (runs.length ? Math.max(...runs) : 0) : null,
    spoilageRate: byDate.size ? (spoiled / byDate.size) * 100 : null,
  };
}

export function computeMetrics(input: MetricsInput): TrialMetrics {
  const {
    trial, pens, feeds, treatments, assignments,
    observations, biomass, includeAcclimation, dryMatter,
  } = input;

  const dmByFeed = new Map(feeds.map((f) => [f.id, f.dm_percent]));
  const treatmentByPen = new Map(assignments.map((a) => [a.pen_id, a.treatment_id]));

  // Every feed used by a treatment in this trial must have a dm_percent
  // before the dry-matter basis can be offered.
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

    const offeredOn = (date: string) => {
      const rows = penObs.filter((o) => o.obs_date === date);
      const fresh = rows.reduce((s, o) => s + (o.offered_g ?? 0), 0);
      const dm = rows.reduce<number | null>((s, o) => {
        const pct = dmByFeed.get(o.feed_id);
        if (s == null || pct == null) return null;
        return s + (o.offered_g ?? 0) * (pct / 100);
      }, 0);
      return { fresh, dm };
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
      const days = daysBetween(a.event_date, b.event_date);
      const valid = a.live_count > 0 && b.live_count > 0 && days > 0;

      const meanWeight1 = valid ? a.net_biomass_g / a.live_count : NaN;
      const meanWeight2 = valid ? b.net_biomass_g / b.live_count : NaN;

      // Gain is the change in MEAN weight × the surviving count — never the
      // raw difference in net biomass, which would read mortality as loss.
      const gain_g = valid ? (meanWeight2 - meanWeight1) * b.live_count : null;

      let offered = 0;
      let offeredDm: number | null = 0;
      for (
        let d = addDays(a.event_date, 1);
        d <= b.event_date;
        d = addDays(d, 1)
      ) {
        if (!dateIncluded(d)) continue;
        const { fresh, dm } = offeredOn(d);
        offered += fresh;
        offeredDm = offeredDm == null || dm == null ? null : offeredDm + dm;
      }

      const usable = gain_g != null && gain_g > 0;
      const basisOffered = dmBasis ? offeredDm : offered;
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
        offeredPerKgGain:
          usable && basisOffered != null && gain_g! > 0
            ? basisOffered / 1000 / (gain_g! / 1000)
            : null,
        sgr:
          valid && meanWeight1 > 0 && meanWeight2 > 0
            ? ((Math.log(meanWeight2) - Math.log(meanWeight1)) / days) * 100
            : null,
        survival: valid ? (b.live_count / a.live_count) * 100 : null,
        feedingRate:
          valid && a.net_biomass_g > 0
            ? (offered / days / a.net_biomass_g) * 100
            : null,
      });
    }

    const cumOffered = intervals.reduce((s, i) => s + i.offered_g, 0);
    const cumOfferedDm = intervals.reduce<number | null>(
      (s, i) => (s == null || i.offeredDm_g == null ? null : s + i.offeredDm_g),
      0,
    );
    const gains = intervals.map((i) => i.gain_g).filter((g): g is number => g != null);
    const totalGain = intervals.length && gains.length === intervals.length
      ? gains.reduce((a, b) => a + b, 0)
      : null;

    const basisCum = dmBasis ? cumOfferedDm : cumOffered;
    const offeredPerKgGain =
      totalGain != null && totalGain > 0 && basisCum != null
        ? basisCum / 1000 / (totalGain / 1000)
        : null;

    const first = weightSeries[0];
    const last = weightSeries[weightSeries.length - 1];
    const survival =
      first && last && first.liveCount > 0 && weightSeries.length > 1
        ? (last.liveCount / first.liveCount) * 100
        : null;

    // Carry-over and spoilage, from the recorded dish actions.
    const actionRows = penObs.filter((o) => o.dish_action != null);
    const byDate = new Map<string, string | null>();
    for (const o of penObs) if (o.dish_action != null) byDate.set(o.obs_date, o.dish_action);
    const runs = carryOverRuns(Array.from(byDate, ([date, action]) => ({ date, action })));
    const spoiled = actionRows.filter((o) => o.dish_action === "emptied_spoiled").length;

    let running = 0;
    const offeredSeries = Array.from(
      new Set(penObs.map((o) => o.obs_date)),
    )
      .sort()
      .map((date) => {
        running += offeredOn(date).fresh;
        return { date, cumulative: running };
      });

    return {
      penId: pen.id,
      label: pen.label,
      treatmentId: treatmentByPen.get(pen.id) ?? null,
      intervals,
      cumOffered_g: cumOffered,
      cumOfferedDm_g: cumOfferedDm,
      totalGain_g: totalGain,
      offeredPerKgGain,
      meanSgr: meanOf(intervals.map((i) => i.sgr)),
      survival,
      meanFeedingRate: meanOf(intervals.map((i) => i.feedingRate)),
      meanCarryOverDays: byDate.size ? (runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0) : null,
      maxCarryOverDays: byDate.size ? (runs.length ? Math.max(...runs) : 0) : null,
      spoilageRate: byDate.size ? (spoiled / byDate.size) * 100 : null,
      weightSeries,
      offeredSeries,
    };
  });

  // Treatment figures are the MEAN of the pen figures, never a pooled total.
  const treatmentMetrics: TreatmentMetrics[] = treatments.map((t) => {
    const group = penMetrics.filter((p) => p.treatmentId === t.id);
    return {
      treatmentId: t.id,
      label: t.label,
      pens: group,
      cumOffered_g: meanOf(group.map((p) => (dmBasis ? p.cumOfferedDm_g : p.cumOffered_g))),
      totalGain_g: meanOf(group.map((p) => p.totalGain_g)),
      offeredPerKgGain: meanOf(group.map((p) => p.offeredPerKgGain)),
      meanSgr: meanOf(group.map((p) => p.meanSgr)),
      survival: meanOf(group.map((p) => p.survival)),
      meanFeedingRate: meanOf(group.map((p) => p.meanFeedingRate)),
      meanCarryOverDays: meanOf(group.map((p) => p.meanCarryOverDays)),
      maxCarryOverDays: maxOf(group.map((p) => p.maxCarryOverDays)),
      spoilageRate: meanOf(group.map((p) => p.spoilageRate)),
    };
  });

  return { pens: penMetrics, treatments: treatmentMetrics, dmAvailable, dmBasis };
}

/** Round a value for display/export only. Never round inside calculations. */
export function roundOut(v: number | null | undefined, dp: number): number | null {
  if (v == null || typeof v !== "number" || !Number.isFinite(v)) return null;
  return Number(v.toFixed(dp));
}
