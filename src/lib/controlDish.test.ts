import { describe, expect, test } from "bun:test";
import { controlOfferedPatch, controlLeftoverPatch } from "./controlDish";

describe("actual control-dish measurements", () => {
  test("records the 90 g actually placed, not the planned 50 g", () => {
    expect(controlOfferedPatch(90)).toEqual({ offered_g: 90 });
  });
  test("morning recording never changes the evening grams", () => {
    expect({ ...controlOfferedPatch(90), ...controlLeftoverPatch(74) }).toEqual({ offered_g: 90, remaining_g: 74 });
    expect(controlLeftoverPatch(74)).not.toHaveProperty("offered_g");
  });
  test("an unentered amount cannot be recorded as zero", () => {
    expect(() => controlOfferedPatch(0)).toThrow();
    expect(() => controlOfferedPatch(NaN)).toThrow();
  });
});