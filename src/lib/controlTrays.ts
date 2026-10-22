import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { RETENTION_PROTOCOL_START } from "@/lib/metrics";

export type ControlTray = Database["public"]["Tables"]["control_trays"]["Row"];
export function useControlTrays(trialId?: string) {
  return useQuery({
    queryKey: ["control-trays", trialId], enabled: !!trialId,
    queryFn: async () => {
      if (!trialId) return [];
      const { data, error } = await supabase.from("control_trays").select("*").eq("trial_id", trialId).order("obs_date").order("tray_no");
      if (error) throw error;
      return data ?? [];
    },
  });
}
export function useRefreshControls() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => {
    const key = String(q.queryKey[0]);
    return key.includes("control") || key === "dash-data" || key === "home-exceptions" || key === "other-site-status" || key === "trial-observations" || key === "dash-trends";
  } });
}
export type ControlPortion = { feed_id: string; offered_g: number | null };
export function requiredControlPortions(rows: ControlPortion[]) {
  return [...new Map(rows.filter((r) => r.offered_g != null && r.offered_g > 0)
    .map((r) => [`${r.feed_id}|${r.offered_g}`, { feedId: r.feed_id, portion: Number(r.offered_g) }])).values()];
}
export function traysComplete(trays: ControlTray[], date: string, portions: ControlPortion[], morning: boolean) {
  const required = requiredControlPortions(portions);
  return required.length > 0 && required.every((p) => {
    const matching = trays.filter((t) => t.obs_date === date && t.feed_id === p.feedId && Number(t.portion_g) === p.portion);
    return matching.length >= 2 && matching.every((t) => !morning || t.remaining_g != null);
  }) && trays.filter((t) => t.obs_date === date).every((t) => !morning || t.remaining_g != null);
}
export const usesPairedControls = (date: string) => date >= RETENTION_PROTOCOL_START;