import { CalendarOff } from "lucide-react";

import type { OperatingCalendar } from "@/lib/operatingDays";

/**
 * Shown on a day the site is closed. Nothing is blocked — anything recorded on
 * a closed day still saves and still shows. It only says the day is not
 * expected to carry a session.
 */
export function ClosedDayNotice({
  calendar,
  date,
  siteName,
  session,
}: {
  calendar: OperatingCalendar;
  date: string;
  siteName: string;
  session?: "PM" | "AM";
}) {
  const reason = calendar.closedBecause(date);
  if (!reason) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm">
      <CalendarOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span>
        <span className="font-medium">
          {reason} — no operations at {siteName || "this site"}.
        </span>{" "}
        {session === "AM"
          ? "No morning check is expected for this date."
          : "No feeding is expected today."}{" "}
        Anything you do record still saves.
      </span>
    </div>
  );
}
