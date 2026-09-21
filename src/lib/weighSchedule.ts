import { addDays, daysBetween } from "@/lib/metrics";

/**
 * Per-pen weighing schedule.
 *
 * A pen may carry its own weighing_interval_days; when it is null the trial's
 * interval applies. This is scheduling only — no growth calculation uses it.
 */

export interface SchedulePen {
  id: string;
  label: string;
  role?: string | null;
  weighing_interval_days?: number | null;
}

export interface PenSchedule {
  penId: string;
  label: string;
  isBreeder: boolean;
  /** Interval actually in force for this pen, or null when it has no schedule. */
  effectiveInterval: number | null;
  /** True when the pen uses the trial default rather than its own interval. */
  usesTrialDefault: boolean;
  lastWeighed: string | null;
  /** Date the pen is next due, or null when it has no schedule at all. */
  nextDue: string | null;
  /** The next due weighing is the pen's first (baseline). */
  isBaseline: boolean;
  dueToday: boolean;
  overdueDays: number;
}

export function buildSchedule({
  pens,
  trialInterval,
  startDateByPen,
  events,
  today,
  isOperating = () => true,
  nextOperatingDay,
}: {
  pens: SchedulePen[];
  trialInterval: number | null | undefined;
  /** Assignment start date per pen — when the baseline weighing is due. */
  startDateByPen: Map<string, string>;
  events: { pen_id: string; event_date: string }[];
  today: string;
  /** Site operating calendar: a pen due on a closed day rolls to the next open one. */
  isOperating?: (d: string) => boolean;
  nextOperatingDay?: (d: string) => string;
}): PenSchedule[] {
  const lastByPen = new Map<string, string>();
  for (const e of events) {
    const prev = lastByPen.get(e.pen_id);
    if (!prev || e.event_date > prev) lastByPen.set(e.pen_id, e.event_date);
  }

  const roll = (d: string) => {
    if (nextOperatingDay) return nextOperatingDay(d);
    let cursor = d;
    for (let i = 0; i < 366 && !isOperating(cursor); i++) cursor = addDays(cursor, 1);
    return cursor;
  };

  return pens.map((p) => {
    const isBreeder = p.role === "breeder";
    const own = p.weighing_interval_days ?? null;
    // A breeder pen is only scheduled when someone set an interval on it.
    const effectiveInterval = own ?? (isBreeder ? null : (trialInterval ?? null));
    const lastWeighed = lastByPen.get(p.id) ?? null;
    const start = startDateByPen.get(p.id) ?? null;

    let nextDue: string | null = null;
    let isBaseline = false;
    if (effectiveInterval && effectiveInterval > 0) {
      if (lastWeighed) {
        nextDue = addDays(lastWeighed, effectiveInterval);
      } else if (start) {
        nextDue = start;
        isBaseline = true;
      }
    }
    // A pen due on a non-operating day is due on the next operating day, and
    // is not overdue until then.
    if (nextDue) nextDue = roll(nextDue);

    const overdueDays = nextDue && nextDue < today ? daysBetween(nextDue, today) : 0;
    return {
      penId: p.id,
      label: p.label,
      isBreeder,
      effectiveInterval,
      usesTrialDefault: own == null,
      lastWeighed,
      nextDue,
      isBaseline,
      dueToday: nextDue === today,
      overdueDays,
    };
  });
}


export function overdueSummary(rows: PenSchedule[]) {
  const overdue = rows.filter((r) => r.overdueDays > 0);
  const oldest = overdue.reduce((m, r) => Math.max(m, r.overdueDays), 0);
  return { count: overdue.length, oldest };
}

export function overdueAdvisory(rows: PenSchedule[]): string | null {
  const { count, oldest } = overdueSummary(rows);
  if (count === 0) return null;
  return `${count} pen${count === 1 ? " is" : "s are"} overdue for weighing, the oldest by ${oldest} day${oldest === 1 ? "" : "s"}.`;
}
