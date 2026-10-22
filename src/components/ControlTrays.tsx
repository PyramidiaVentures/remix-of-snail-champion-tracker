import { useState } from "react";
import { Plus, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/NumberField";
import { supabase } from "@/integrations/supabase/client";
import { controlOfferedPatch, controlLeftoverPatch } from "@/lib/controlDish";
import { requiredControlPortions, useControlTrays, useRefreshControls, type ControlTray, type ControlPortion } from "@/lib/controlTrays";

export function ControlTrays({ trialId, siteId, date, feeds, portions, morning = false, checkDate }: {
  trialId: string; siteId: string; date: string; feeds: { id: string; name: string }[]; portions: ControlPortion[]; morning?: boolean; checkDate?: string;
}) {
  const query = useControlTrays(trialId);
  const refresh = useRefreshControls();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feed, setFeed] = useState("");
  const selectedFeed = feed || feeds[0]?.id || "";
  const dated = (query.data ?? []).filter((t) => t.obs_date === date);
  // No evening entry for this date (holiday, missed day): trays not yet weighed
  // out are assumed unchanged since their last evening, like a weekend gap.
  const open = morning && dated.length === 0
    ? (query.data ?? []).filter((t) => t.obs_date < date && (t.remaining_g == null || t.checked_on === checkDate))
    : [];
  const carriedFrom = open.length ? open.map((t) => t.obs_date).sort().at(-1)! : null;
  const rows = carriedFrom ? open.filter((t) => t.obs_date === carriedFrom) : dated;
  const required = requiredControlPortions(portions);
  const groups = [...new Map([...required, ...rows.map((t) => ({ feedId: t.feed_id, portion: Number(t.portion_g) }))]
    .map((p) => [`${p.feedId}|${p.portion}`, p])).values()];
  return <section id="pm-control-dish" className="border-y border-border py-4 space-y-3">
    <h2 className="font-semibold">Control trays · {date}</h2>
    <p className="text-xs text-muted-foreground">At least two trays per feed and portion size. Use empty matching pens, with the same lid, substrate, humidity and exposure as the trial pens; no snails.</p>
    {groups.map((p) => {
      const matching = rows.filter((t) => t.feed_id === p.feedId && Number(t.portion_g) === p.portion);
      return <div key={`${p.feedId}-${p.portion}`} className="border-b border-border pb-3 space-y-2">
        <h3 className="text-sm font-medium">{feeds.find((f) => f.id === p.feedId)?.name ?? "Feed"} · {p.portion} g <span className="text-muted-foreground">({matching.length} trays{matching.length < 2 ? " — needs at least 2" : ""})</span></h3>
        {matching.map((t) => <TrayReading key={`${t.id}-${t.updated_at}`} tray={t} morning={morning} checkDate={checkDate} onSaved={refresh} />)}
      </div>;
    })}
    {carriedFrom && <p className="text-sm text-amber-700">No evening entry on {date}. These trays are assumed unchanged since {carriedFrom}; their leftovers count over all nights since then. This is flagged as an exception.</p>}
    {morning && rows.length === 0 && <p className="text-sm text-amber-700">No evening control trays were recorded for {date}. Enter what was actually placed last evening below, then each tray's leftover.</p>}
    {(!morning || rows.length === 0) && <form className="space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      setError(null); setSaving(true);
      try {
        const portion = Number(data.get("portion"));
        if (!(portion > 0) || !selectedFeed) throw new Error("Choose a feed and positive portion size.");
        const exposure = String(data.get("exposure") ?? "").trim();
        if (!exposure) throw new Error("Record the tray's matching pen exposure.");
        const count = Number(data.get("count"));
        if (!Number.isInteger(count) || count < 2) throw new Error("Record at least two trays.");
        const max = Math.max(0, ...rows.filter((t) => t.feed_id === selectedFeed && Number(t.portion_g) === portion).map((t) => t.tray_no));
        // Read every actual measurement explicitly; a planned portion is never copied into offered_g.
        const records = Array.from({ length: count }, (_, i) => ({ ...(morning && checkDate ? { checked_on: checkDate } : {}), site_id: siteId, trial_id: trialId, feed_id: selectedFeed, obs_date: date, portion_g: portion, tray_no: max + i + 1, exposure, ...controlOfferedPatch(Number(data.get(`grams-${i}`))) }));
        const { error: saveError } = await supabase.from("control_trays").insert(records);
        if (saveError) throw saveError;
        await refresh();
        form.reset();
      } catch (err) { setError(err instanceof Error ? err.message : "Could not save control trays."); }
      finally { setSaving(false); }
    }}>
      <label className="block text-sm font-medium">Feed<select aria-label="Control feed" value={selectedFeed} onChange={(e) => setFeed(e.target.value)} className="mt-1 w-full border border-input rounded-md bg-card p-2">{feeds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <NumberField label="Trial portion size (g)" name="portion" min="0.1" required />
      <ExtraTrays />
      <label className="block text-sm font-medium">Matching pen exposure<input name="exposure" required placeholder="e.g. same shaded position as Pens 1–5" className="mt-1 w-full rounded-md border border-input bg-card p-2" /></label>
      <Button type="submit" disabled={saving || query.isPending || query.isError}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save control trays"}</Button>
    </form>}
    {(error || query.isError) && <p role="alert" className="text-sm text-destructive">{error ?? "Could not load control trays."}</p>}
  </section>;
}
function ExtraTrays() {
  const [count, setCount] = useState(2);
  return <div className="space-y-2"><input type="hidden" name="count" value={count} />
    {Array.from({ length: count }, (_, i) => <NumberField key={i} label={`Tray ${i + 1} actually placed (g)`} name={`grams-${i}`} min="0.1" required />)}
    <Button type="button" variant="outline" onClick={() => setCount((n) => n + 1)}><Plus className="h-4 w-4" />Add another tray</Button>
  </div>;
}
function TrayReading({ tray, morning, checkDate, onSaved }: { tray: ControlTray; morning: boolean; checkDate?: string; onSaved: () => Promise<unknown> }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  return <form className="space-y-2" onSubmit={async (event) => {
    event.preventDefault();
    const grams = Number(new FormData(event.currentTarget).get("grams"));
    setSaving(true); setError(null);
    try {
      const patch = morning ? { ...controlLeftoverPatch(grams), checked_on: checkDate ?? null } : controlOfferedPatch(grams);
      // Updates are field-owned and address one immutable tray id only.
      const { error: saveError } = await supabase.from("control_trays").update(patch).eq("id", tray.id).select("id").single();
      if (saveError) throw saveError;
      setSaved(true); await onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save tray."); }
    finally { setSaving(false); }
  }}>
    <p className="text-xs text-muted-foreground">Tray {tray.tray_no} · {tray.offered_g} g offered · {tray.exposure}</p>
    <NumberField label={`Tray ${tray.tray_no} ${morning ? "leftover" : "actually placed"} (g)`} name="grams" min={morning ? 0 : .1} required defaultValue={morning ? tray.remaining_g ?? "" : tray.offered_g} />
    {morning && tray.remaining_g != null && (tray.remaining_g <= 0 || tray.remaining_g > tray.offered_g) && <p className="text-xs text-destructive">Invalid retention reading — saved for review, not used in retention averages.</p>}
    <Button type="submit" variant="outline" disabled={saving}><CheckCircle2 className="h-4 w-4" />{saving ? "Saving…" : saved || (morning && tray.remaining_g != null) ? "Saved — update tray" : "Save tray"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>;
}