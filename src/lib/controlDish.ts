/** Daily portions are explicit measurements, never copied from trial settings. */
export function controlOfferedPatch(grams: number) {
  if (!Number.isFinite(grams) || grams <= 0) throw new Error("Enter the grams actually placed in the control dish.");
  return { offered_g: grams };
}

/** AM owns only the leftover field; it cannot overwrite the evening portion. */
export function controlLeftoverPatch(grams: number | null) {
  if (grams != null && (!Number.isFinite(grams) || grams < 0)) throw new Error("Enter a valid leftover weight.");
  return { remaining_g: grams };
}