import { describe, it as test } from "node:test";
import assert from "node:assert/strict";
import { controlOfferedPatch, controlLeftoverPatch } from "./controlDish";

describe("actual control-dish measurements", () => {
  test("records the 90 g actually placed, not the planned 50 g", () => {
    assert.deepEqual(controlOfferedPatch(90), { offered_g: 90 });
  });
  test("morning recording never changes the evening grams", () => {
    assert.deepEqual({ ...controlOfferedPatch(90), ...controlLeftoverPatch(74) }, { offered_g: 90, remaining_g: 74 });
    assert.equal("offered_g" in controlLeftoverPatch(74), false);
  });
  test("an unentered amount cannot be recorded as zero", () => {
    assert.throws(() => controlOfferedPatch(0));
    assert.throws(() => controlOfferedPatch(NaN));
  });
});