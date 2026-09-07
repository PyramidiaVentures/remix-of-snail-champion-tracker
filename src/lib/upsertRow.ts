import { supabase } from "@/integrations/supabase/client";

/**
 * Single-statement upsert on a table's natural key, with one automatic retry.
 *
 * Every caller must pass ONLY the key columns plus the column(s) that field owns,
 * so two fields saving close together can never overwrite each other.
 */
export async function upsertRow(
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
): Promise<void> {
  const attempt = async () => {
    const { error } = await (supabase.from(table as never) as never as {
      upsert: (r: unknown, o: { onConflict: string }) => Promise<{ error: unknown }>;
    }).upsert(row, { onConflict });
    if (error) throw error;
  };

  try {
    await attempt();
  } catch (first) {
    await new Promise((r) => setTimeout(r, 400));
    try {
      await attempt();
    } catch (second) {
      const err = second ?? first;
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      console.error(`[save failed] ${table} (${onConflict})`, message, { row, error: err });
      throw new Error(message);
    }
  }
}

export const OBSERVATIONS_TRIAL_KEY = "trial_id,pen_id,feed_id,obs_date";
export const OBSERVATIONS_ROUND_KEY = "round_id,pen_id,feed_id,obs_date";
export const EVAP_CONTROLS_KEY = "round_id,feed_id,obs_date";
export const WELFARE_CHECKS_KEY = "trial_id,pen_id,obs_date";
export const BIOMASS_EVENTS_KEY = "trial_id,pen_id,event_date";
export const SESSION_PHOTOS_TRIAL_KEY = "trial_id,pen_id,obs_date";
