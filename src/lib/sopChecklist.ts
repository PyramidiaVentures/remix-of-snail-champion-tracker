import { supabase } from "@/integrations/supabase/client";
import { legacyStepKeys, type SopSession, type SopStep } from "@/lib/sopSteps";

export type { SopSession, SopStep } from "@/lib/sopSteps";

/** Current visible ticks from stored keys. Unknown retired keys are ignored here. */
export function visibleTicks(keys: string[] | null | undefined, items: SopStep[]): boolean[] {
  const checked = new Set(keys ?? []);
  return items.map((item) => checked.has(item.key));
}

/** Ticks saved for one trial, date and session — shared by everyone on the team. */
export async function fetchChecklist(
  trialId: string,
  date: string,
  session: SopSession,
): Promise<string[] | null> {
  const { data } = await supabase
    .from("sop_checklists")
    .select("checked_step_keys")
    .eq("trial_id", trialId)
    .eq("obs_date", date)
    .eq("session", session)
    .maybeSingle();
  return data?.checked_step_keys ?? null;
}

export async function saveChecklist(
  trialId: string,
  date: string,
  session: SopSession,
  checkedStepKeys: string[],
  recordedBy?: string | null,
) {
  const { error } = await supabase
    .from("sop_checklists")
    .upsert(
      {
        trial_id: trialId,
        obs_date: date,
        session,
        checked_step_keys: checkedStepKeys,
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

export function readLocal(trialId: string, date: string, session: SopSession): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(localKey(trialId, date, session));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    if (parsed.every((value) => typeof value === "string")) return parsed as string[];
    if (parsed.every((value) => typeof value === "boolean")) {
      const keys = legacyStepKeys(session, date);
      return keys.filter((_, index) => Boolean(parsed[index]));
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLocal(trialId: string, date: string, session: SopSession, checkedStepKeys: string[]) {
  try {
    localStorage.setItem(localKey(trialId, date, session), JSON.stringify(checkedStepKeys));
  } catch {}
}
