import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeRetention, feedEaten, protocolNights, computeMetrics } from "./metrics";

const ctx = { controlFeedId: "leaf", readings: [], nightsFor: () => 3, nextFeedingDay: (d: string) => d };
const tray = (date: string, remaining: number, feed = "leaf", portion = 90) => ({ obs_date: date, feed_id: feed, offered_g: portion, portion_g: portion, remaining_g: remaining });
describe("prospective retention protocol", () => {
  it("Saturday is two nights and every other weekday is one", () => {
    assert.equal(protocolNights("2026-10-24"), 2);
    for (const d of ["22", "23", "25", "26", "27", "28"]) assert.equal(protocolNights(`2026-10-${d}`), 1);
  });
  it("does not change historic 76% correction or clipping", () => {
    assert.equal(makeRetention({ ...ctx, trays: [tray("2026-10-15", 60)] })("leaf", "2026-10-15", 90).retention, .76 ** 3);
    assert.equal(feedEaten(50, 46, .76, "2026-09-24")?.totalEaten_g, 0);
  });
  it("keeps negatives in totals but displays zero", () => {
    const e = feedEaten(50, 46, .76, "2026-10-22");
    assert.equal(e?.eaten_g, 0);
    assert.ok(Math.abs(Number(e?.totalEaten_g) - (50 - 46 / .76)) < 1e-10);
  });
  it("caps both row and total eaten at offered", () => {
    const e = feedEaten(50, -10, 1, "2026-10-22");
    assert.equal(e?.eaten_g, 50);
    assert.equal(e?.totalEaten_g, 50);
  });
  it("means same-day matching portion controls, including pellets", () => {
    const lookup = makeRetention({ ...ctx, trays: [tray("2026-10-22", 70), tray("2026-10-22", 74), tray("2026-10-22", 10, "leaf", 50), tray("2026-10-22", 85, "pellet")] });
    const r = lookup("leaf", "2026-10-22", 90);
    assert.equal(r.retention, .8);
    assert.equal(r.controls, 2);
    assert.equal(r.status, "measured");
    assert.equal(lookup("pellet", "2026-10-22", 90).retention, 85 / 90);
  });
  it("uses matching prior portion average, flags estimated, ignores later dates", () => {
    const lookup = makeRetention({ ...ctx, trays: [tray("2026-10-22", 70), tray("2026-10-22", 74), tray("2026-10-25", 90)] });
    assert.equal(lookup("leaf", "2026-10-23", 90).retention, .8);
    assert.equal(lookup("leaf", "2026-10-23", 90).status, "from test");
    assert.equal(lookup("leaf", "2026-10-23", 50).status, "not tested");
  });
  it("aggregates signed intake, not displayed zeros", () => {
    const result = computeMetrics({ trial: { id: "t", start_date: "2026-10-22", acclimation_days: 0 }, pens: [{ id: "p", label: "P" }], feeds: [{ id: "leaf", name: "Leaves", dm_percent: 20 }], treatments: [{ id: "tr", feed_id: "leaf", label: "Leaves" }], assignments: [{ pen_id: "p", treatment_id: "tr" }], observations: [{ pen_id: "p", feed_id: "leaf", obs_date: "2026-10-22", offered_g: 50, leftover_g: 46, dish_action: null }], biomass: [{ pen_id: "p", event_date: "2026-10-22", net_biomass_g: 100, live_count: 1 }, { pen_id: "p", event_date: "2026-10-23", net_biomass_g: 110, live_count: 1 }], includeAcclimation: true, dryMatter: false, retention: { ...ctx, trays: [tray("2026-10-22", 38, "leaf", 50), tray("2026-10-22", 38, "leaf", 50)] } });
    assert.ok(Math.abs(result.pens[0].cumEaten_g - (50 - 46 / .76)) < 1e-10);
  });
});