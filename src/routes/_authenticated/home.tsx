import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Moon, Sun, BarChart3, Settings, BookOpen, Download, FlaskConical, Scale, Users, AlertTriangle,
} from "lucide-react";
import { today } from "@/lib/date";
import { daysBetween } from "@/lib/metrics";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "Today — SNOVA Growth Tracker" },
      { name: "description", content: "Today's feeding, morning check and weighing status for the active snail growth trial, with quick access to every daily screen." },
      { property: "og:title", content: "Today — SNOVA Growth Tracker" },
      { property: "og:description", content: "Today's feeding, morning check and weighing status for the active snail growth trial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const DAY = 86_400_000;
const shift = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const longDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

function HomePage() {
  const t = today();
  const yesterday = shift(t, -1);
  const { siteName, siteId } = useSiteScope();

  const trial = useSiteTrial();
  const trialId = trial.data?.id;

  const assignments = useQuery({
    queryKey: ["assignments", trialId], enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id").eq("trial_id", trialId!)).data ?? [],
  });


  const daily = useQuery({
    queryKey: ["home-daily", trialId, t], enabled: !!trialId,
    queryFn: async () => {
      const [obs, welfare, photos, biomass] = await Promise.all([
        supabase.from("observations").select("pen_id,obs_date,offered_g").eq("trial_id", trialId!),
        supabase.from("welfare_checks").select("pen_id,obs_date").eq("trial_id", trialId!).eq("obs_date", yesterday),
        supabase.from("session_photos").select("pen_id,obs_date,photo_am_url,photo_pm_url").eq("trial_id", trialId!),
        supabase.from("biomass_events").select("pen_id,event_date").eq("trial_id", trialId!),
      ]);
      return {
        obs: obs.data ?? [],
        welfare: welfare.data ?? [],
        photos: photos.data ?? [],
        biomass: biomass.data ?? [],
      };
    },
  });

  const expected = assignments.data?.length ?? 0;
  const fedToday = new Set(
    (daily.data?.obs ?? []).filter((o) => o.obs_date === t && o.offered_g != null).map((o) => o.pen_id),
  ).size;
  const checked = new Set((daily.data?.welfare ?? []).map((w) => w.pen_id)).size;
  const pmPhotos = new Set(
    (daily.data?.photos ?? []).filter((p) => p.obs_date === t && p.photo_pm_url).map((p) => p.pen_id),
  ).size;
  const amPhotos = new Set(
    (daily.data?.photos ?? []).filter((p) => p.obs_date === yesterday && p.photo_am_url).map((p) => p.pen_id),
  ).size;

  const start = trial.data?.start_date as string | undefined;
  const dayNumber = start ? daysBetween(start, t) + 1 : null;
  const acclimationDays = (trial.data?.acclimation_days as number | undefined) ?? 0;
  const inAcclimation = dayNumber != null && dayNumber <= acclimationDays;
  const interval = (trial.data?.weighing_interval_days as number | undefined) ?? 7;
  const elapsed = start ? daysBetween(start, t) : null;
  const isWeighDay = elapsed != null && elapsed >= 0 && interval > 0 && elapsed % interval === 0;
  const daysToWeigh =
    elapsed != null && interval > 0 && !isWeighDay ? interval - (((elapsed % interval) + interval) % interval) : 0;

  const advisories: string[] = [];
  if (trial.data) {
    if (expected === 0) advisories.push("No pens are assigned to this trial yet.");
    if (expected > 0 && fedToday < expected) advisories.push(`${expected - fedToday} pen(s) not yet fed today.`);
    if (expected > 0 && pmPhotos < expected) advisories.push(`${expected - pmPhotos} evening photo(s) missing for today.`);
    if (expected > 0 && checked < expected) advisories.push(`${expected - checked} morning check(s) missing for ${yesterday}.`);
    const weighedPens = new Set((daily.data?.biomass ?? []).map((b) => b.pen_id)).size;
    if (expected > 0 && weighedPens < expected) advisories.push(`${expected - weighedPens} pen(s) have never been weighed.`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">SNOVA Growth Tracker</h1>
        <p className="text-sm text-muted-foreground">{longDate(t)}</p>
      </div>

      {!trial.isLoading && !trial.data ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          No trial is active.{" "}
          <Link to="/trial" className="text-primary underline">Set up and start a trial.</Link>
        </div>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Active trial</div>
            <div className="mt-1 text-xl font-semibold">{trial.data?.name ?? "…"}</div>
            {dayNumber != null && <div className="text-sm text-muted-foreground">Day {dayNumber}</div>}
          </div>

          {inAcclimation && (
            <p className="rounded-lg bg-earth/15 px-3 py-2 text-sm">
              Acclimation period — day {dayNumber} of {acclimationDays}. These days are excluded from the
              results unless you include them on the Trial screen.
            </p>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Fed today" value={`${fedToday}/${expected}`} />
            <Stat label={`Checks (${yesterday.slice(5)})`} value={`${checked}/${expected}`} />
            <Stat label="Photos today" value={`${pmPhotos + amPhotos}/${expected * 2}`} />
          </dl>

          {isWeighDay ? (
            <Link to="/weigh" className="block rounded-lg bg-primary px-3 py-3 text-center text-sm font-semibold text-primary-foreground">
              Weigh day today — open Weigh Day
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              Next scheduled weighing in {daysToWeigh} day{daysToWeigh === 1 ? "" : "s"}.
            </p>
          )}
        </section>
      )}

      {advisories.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-earth" /> Open advisories
          </h2>
          <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            {advisories.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today</h2>
        <div className="grid grid-cols-2 gap-3">
          <BigTile to="/pm" title="PM Feeding" subtitle="Evening" icon={<Moon className="h-7 w-7" />} tone="earth" big />
          <BigTile to="/am" title="AM Check" subtitle="Morning" icon={<Sun className="h-7 w-7" />} tone="leaf" big />
          <BigTile to="/weigh" title="Weigh Day" subtitle="Growth" icon={<Scale className="h-7 w-7" />} tone="leaf" big />
          <BigTile to="/guide" title="Field Guide" subtitle="SOP" icon={<BookOpen className="h-7 w-7" />} tone="earth" big />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manage</h2>
        <div className="grid grid-cols-2 gap-3">
          <BigTile to="/results" title="Results" subtitle="Charts & table" icon={<BarChart3 className="h-5 w-5" />} tone="card" />
          <BigTile to="/trial" title="Trial" subtitle="Design & status" icon={<FlaskConical className="h-5 w-5" />} tone="card" />
          <BigTile to="/population" title="Population Log" subtitle="Deaths & survival" icon={<Users className="h-5 w-5" />} tone="card" />
          <BigTile to="/setup" title="Setup" subtitle="Pens & feeds" icon={<Settings className="h-5 w-5" />} tone="card" />
        </div>
      </section>

      <Link to="/export" className="flex items-center gap-2 justify-center rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
        <Download className="h-4 w-4" /> Export data (CSV)
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-2 py-2">
      <dd className="text-lg font-semibold">{value}</dd>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function BigTile({ to, title, subtitle, icon, tone, big }: {
  to: string; title: string; subtitle: string; icon: React.ReactNode;
  tone: "earth" | "leaf" | "card"; big?: boolean;
}) {
  const cls = tone === "earth"
    ? "bg-earth text-earth-foreground"
    : tone === "leaf"
      ? "bg-leaf text-leaf-foreground"
      : "bg-card text-foreground";
  return (
    <Link to={to} className={`rounded-2xl border border-border shadow-sm active:scale-[0.99] transition ${big ? "p-5" : "p-4"} ${cls}`}>
      <div className="flex items-center gap-2">{icon}</div>
      <div className={`mt-2 font-semibold ${big ? "text-lg" : ""}`}>{title}</div>
      <div className="text-xs opacity-80">{subtitle}</div>
    </Link>
  );
}
