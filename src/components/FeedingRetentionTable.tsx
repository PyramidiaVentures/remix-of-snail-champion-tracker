import { useState } from "react";
import { feedEaten, retentionFlag, type makeRetention } from "@/lib/metrics";

export function FeedingRetentionTable({ observations, pens, retentionFor }: {
  observations: { pen_id: string; feed_id: string | null; obs_date: string; offered_g: number | null; leftover_g?: number | null }[];
  pens: { id: string; label: string }[];
  retentionFor: ReturnType<typeof makeRetention>;
}) {
  const dates = [...new Set(observations.map((o) => o.obs_date))].sort().reverse();
  const [selected, setSelected] = useState("");
  const date = selected || dates[0] || "";
  return <section className="border-t border-border pt-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Feeding records · retention</h2>
      <select aria-label="Retention feeding date" value={date} onChange={(e) => setSelected(e.target.value)} className="rounded-md border border-input bg-card p-2 text-sm">{dates.map((d) => <option key={d}>{d}</option>)}</select>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-3">Pen</th><th className="py-2 pr-3">Offered (g)</th><th className="py-2 pr-3">Leftover (g)</th><th className="py-2 pr-3">Eaten (g)</th><th className="py-2 pr-3">Retention</th><th className="py-2">Flag</th></tr></thead>
      <tbody>{observations.filter((o) => o.obs_date === date).map((o) => {
        const r = retentionFor(o.feed_id, o.obs_date, o.offered_g);
        const e = feedEaten(o.offered_g, o.leftover_g, r.retention, o.obs_date);
        return <tr key={`${o.pen_id}-${o.feed_id}`} className="border-t border-border"><td className="py-2 pr-3">{pens.find((p) => p.id === o.pen_id)?.label ?? "Pen"}</td><td className="py-2 pr-3">{o.offered_g ?? "—"}</td><td className="py-2 pr-3">{o.leftover_g ?? "—"}</td><td className="py-2 pr-3">{e?.eaten_g.toFixed(1) ?? "unknown"}</td><td className="py-2 pr-3">{r.retention > 0 ? `${(r.retention * 100).toFixed(1)}%` : "—"}</td><td className="py-2">{retentionFlag(r)}{r.status === "measured" && r.controls === 1 ? " · only one tray" : ""}</td></tr>;
      })}</tbody>
    </table></div>
  </section>;
}