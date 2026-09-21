import { supabase } from "@/integrations/supabase/client";

export type SopSession = "pm" | "am" | "weigh";

/** Pad or trim a stored tick array to the current number of steps. */
export function normalizeSteps(steps: boolean[] | null | undefined, length: number): boolean[] {
  return Array.from({ length }, (_, i) => Boolean(steps?.[i]));
}

/** Ticks saved for one trial, date and session — shared by everyone on the team. */
export async function fetchChecklist(
  trialId: string,
  date: string,
  session: SopSession,
): Promise<boolean[] | null> {
  const { data } = await supabase
    .from("sop_checklists")
    .select("steps")
    .eq("trial_id", trialId)
    .eq("obs_date", date)
    .eq("session", session)
    .maybeSingle();
  return (data?.steps as boolean[] | undefined) ?? null;
}

export async function saveChecklist(
  trialId: string,
  date: string,
  session: SopSession,
  steps: boolean[],
  recordedBy?: string | null,
) {
  const { error } = await supabase
    .from("sop_checklists")
    .upsert(
      {
        trial_id: trialId,
        obs_date: date,
        session,
        steps,
        recorded_by: recordedBy ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trial_id,obs_date,session" },
    );
  if (error) throw error;
}

/** Local mirror, so ticks survive a flaky connection until the save lands. */
export const localKey = (trialId: string, date: string, session: SopSession) =>
  `sop-${session}-${trialId}-${date}`;

export function readLocal(trialId: string, date: string, session: SopSession, length: number): boolean[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(localKey(trialId, date, session));
    if (!raw) return null;
    return normalizeSteps(JSON.parse(raw) as boolean[], length);
  } catch {
    return null;
  }
}

export function writeLocal(trialId: string, date: string, session: SopSession, steps: boolean[]) {
  try {
    localStorage.setItem(localKey(trialId, date, session), JSON.stringify(steps));
  } catch {}
}
