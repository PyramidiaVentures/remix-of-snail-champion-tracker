// Core calculations for the SNOVA feed palatability experiment.

export interface ObservationRow {
  round_id: string;
  pen_id: string;
  feed_id: string;
  obs_date: string;
  weight_given_g: number | null;
  weight_leftover_g: number | null;
  is_acclimation: boolean;
}

export interface EvapRow {
  round_id: string;
  feed_id: string;
  obs_date: string;
  control_given_g: number | null;
  control_leftover_g: number | null;
}

/** Compute intake for a single observation given its matching evap control. Returns null if data is missing. */
export function computeIntake(obs: ObservationRow, evap?: EvapRow): number | null {
  if (obs.weight_given_g == null || obs.weight_leftover_g == null) return null;
  if (!evap || evap.control_given_g == null || evap.control_leftover_g == null) return null;
  const fresh_loss = obs.weight_given_g - obs.weight_leftover_g;
  const evap_fraction = evap.control_given_g === 0 ? 0 : (evap.control_given_g - evap.control_leftover_g) / evap.control_given_g;
  const intake = fresh_loss - obs.weight_given_g * evap_fraction;
  return Math.max(0, intake);
}

export interface RoundScoreResult {
  perFeed: Record<string, { pen_ratios: Record<string, number>; round_score: number; mean_intake: Record<string, number> }>;
  championFeedId: string | null;
  winnerFeedId: string | null;
  winnerScore: number;
  usedFallbackChampion: boolean;
}

/** Compute champion-relative scores for a round.
 * If championFeedId is null, fall back to each pen's highest-intake feed as reference (round 1).
 */
export function scoreRound(
  observations: ObservationRow[],
  evapControls: EvapRow[],
  championFeedId: string | null,
  penIds: string[],
  feedIds: string[],
  includeAcclimation = false,
): RoundScoreResult {
  const evapByKey = new Map(evapControls.map((e) => [`${e.feed_id}|${e.obs_date}`, e] as const));

  // mean intake per feed per pen across scoring days
  const meanIntake: Record<string, Record<string, number>> = {};
  for (const feedId of feedIds) {
    meanIntake[feedId] = {};
    for (const penId of penIds) {
      const rows = observations.filter(
        (o) => o.feed_id === feedId && o.pen_id === penId && (includeAcclimation || !o.is_acclimation),
      );
      const intakes = rows
        .map((r) => computeIntake(r, evapByKey.get(`${r.feed_id}|${r.obs_date}`)))
        .filter((v): v is number => v != null);
      meanIntake[feedId][penId] = intakes.length ? intakes.reduce((a, b) => a + b, 0) / intakes.length : NaN;
    }
  }

  // per-pen champion reference intake
  const usedFallback = !championFeedId;
  const refIntake: Record<string, number> = {};
  for (const penId of penIds) {
    if (championFeedId) {
      refIntake[penId] = meanIntake[championFeedId]?.[penId] ?? NaN;
    } else {
      const vals = feedIds.map((f) => meanIntake[f][penId]).filter((v) => !isNaN(v));
      refIntake[penId] = vals.length ? Math.max(...vals) : NaN;
    }
  }

  const perFeed: RoundScoreResult["perFeed"] = {};
  for (const feedId of feedIds) {
    const ratios: Record<string, number> = {};
    for (const penId of penIds) {
      const num = meanIntake[feedId][penId];
      const den = refIntake[penId];
      ratios[penId] = !isNaN(num) && !isNaN(den) && den > 0 ? num / den : NaN;
    }
    const validRatios = Object.values(ratios).filter((v) => !isNaN(v));
    const round_score = validRatios.length ? validRatios.reduce((a, b) => a + b, 0) / validRatios.length : NaN;
    perFeed[feedId] = { pen_ratios: ratios, round_score, mean_intake: meanIntake[feedId] };
  }

  let winnerFeedId: string | null = null;
  let winnerScore = -Infinity;
  for (const [fid, v] of Object.entries(perFeed)) {
    if (!isNaN(v.round_score) && v.round_score > winnerScore) {
      winnerScore = v.round_score;
      winnerFeedId = fid;
    }
  }

  return { perFeed, championFeedId, winnerFeedId, winnerScore, usedFallbackChampion: usedFallback };
}
