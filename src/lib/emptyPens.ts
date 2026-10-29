import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type PopEvent = { pen_id: string; event_date: string; event_type: string; count: number };

/** Live snails in a pen on a date: initial count + additions − deaths/escapes/removals. */
export function liveCount(initial: number, events: PopEvent[], penId: string, date: string): number {
  let n = Number(initial) || 0;
  for (const e of events) {
    if (e.pen_id !== penId || e.event_date > date) continue;
    n += e.event_type === "addition" ? e.count : -e.count;
  }
  return n;
}

/**
 * Breeder pens with no snails left are emptied pens: they are not walked,
 * fed or photographed, so they leave AM Check, PM Feeding and the day review.
 */
export function emptyBreederIds(
  pens: { id: string; role: string | null; initial_snail_count: number }[],
  events: PopEvent[],
  date: string,
): Set<string> {
  return new Set(
    pens.filter((p) => p.role === "breeder" && liveCount(p.initial_snail_count, events, p.id, date) <= 0).map((p) => p.id),
  );
}

export function useEmptyBreederIds(siteId: string | null | undefined, date: string) {
  const q = useQuery({
    queryKey: ["empty-breeders", siteId, date],
    enabled: !!siteId,
    queryFn: async () => {
      const { data: pens } = await supabase.from("pens").select("id,role,initial_snail_count").eq("site_id", siteId!).eq("role", "breeder");
      const ids = (pens ?? []).map((p) => p.id);
      if (!ids.length) return [] as string[];
      const { data: ev } = await supabase.from("population_events").select("pen_id,event_date,event_type,count").in("pen_id", ids);
      return [...emptyBreederIds(pens ?? [], (ev ?? []) as PopEvent[], date)];
    },
  });
  return new Set(q.data ?? []);
}
