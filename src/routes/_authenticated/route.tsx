import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Home, ClipboardList, Moon, Sun, BarChart3, BookOpen, Download, Settings, LogOut, FlaskConical, Scale, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const nav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/pm", label: "PM Feed", icon: Moon },
  { to: "/am", label: "AM Check", icon: Sun },
  { to: "/weigh", label: "Weigh", icon: Scale },
  { to: "/trial", label: "Trial", icon: FlaskConical },
  { to: "/population", label: "Population", icon: Users },
  { to: "/results", label: "Results", icon: BarChart3 },
  { to: "/setup", label: "Setup", icon: Settings },
  { to: "/guide", label: "Guide", icon: BookOpen },
  { to: "/export", label: "Export", icon: Download },
] as const;

function AuthedLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  // Bottom-nav visible items (5 most-used)
  const bottom = nav.slice(0, 5);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">S</div>
            <span className="font-semibold">SNOVA Growth Tracker</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="px-2 py-1 rounded-md text-muted-foreground hover:text-foreground"
                activeProps={{ className: "px-2 py-1 rounded-md text-primary font-medium" }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <button onClick={signOut} className="text-muted-foreground hover:text-foreground p-2" aria-label="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-10 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {bottom.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link key={n.to} to={n.to} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-primary" : "text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _iconTypes = ClipboardList;
