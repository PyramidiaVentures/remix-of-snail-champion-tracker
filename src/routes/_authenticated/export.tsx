import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useState } from "react";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
});

const TABLES = ["feeds", "pens", "rounds", "observations", "evap_controls", "pen_daily"] as const;

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

  const exportAll = async () => {
    for (const t of TABLES) await exportOne(t);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-sm text-muted-foreground">Download every table as CSV.</p>
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
      </ul>
    </div>
  );
}
