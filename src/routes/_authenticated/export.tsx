import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useState } from "react";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
});

const TABLES = ["feeds", "pens", "rounds", "session_photos"] as const;

function ExportPage() {
  const [busy, setBusy] = useState<string | null>(null);

  const exportOne = async (t: (typeof TABLES)[number]) => {
    setBusy(t);
    try {
      const { data, error } = await supabase.from(t).select("*");
      if (error) throw error;
      downloadCsv(`snova_${t}_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(data ?? []));
    } finally { setBusy(null); }
  };

  const exportObservationsJoined = async () => {
    setBusy("observations");
    try {
      const [obsRes, photoRes] = await Promise.all([
        supabase.from("observations").select("*"),
        supabase.from("session_photos").select("*"),
      ]);
      if (obsRes.error) throw obsRes.error;
      if (photoRes.error) throw photoRes.error;
      const photoIdx = new Map<string, { am: string | null; pm: string | null }>();
      for (const p of photoRes.data ?? []) {
        if (p.pen_id === null) continue;
        photoIdx.set(`${p.round_id}|${p.pen_id}|${p.obs_date}`, {
          am: p.photo_am_url ?? null,
          pm: p.photo_pm_url ?? null,
        });
      }
      const rows = (obsRes.data ?? []).map((o) => {
        const key = `${o.round_id}|${o.pen_id}|${o.obs_date}`;
        const ph = photoIdx.get(key);
        return { ...o, pen_photo_am_url: ph?.am ?? "", pen_photo_pm_url: ph?.pm ?? "" };
      });
      downloadCsv(`snova_observations_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    } finally { setBusy(null); }
  };

  const exportEvapJoined = async () => {
    setBusy("evap_controls");
    try {
      const [evRes, photoRes] = await Promise.all([
        supabase.from("evap_controls").select("*"),
        supabase.from("session_photos").select("*").is("pen_id", null),
      ]);
      if (evRes.error) throw evRes.error;
      if (photoRes.error) throw photoRes.error;
      const idx = new Map<string, { am: string | null; pm: string | null }>();
      for (const p of photoRes.data ?? []) {
        idx.set(`${p.round_id}|${p.obs_date}`, {
          am: p.photo_am_url ?? null,
          pm: p.photo_pm_url ?? null,
        });
      }
      const rows = (evRes.data ?? []).map((e) => {
        const ph = idx.get(`${e.round_id}|${e.obs_date}`);
        return { ...e, control_photo_am_url: ph?.am ?? "", control_photo_pm_url: ph?.pm ?? "" };
      });
      downloadCsv(`snova_evap_controls_${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    } finally { setBusy(null); }
  };

  const exportAll = async () => {
    for (const t of TABLES) await exportOne(t);
    await exportObservationsJoined();
    await exportEvapJoined();
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-sm text-muted-foreground">Download every table as CSV. Observations and evap_controls include joined public photo URLs.</p>
      </header>
      <button onClick={exportAll} className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-primary-foreground font-semibold">
        <Download className="h-4 w-4" /> Download all tables
      </button>
      <ul className="space-y-2">
        {TABLES.map((t) => (
          <li key={t}>
            <button onClick={() => exportOne(t)} disabled={busy === t}
              className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span className="font-medium">{t}</span>
              <span className="text-primary text-xs font-medium">{busy === t ? "…" : "CSV →"}</span>
            </button>
          </li>
        ))}
        <li>
          <button onClick={exportObservationsJoined} disabled={busy === "observations"}
            className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <span className="font-medium">observations <span className="text-xs text-muted-foreground">(+ pen photo URLs)</span></span>
            <span className="text-primary text-xs font-medium">{busy === "observations" ? "…" : "CSV →"}</span>
          </button>
        </li>
        <li>
          <button onClick={exportEvapJoined} disabled={busy === "evap_controls"}
            className="w-full flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <span className="font-medium">evap_controls <span className="text-xs text-muted-foreground">(+ control photo URLs)</span></span>
            <span className="text-primary text-xs font-medium">{busy === "evap_controls" ? "…" : "CSV →"}</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
