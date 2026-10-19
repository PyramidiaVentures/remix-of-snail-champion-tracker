import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { NumberField } from "@/components/NumberField";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { upsertRow } from "@/lib/upsertRow";
import { controlOfferedPatch } from "@/lib/controlDish";

export function ControlDishEvening({ trialId, siteId, feedId, feedName, date, plannedGrams }: {
  trialId: string; siteId: string; feedId: string; feedName: string; date: string; plannedGrams: number;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reading = useQuery({
    queryKey: ["moisture-control", trialId, date],
    queryFn: async () => {
      const { data, error } = await supabase.from("moisture_controls").select("offered_g").eq("trial_id", trialId).eq("feed_id", feedId).eq("obs_date", date).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return (
    <section id="pm-control-dish" className="border-y border-border py-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Control dish</h2>
        {reading.data && <span className="flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" />{Number(reading.data.offered_g)} g recorded</span>}
      </div>
      <p className="text-sm text-muted-foreground">{feedName} · Planned portion: {plannedGrams} g</p>
      <p className="text-xs text-muted-foreground">Use an empty pen of the same build, same lid and substrate, no snails. Keep humidity and every other condition the same as in the snail pens.</p>
      <form className="space-y-3" onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const raw = String(new FormData(form).get("grams") ?? "");
        setError(null);
        setSaving(true);
        try {
          await upsertRow("moisture_controls", { site_id: siteId, trial_id: trialId, feed_id: feedId, obs_date: date, ...controlOfferedPatch(raw.trim() === "" ? NaN : Number(raw)) }, "trial_id,feed_id,obs_date");
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["moisture-control", trialId, date] }),
            qc.invalidateQueries({ queryKey: ["moisture-controls-all", trialId] }),
            qc.invalidateQueries({ queryKey: ["moisture-controls", trialId] }),
          ]);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save. Try again.");
        } finally {
          setSaving(false);
        }
      }}>
        <NumberField key={`${date}-${reading.data?.offered_g ?? "empty"}`} name="grams" label="Actually placed in control dish (g)" suffix="g" min="0.1" step="0.1" required defaultValue={reading.data?.offered_g ?? ""} disabled={reading.isPending || reading.isError || saving} />
        <Button type="submit" disabled={reading.isPending || reading.isError || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save control amount
        </Button>
      </form>
      {(error || reading.isError) && <p role="alert" className="text-sm text-destructive">{error ?? "Could not load the control amount. Reload and try again."}</p>}
    </section>
  );
}