import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/components/SiteProvider";
import { addDays } from "@/lib/metrics";

/**
 * Non-operating days.
 *
 * A site can be closed every week on given weekdays, and on one-off dates
 * (public holidays and the like). A closed day is never expected to carry a
 * feeding or a check — but anything actually recorded on it is kept and shown
 * exactly as on any other day.
 *
 * The two expectation rules:
 *   - a PM feeding is expected on D only when D is an operating day;
 *   - an AM check is expected for D only when D + 1 is an operating day,
 *     because the morning check happens the following morning.
 */

export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/** Postgres date-part dow: 0 = Sunday. */
/** Today's date in the browser's local timezone, as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekdayOf(date: string): number {

  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function weekdayName(date: string): string {
  return WEEKDAY_NAMES[weekdayOf(date)]!;
}

export interface Closure {
  id?: string;
  closure_date: string;
  reason?: string | null;
}

export interface OperatingCalendar {
  nonOperatingWeekdays: number[];
  closureReason: (date: string) => string | null;
  isOperating: (date: string) => boolean;
  isNonOperating: (date: string) => boolean;
  /** Why the day is closed, in words — or null when it is an operating day. */
  closedBecause: (date: string) => string | null;
  /** The given date when it is operating, otherwise the next day that is. */
  nextOperatingDay: (date: string) => string;
  /** A PM feeding is expected on this date. */
  pmExpected: (date: string) => boolean;
  /** The morning the dish from this feeding is actually checked. */
  checkDayFor: (date: string) => string;
  /** An AM check is expected for this feeding (once its check morning has come). */
  amExpected: (date: string) => boolean;

  /** The previous operating day before the given date. */
  previousOperatingDay: (date: string) => string;
}

export function makeCalendar(
  nonOperatingWeekdays: number[] | null | undefined,
  closures: Closure[] | null | undefined,
): OperatingCalendar {
  const weekdays = new Set((nonOperatingWeekdays ?? []).map(Number));
  const byDate = new Map((closures ?? []).map((c) => [c.closure_date, c.reason ?? null]));

  const isNonOperating = (date: string) => weekdays.has(weekdayOf(date)) || byDate.has(date);
  const isOperating = (date: string) => !isNonOperating(date);

  const closedBecause = (date: string) => {
    if (byDate.has(date)) {
      const reason = byDate.get(date);
      return reason && reason.trim() ? reason : "closure";
    }
    if (weekdays.has(weekdayOf(date))) return weekdayName(date);
    return null;
  };

  const nextOperatingDay = (date: string) => {
    let d = date;
    for (let i = 0; i < 366 && isNonOperating(d); i++) d = addDays(d, 1);
    return d;
  };

  const previousOperatingDay = (date: string) => {
    let d = addDays(date, -1);
    for (let i = 0; i < 366 && isNonOperating(d); i++) d = addDays(d, -1);
    return d;
  };

  const checkDayFor = (date: string) => nextOperatingDay(addDays(date, 1));

  return {

    nonOperatingWeekdays: Array.from(weekdays).sort(),
    closureReason: (date) => byDate.get(date) ?? null,
    isOperating,
    isNonOperating,
    closedBecause,
    nextOperatingDay,
    pmExpected: isOperating,
    checkDayFor,
    // The check belongs to the feeding of date D and happens on the next
    // operating morning — so it is only expected once that morning has arrived.
    amExpected: (date) => isOperating(date) && checkDayFor(date) <= localToday(),

    previousOperatingDay,

  };
}

/** Every day operates — the shape used where no calendar is available. */
export const ALWAYS_OPERATING = makeCalendar([], []);

/** The operating calendar of the site selected in the header. */
export function useSiteCalendar() {
  const { selectedSiteId, selectedSite } = useSite();

  const closures = useQuery({
    queryKey: ["site-closures", selectedSiteId],
    enabled: !!selectedSiteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_closures")
        .select("id,closure_date,reason")
        .eq("site_id", selectedSiteId!)
        .order("closure_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Closure[];
    },
  });

  const weekly = (selectedSite as { non_operating_weekdays?: number[] } | null | undefined)
    ?.non_operating_weekdays ?? [];

  const calendar = useMemo(
    () => makeCalendar(weekly, closures.data ?? []),
    [JSON.stringify(weekly), closures.data],
  );

  return { calendar, closures: closures.data ?? [], closuresQuery: closures, weekly };
}

/**
 * Calendars for every site, keyed by site id — used by Results and Export,
 * which are not scoped to the header's site.
 */
export function useAllSiteCalendars() {
  const sites = useQuery({
    queryKey: ["all-site-calendars"],
    queryFn: async () => {
      const [s, c] = await Promise.all([
        supabase.from("sites").select("id,non_operating_weekdays"),
        supabase.from("site_closures").select("site_id,closure_date,reason"),
      ]);
      if (s.error) throw s.error;
      if (c.error) throw c.error;
      return { sites: s.data ?? [], closures: c.data ?? [] };
    },
  });

  const bySite = useMemo(() => {
    const map = new Map<string, OperatingCalendar>();
    for (const site of sites.data?.sites ?? []) {
      const closures = (sites.data?.closures ?? []).filter(
        (c) => (c as { site_id: string }).site_id === site.id,
      ) as Closure[];
      map.set(
        site.id,
        makeCalendar((site as { non_operating_weekdays?: number[] }).non_operating_weekdays ?? [], closures),
      );
    }
    return map;
  }, [sites.data]);

  const calendarFor = (siteId: string | null | undefined) =>
    (siteId && bySite.get(siteId)) || ALWAYS_OPERATING;

  return { calendarFor, bySite };
}


/** "Closed on Sundays" — the sentence used on the Field Guide and Trial screen. */
export function operatingDaysSentence(cal: OperatingCalendar): string {
  const closed = cal.nonOperatingWeekdays;
  if (!closed.length) return "Operating every day of the week.";
  const names = closed.map((n) => `${WEEKDAY_NAMES[n]}s`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `Closed on ${list}.`;
}
