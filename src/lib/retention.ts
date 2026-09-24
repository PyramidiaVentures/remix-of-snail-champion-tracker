import type { OperatingCalendar } from "@/lib/operatingDays";
import { daysBetween, type ControlReading, type RetentionContext } from "@/lib/metrics";

/** Water-loss context for a trial: its control feed, readings and site calendar. */
export function retentionContext(
  controlFeedId: string | null | undefined,
  readings: ControlReading[],
  calendar: Pick<OperatingCalendar, "checkDayFor" | "nextOperatingDay">,
): RetentionContext {
  const addOne = (d: string) => new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10);
  return {
    controlFeedId: controlFeedId ?? null,
    readings,
    nightsFor: (d) => Math.max(1, daysBetween(d, calendar.checkDayFor(d))),
    nextFeedingDay: (d) => calendar.nextOperatingDay(addOne(d)),
  };
}
