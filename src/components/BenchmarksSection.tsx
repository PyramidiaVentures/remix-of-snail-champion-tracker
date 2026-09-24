import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type Form = {
  id?: string; site_id: string; metric: "sgr" | "bfcr_dm"; low: string; high: string;
  species: string; diet: string; snail_weight_range: string; citation: string; url: string; notes: string;
};
const empty: Form = { site_id: "", metric: "sgr", low: "", high: "", species: "", diet: "", snail_weight_range: "", citation: "", url: "", notes: "" };
const METRIC_NAME = { sgr: "SGR (% per day)", bfcr_dm: "Biological FCR (dry matter)" } as const;

export function BenchmarksSection() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = useQuery({ queryKey: ["benchmarks"], queryFn: async () => (await supabase.from("benchmarks").select("*").order("metric")).data ?? [] });
  const sites = useQuery({ queryKey: ["sites-list"], queryFn: async () => (await supabase.from("sites").select("id,name")).data ?? [] });
  const siteName = (id: string | null) => (id ? sites.data?.find((s) => s.id === id)?.name ?? "one site" : "All sites");

  const save = useMutation({
    mutationFn: async (f: Form) => {
      const low = Number(f.low), high = Number(f.high);
      if (!Number.isFinite(low) || !Number.isFinite(high) || f.low === "" || f.high === "") throw new Error("Enter a low and high value.");
      if (low > high) throw new Error("Low must not be above high.");
      if (!f.citation.trim()) throw new Error("Enter the citation.");
      const row = {
        site_id: f.site_id || null, metric: f.metric, low, high, species: f.species.trim(), diet: f.diet.trim(),
        snail_weight_range: f.snail_weight_range.trim(), citation: f.citation.trim(), url: f.url.trim() || null, notes: f.notes.trim() || null,
      };
      const { error } = f.id ? await supabase.from("benchmarks").update(row).eq("id", f.id) : await supabase.from("benchmarks").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { setForm(null); setError(null); void qc.invalidateQueries({ queryKey: ["benchmarks"] }); },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("benchmarks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { setForm(null); void qc.invalidateQueries({ queryKey: ["benchmarks"] }); },
  });

  const input = "mt-1 block w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm";
  const field = (k: keyof Form, label: string, type = "text") => (
    <label className="text-xs text-muted-foreground">
      {label}
      <input type={type} step="any" value={form?.[k] ?? ""} onChange={(e) => setForm((f) => f && { ...f, [k]: e.target.value })} className={input} />
    </label>
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Literature benchmarks</h2>
        {!form && <Button size="sm" variant="outline" onClick={() => setForm(empty)}>Add</Button>}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Published ranges that Results compares your figures with. A site's own benchmark is used before an all-sites one.</p>
      <ul className="space-y-2">
        {(rows.data ?? []).map((b) => (
          <li key={b.id} className="rounded-lg border border-border p-2 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{METRIC_NAME[b.metric as keyof typeof METRIC_NAME] ?? b.metric}: {Number(b.low)}–{Number(b.high)} <span className="text-xs font-normal text-muted-foreground">· {siteName(b.site_id)}</span></div>
                <div className="text-xs text-muted-foreground">{b.species}{b.diet ? ` · ${b.diet}` : ""}{b.snail_weight_range ? ` · ${b.snail_weight_range}` : ""}</div>
                <div className="text-xs text-muted-foreground">{b.citation}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setForm({
                id: b.id, site_id: b.site_id ?? "", metric: b.metric as Form["metric"], low: String(b.low), high: String(b.high),
                species: b.species, diet: b.diet, snail_weight_range: b.snail_weight_range, citation: b.citation, url: b.url ?? "", notes: b.notes ?? "",
              })}>Edit</Button>
            </div>
          </li>
        ))}
      </ul>
      {form && (
        <div className="mt-3 space-y-2 rounded-lg border border-primary/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Measure
              <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as Form["metric"] })} className={input}>
                <option value="sgr">{METRIC_NAME.sgr}</option>
                <option value="bfcr_dm">{METRIC_NAME.bfcr_dm}</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Site
              <select value={form.site_id} onChange={(e) => setForm({ ...form, site_id: e.target.value })} className={input}>
                <option value="">All sites</option>
                {(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            {field("low", "Low", "number")}
            {field("high", "High", "number")}
          </div>
          {field("species", "Species")}
          {field("diet", "Diet")}
          {field("snail_weight_range", "Snail weight range")}
          {field("citation", "Citation")}
          {field("url", "Link")}
          {field("notes", "Notes")}
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate(form)} disabled={save.isPending}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { setForm(null); setError(null); }}>Cancel</Button>
            {form.id && <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => confirm("Delete this benchmark?") && remove.mutate(form.id!)}>Delete</Button>}
          </div>
        </div>
      )}
    </section>
  );
}
