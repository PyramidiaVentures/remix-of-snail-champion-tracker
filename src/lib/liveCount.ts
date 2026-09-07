/**
 * Derived pen population.
 *
 * live_count(pen, date) =
 *     pens.initial_snail_count
 *   + additions on or before date
 *   - mortality / escape / removal on or before date
 */

export interface PopulationEventLike {
  pen_id: string;
  event_date: string;
  event_type: "mortality" | "escape" | "removal" | "addition";
  count: number;
}

export interface PenLike {
  id: string;
  initial_snail_count: number;
}

export function liveCount(
  pen: PenLike | undefined | null,
  events: PopulationEventLike[],
  date: string,
): number {
  if (!pen) return 0;
  let n = pen.initial_snail_count ?? 0;
  for (const e of events) {
    if (e.pen_id !== pen.id || e.event_date > date) continue;
    if (e.event_type === "addition") n += e.count;
    else n -= e.count;
  }
  return n;
}

/** True when any addition event applies to the pen on or before the date. */
export function hasAddition(
  penId: string,
  events: PopulationEventLike[],
  date: string,
): boolean {
  return events.some(
    (e) => e.pen_id === penId && e.event_date <= date && e.event_type === "addition",
  );
}

/** Cumulative mortality for a pen up to and including the date. */
export function cumulativeMortality(
  penId: string,
  events: PopulationEventLike[],
  date: string,
): number {
  return events
    .filter((e) => e.pen_id === penId && e.event_date <= date && e.event_type === "mortality")
    .reduce((s, e) => s + e.count, 0);
}
