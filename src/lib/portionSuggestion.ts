import { feedEaten, type Retention } from "@/lib/metrics";

export interface PortionFeeding {
  obs_date: string;
  feed_id: string | null;
  offered_g: number | null;
  leftover_g: number | null;
}

export interface PortionHistory {
  /** Last portion offered, per night. */
  lastOffered: number;
  /** Mean eaten per night over the last 3 feedings. */
  meanEaten: number;
  /** Mean share left (0..1). */
  meanShareLeft: number;
  /** True when any of the 3 feedings covered more than one night. */
  perNight: boolean;
  /** Any of the last 3 feedings had share left under 2%. */
  hungry: boolean;
}

export interface PortionSuggestion {
  grams: number;
  nights: number;
  reason: string;
}

/**
 * Last 3 feedings (before `date`) with a weighed leftover, using the same
 * feedEaten() the results use. Multi-night feedings are divided per night.
 */
export function portionHistory(
  rows: PortionFeeding[],
  date: string,
  retentionFor: (feedId: string | null | undefined, date: string) => Retention,
): PortionHistory | null {
  const picked: { offered: number; eaten: number; share: number; nights: number }[] = [];
  const sorted = rows
    .filter((r) => r.obs_date < date && r.leftover_g != null && r.offered_g != null && Number(r.offered_g) > 0)
    .sort((a, b) => (a.obs_date < b.obs_date ? 1 : -1));
  for (const r of sorted) {
    const ret = retentionFor(r.feed_id, r.obs_date);
    const e = feedEaten(Number(r.offered_g), Number(r.leftover_g), ret.retention);
    if (!e) continue;
    picked.push({ offered: Number(r.offered_g), eaten: e.eaten_g, share: e.shareLeft, nights: ret.nights });
    if (picked.length === 3) break;
  }
  if (picked.length < 3) return null;
  const last = picked[0]!;
  return {
    lastOffered: last.offered / last.nights,
    meanEaten: picked.reduce((s, p) => s + p.eaten / p.nights, 0) / 3,
    meanShareLeft: picked.reduce((s, p) => s + p.share, 0) / 3,
    perNight: picked.some((p) => p.nights > 1),
    hungry: picked.some((p) => p.share < 0.02),
  };
}

const round5 = (v: number) => Math.round(v / 5) * 5;

export function suggestPortion(
  h: PortionHistory,
  targetMinPct: number,
  targetMaxPct: number,
  nights: number,
): PortionSuggestion {
  const targetLeft = (targetMinPct + targetMaxPct) / 2 / 100;
  const lo = h.lastOffered * 0.8;
  const hi = h.lastOffered * 1.2;
  let s = round5(h.meanEaten / (1 - targetLeft));
  if (h.hungry) s = Math.max(s, h.lastOffered * 1.1);
  // Keep a multiple of 5 inside the ±20% band when one exists.
  if (s > hi) s = Math.floor(hi / 5) * 5 >= lo ? Math.floor(hi / 5) * 5 : Math.round(hi);
  if (s < lo) s = Math.ceil(lo / 5) * 5 <= hi ? Math.ceil(lo / 5) * 5 : Math.round(lo);
  if (h.hungry && s < h.lastOffered * 1.1) s = Math.ceil((h.lastOffered * 1.1) / 5) * 5;
  const pctLeft = Math.round(h.meanShareLeft * 100);
  const band = `target ${targetMinPct}–${targetMaxPct}%`;
  const reason = h.hungry
    ? `Under 2% left on a recent feeding, the snails may be going hungry (${band})`
    : `${pctLeft}% left on average, ${band}`;
  return { grams: s * Math.max(1, nights), nights: Math.max(1, nights), reason };
}
