import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarOff, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/components/SiteProvider";
import { WEEKDAY_NAMES, operatingDaysSentence, useSiteCalendar } from "@/lib/operatingDays";

/**
 * Per-site non-operating days: the weekdays the site is closed every week, and
 * one-off closures such as public holidays. Editable at any time — this only
 * changes what is EXPECTED, never what has been recorded.
 */
export function OperatingDaysEditor() {
  const qc = useQueryClient();
  const { selectedSiteId, selectedSite } = useSite();
  const { calendar, closures } = useSiteCalendar();

  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["site-closures", selectedSiteId] });
    void qc.invalidateQueries({ queryKey: ["all-site-calendars"] });
    // The weekly days live on the site row, which the header caches.
    void qc.invalidateQueries({ queryKey: ["site-preference"] });
  };

  const saveWeekdays = useMutation({
    mutationFn: async (days: number[]) => {
      const { error } = await supabase
        .from("sites")
        .update({ non_operating_weekdays: days })
        .eq("id", selectedSiteId!);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const addClosure = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("site_closures").insert({
        site_id: selectedSiteId!,
        closure_date: newDate,
        reason: newReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewDate("");
      setNewReason("");
      refresh();
    },
  });

  const removeClosure = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("site_closures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (!selectedSiteId) return null;
  const closed = new Set(calendar.nonOperatingWeekdays);

  const toggle = (day: number) => {
    const next = new Set(closed);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    saveWeekdays.mutate(Array.from(next).sort());
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h3 className="flex items-center gap-2 font-semibold">
        <CalendarOff className="h-4 w-4" /> Operating days · {selectedSite?.name ?? "site"}
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        {operatingDaysSentence(calendar)} On a closed day no feeding or check is expected, so nothing is reported as
        missing. Anything recorded on a closed day is still kept and shown.
      </p>

      <div className="text-xs font-medium text-muted-foreground">Closed every week on</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {WEEKDAY_NAMES.map((name, day) => (
          <label
            key={name}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              closed.has(day) ? "border-primary bg-primary/10 text-primary" : "border-input"
            }`}
          >
            <input
              type="checkbox"
              checked={closed.has(day)}
              disabled={saveWeekdays.isPending}
              onChange={() => toggle(day)}
            />
            {name}
          </label>
        ))}
      </div>

      <div className="mt-4 text-xs font-medium text-muted-foreground">One-off closures</div>
      <ul className="mt-2 divide-y divide-border">
        {closures.length === 0 && <li className="py-2 text-sm text-muted-foreground">None recorded.</li>}
        {closures.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              <span className="font-medium">{c.closure_date}</span>
              {c.reason ? <span className="text-muted-foreground"> — {c.reason}</span> : null}
            </span>
            <button
              type="button"
              aria-label={`Remove closure on ${c.closure_date}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => c.id && removeClosure.mutate(c.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Date</span>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs flex-1">
          <span className="mb-1 block text-muted-foreground">Reason</span>
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="Public holiday"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={!newDate || addClosure.isPending}
          onClick={() => addClosure.mutate()}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add closure
        </button>
      </div>
    </section>
  );
}
