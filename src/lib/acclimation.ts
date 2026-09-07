/** Shared "include acclimation days in metrics" preference, set on /trial. */
const KEY = "snova-include-acclimation";

export function readIncludeAcclimation(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export function writeIncludeAcclimation(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, value ? "1" : "0");
}
