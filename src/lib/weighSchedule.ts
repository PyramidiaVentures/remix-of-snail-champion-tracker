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

type ScheduleArgs = Omit<Parameters<typeof buildSchedule>[0], "today">;

/**
 * Which pens are DUE on a date: the schedule built from weighings BEFORE that
 * date puts their next weighing on or before it. Overdue pens count as due; a
 * weighing saved on the date itself does not move the pen out of "due" — it
 * makes it "weighed". Breeder pens without an interval are never due.
 */
export function dueOnDate(args: ScheduleArgs, date: string) {
  const before = args.events.filter((e) => e.event_date < date);
  const rows = buildSchedule({ ...args, events: before, today: date });
  const weighedIds = new Set(args.events.filter((e) => e.event_date === date).map((e) => e.pen_id));
  const due = rows.filter((r) => !!r.nextDue && r.nextDue <= date);
  const weighed = due.filter((r) => weighedIds.has(r.penId));
  const unweighed = due.filter((r) => !weighedIds.has(r.penId));
  return { rows, due, weighed, unweighed, weighedIds };
}

/** The next weighing strictly after a date, counting weighings up to and including it. */
export function nextWeighing(args: ScheduleArgs, date: string): { date: string; labels: string[] } | null {
  const upTo = args.events.filter((e) => e.event_date <= date);
  const rows = buildSchedule({ ...args, events: upTo, today: date });
  const next = rows.map((r) => r.nextDue).filter((d): d is string => !!d && d > date).sort()[0];
  if (!next) return null;
  return { date: next, labels: rows.filter((r) => r.nextDue === next).map((r) => r.label) };
}

/** "Pens 1–5" / "Pens 1, 3, 7" / "Pen 4". */
export function penListLabel(labels: string[]): string {
  if (labels.length === 0) return "";
  const sorted = [...labels].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const nums = sorted.map((l) => l.match(/^Pen (\d+)$/)?.[1]);
  if (sorted.length === 1) return sorted[0]!;
  if (nums.every(Boolean)) {
    const n = nums.map(Number);
    const runs: string[] = [];
    let s = n[0]!, p = n[0]!;
    for (const x of [...n.slice(1), NaN]) {
      if (x === p + 1) { p = x; continue; }
      runs.push(s === p ? `${s}` : p === s + 1 ? `${s}, ${p}` : `${s}–${p}`);
      s = p = x;
    }
    return `Pens ${runs.join(", ")}`;
  }
  return sorted.join(", ");
}
