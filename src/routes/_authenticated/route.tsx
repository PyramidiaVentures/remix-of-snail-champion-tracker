import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Home, ClipboardList, Moon, Sun, BarChart3, BookOpen, Download, Settings, LogOut, FlaskConical, Scale, Users, MapPin } from "lucide-react";
import { SiteProvider, useSite } from "@/components/SiteProvider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
  const { user } = Route.useRouteContext();

  return (
    <SiteProvider userId={user.id}>
      <AuthenticatedShell />
    </SiteProvider>
  );
}

function SiteSelector() {
  const { sites, selectedSiteId, setSelectedSiteId, isLoading, isSaving, errorMessage } = useSite();

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        <MapPin className="h-3 w-3" aria-hidden="true" />
        <span>Site</span>
        {isSaving && <span className="sr-only" role="status">Saving site</span>}
      </div>
      <Select
        value={selectedSiteId ?? undefined}
        onValueChange={setSelectedSiteId}
        disabled={isLoading || sites.length === 0 || isSaving}
      >
        <SelectTrigger className="mt-0.5 h-8 w-[8.25rem] bg-background px-2 text-xs sm:w-36" aria-label="Current site">
          <SelectValue placeholder={isLoading ? "Loading…" : "Select site"} />
        </SelectTrigger>
        <SelectContent align="end">
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorMessage && <p className="sr-only" role="alert">{errorMessage}</p>}
    </div>
  );
}

function AuthenticatedShell() {
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
        <div className="mx-auto max-w-2xl px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
          <Link to="/home" className="flex min-w-0 items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">S</div>
            <span className="hidden truncate font-semibold min-[430px]:inline">SNOVA Growth Tracker</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <SiteSelector />
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
          </div>
          <nav className="mt-2 hidden items-center justify-between gap-1 text-sm sm:flex">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="px-2 py-1 rounded-md text-muted-foreground hover:text-foreground"
                activeProps={{ className: "px-2 py-1 rounded-md text-primary font-medium" }}>
                {n.label}
              </Link>
            ))}
          </nav>
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
