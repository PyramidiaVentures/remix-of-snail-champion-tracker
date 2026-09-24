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

const OLD_PM_KEYS = [
  "pm.collect_fresh",
  "pm.check_discard",
  "pm.weigh_portion",
  "pm.record_dish_action",
  "pm.place_feed",
  "pm.calcium_water",
  "pm.photo",
];
const OLD_AM_KEYS = [
  "am.photo",
  "am.visual_refusal",
  "am.activity_health",
  "am.environment",
  "am.population",
  "am.discard_spoiled",
];
const CURRENT_FROM = "2026-09-24";

/** Exact key order used to convert a legacy positional array for its date. */
export function legacyStepKeys(session: SopSession, date: string): string[] {
  if (session === "weigh") return WEIGH_STEPS.map((step) => step.key);
  if (date < CURRENT_FROM) return session === "pm" ? OLD_PM_KEYS : OLD_AM_KEYS;
  return (session === "pm" ? PM_STEPS : AM_STEPS).map((step) => step.key);
}
