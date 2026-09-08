import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * A pen is "locked" once dependent data exists for it in the trial:
 * observations, biomass events or population events.
 *
 * Locked pens keep their initial_snail_count and treatment assignment,
 * because editing either retroactively rewrites already-calculated figures.
 * Everything else about a pen (label, area) stays freely editable.
 */
export const INITIAL_COUNT_LOCK_MESSAGE =
  "This pen has recorded data. Log a population event instead of editing the initial count.";
export const TREATMENT_LOCK_MESSAGE =
  "A pen cannot change treatment mid-trial. Its feed history would no longer match its diet.";

async function penIdsWithRows(table: "observations" | "biomass_events" | "population_events", trialId?: string) {
  let q = supabase.from(table).select("pen_id");
  if (trialId) q = q.eq("trial_id", trialId);
  const { data } = await q;
  return (data ?? []).map((r) => (r as { pen_id: string }).pen_id);
}

/** Set of pen ids that have dependent data. Omit trialId to check across all trials. */
export function usePensWithData(trialId?: string) {
  return useQuery({
    queryKey: ["pens-with-data", trialId ?? "all"],
    queryFn: async () => {
      const lists = await Promise.all([
        penIdsWithRows("observations", trialId),
        penIdsWithRows("biomass_events", trialId),
        penIdsWithRows("population_events", trialId),
      ]);
      return new Set(lists.flat());
    },
  });
}
