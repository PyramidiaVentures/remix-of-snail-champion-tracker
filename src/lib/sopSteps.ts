export type SopSession = "pm" | "am" | "weigh";

export interface SopStep {
  /** Permanent identity. Never reuse this key for a different instruction. */
  key: string;
  label: string;
}

export const PM_STEPS: SopStep[] = [
  { key: "pm.collect_fresh", label: "Cut/collect fresh feed." },
  { key: "pm.weigh_portion", label: "Weigh each pen's portion and enter grams." },
  { key: "pm.place_feed", label: "Put the feed in the clean dish, rotating the dish position." },
  { key: "pm.control_portion", label: "Only during a water-loss test: put the standard amount of leaves in the control dish (nothing to enter)." },
  { key: "pm.calcium_water", label: "Calcium and water." },
  { key: "pm.photo", label: "PM photo." },
];

export const AM_STEPS: SopStep[] = [
  { key: "am.photo", label: "Photo each dish untouched, tag in frame." },
  { key: "am.weigh_leftover", label: "Take out all leftover feed, weigh it on the zeroed scale, enter grams, throw it away, clean the dish." },
  { key: "am.control_leftover", label: "Only during a water-loss test: weigh what is left in the control dish, enter grams, throw it away." },
  { key: "am.activity_health_environment", label: "Activity, health flags, minimum and maximum temperature and humidity." },
  { key: "am.population", label: "Log any deaths, escapes or removals." },
];

export const WEIGH_STEPS: SopStep[] = [
  { key: "weigh.zero_container", label: "Place the empty container on the scale and zero it, so the scale reads only the snails." },
  { key: "weigh.count_live", label: "Count every live snail in the pen and enter the count." },
  { key: "weigh.weigh_biomass", label: "Weigh all the snails together and enter the weight the scale shows." },
  { key: "weigh.photo_scale", label: "Photograph the scale display with the pen tag in frame." },
  { key: "weigh.return_and_confirm", label: "Return the snails to the pen and confirm the count matches." },
  { key: "weigh.log_mortality", label: "Log any snail found dead during handling as a mortality event." },
];

export const PM_PHOTO_STEP_KEY = "pm.photo";
export const PM_CONTROL_STEP_KEY = "pm.control_portion";
export const AM_PHOTO_STEP_KEY = "am.photo";
export const AM_CONTROL_STEP_KEY = "am.control_leftover";
export const WEIGH_PHOTO_STEP_KEY = "weigh.photo_scale";

const OLD_PM_STEPS: SopStep[] = [
  { key: "pm.collect_fresh", label: "Cut/collect every feed fresh today — no overnight leaves (bran/dry goods exempt)." },
  { key: "pm.check_discard", label: "Check each dish against the discard criteria. If the remaining feed is sound, top up. If it fails any criterion, empty and clean the dish first." },
  { key: "pm.weigh_portion", label: "Weigh the portion for each pen and enter grams offered." },
  { key: "pm.record_dish_action", label: "Record the dish action: topped up, emptied and refilled, or emptied because spoiled." },
  { key: "pm.place_feed", label: "Place feed in each pen, rotating the dish position from yesterday." },
  { key: "pm.calcium_water", label: "Top up calcium and water dishes (never weighed, always present)." },
  { key: "pm.photo", label: "Upload one PM photo per pen, dish and paper tag in frame." },
];
const OLD_AM_STEPS: SopStep[] = [
  { key: "am.photo", label: "Upload the AM photos (one per pen) — dish untouched, tag in frame." },
  { key: "am.visual_refusal", label: "Record the refusal score for each pen by eye. Do not weigh." },
  { key: "am.activity_health", label: "Record snail activity and any signs of sickness." },
  { key: "am.environment", label: "Record temperature and humidity." },
  { key: "am.population", label: "Log any deaths, escapes or removals." },
  { key: "am.discard_spoiled", label: "Empty and clean any dish whose remaining feed fails the discard criteria." },
];
const CURRENT_FROM = "2026-09-24";

/** Checklist version that was live on the selected operating date. */
export function checklistSteps(session: SopSession, date: string): SopStep[] {
  if (session === "weigh") return WEIGH_STEPS;
  if (date < CURRENT_FROM) return session === "pm" ? OLD_PM_STEPS : OLD_AM_STEPS;
  return session === "pm" ? PM_STEPS : AM_STEPS;
}

/** Exact key order used to convert a legacy positional array for its date. */
export function legacyStepKeys(session: SopSession, date: string): string[] {
  return checklistSteps(session, date).map((step) => step.key);
}
