import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Moon, Sun, Trophy, BarChart3, Settings, BookOpen, Download } from "lucide-react";
import { today } from "@/lib/date";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

function HomePage() {
  const t = today();
  const activeRound = useQuery({
    queryKey: ["active-round"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rounds").select("*").eq("status", "active").order("round_number", { ascending: false }).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const todaysObs = useQuery({
    queryKey: ["today-obs", t],
    queryFn: async () => {
      const { count, error } = await supabase.from("observations").select("id", { count: "exact", head: true }).eq("obs_date", t);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">SNOVA Feed Tracker</h1>
        <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Active round</div>
            <div className="mt-1 text-xl font-semibold">
              {activeRound.isLoading ? "…" : activeRound.data ? `Round ${activeRound.data.round_number}` : "None started"}
            </div>
          </div>
          <Link to="/rounds" className="text-sm text-primary font-medium">Manage →</Link>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Today's observations: <span className="font-semibold text-foreground">{todaysObs.data ?? 0}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BigTile to="/pm" title="PM Feeding" subtitle="~4:30 PM" icon={<Moon className="h-6 w-6" />} tone="earth" />
        <BigTile to="/am" title="AM Check" subtitle="~9:00 AM" icon={<Sun className="h-6 w-6" />} tone="leaf" />
        <BigTile to="/trial" title="Trial" subtitle="Design & status" icon={<FlaskConical className="h-6 w-6" />} tone="card" />
        <BigTile to="/results" title="Results" subtitle="Leaderboard & charts" icon={<BarChart3 className="h-6 w-6" />} tone="card" />
        <BigTile to="/rounds" title="Rounds" subtitle="Start / close" icon={<Trophy className="h-6 w-6" />} tone="card" />
        <BigTile to="/setup" title="Setup" subtitle="Pens & feeds" icon={<Settings className="h-6 w-6" />} tone="card" />
        <BigTile to="/guide" title="Field Guide" subtitle="SOP" icon={<BookOpen className="h-6 w-6" />} tone="card" />
      </div>

      <Link to="/export" className="flex items-center gap-2 justify-center rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
        <Download className="h-4 w-4" /> Export all data (CSV)
      </Link>
    </div>
  );
}

function BigTile({ to, title, subtitle, icon, tone }: { to: string; title: string; subtitle: string; icon: React.ReactNode; tone: "earth" | "leaf" | "card" }) {
  const cls = tone === "earth"
    ? "bg-earth text-earth-foreground"
    : tone === "leaf"
      ? "bg-leaf text-leaf-foreground"
      : "bg-card text-foreground";
  return (
    <Link to={to} className={`rounded-2xl border border-border p-4 shadow-sm active:scale-[0.99] transition ${cls}`}>
      <div className="opacity-90">{icon}</div>
      <div className="mt-3 text-base font-semibold">{title}</div>
      <div className="text-xs opacity-80">{subtitle}</div>
    </Link>
  );
}
