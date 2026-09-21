import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Moon, Sun, BarChart3, Settings, BookOpen, Download, FlaskConical, Scale, Users, AlertTriangle,
  LayoutDashboard,
} from "lucide-react";
import { today } from "@/lib/date";
import { daysBetween } from "@/lib/metrics";
import { NoActiveTrial, useSitePens, useSiteScope, useSiteTrial } from "@/lib/siteScope";
import { useAllSiteCalendars, useSiteCalendar } from "@/lib/operatingDays";
import { buildSchedule, type SchedulePen } from "@/lib/weighSchedule";
import {
  computeDayReview,
  fetchDayInputs,
  lastCompletedDay,
  summarizeExceptions,
  type DayReviewPen,
} from "@/lib/dayExceptions";


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
  // The morning check done today completes the feeding from the previous
  // operating day — Saturday's feed when Sunday is closed, never yesterday
  // if it was a closed day.
  const feedDay = calendar.previousOperatingDay(t);
  const { siteName, siteId } = useSiteScope();
  const { calendar } = useSiteCalendar();

  const trial = useSiteTrial();
  const trialId = trial.data?.id;
  const pens = useSitePens();

  const assignments = useQuery({
    queryKey: ["assignments", trialId], enabled: !!trialId,
    queryFn: async () =>
      (await supabase.from("pen_assignments").select("pen_id,start_date").eq("trial_id", trialId!)).data ?? [],
  });


  const daily = useQuery({
    queryKey: ["home-daily", trialId, t, feedDay], enabled: !!trialId,
    queryFn: async () => {
      const [obs, welfare, photos, biomass] = await Promise.all([
        supabase.from("observations").select("pen_id,obs_date,offered_g").eq("trial_id", trialId!),
        supabase.from("welfare_checks").select("pen_id,obs_date").eq("trial_id", trialId!).eq("obs_date", feedDay),
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

  // The exceptions summary reports the same date the dashboard defaults to —
  // the last completed operating day — computed by the same shared function so
  // the two screens can never disagree.
  const reportDate = lastCompletedDay(calendar);
  // A day before the trial began has no work to report on, so it is never screened.
  const beforeStart = !!trial.data?.start_date && reportDate < trial.data.start_date;
  const dayInputs = useQuery({
    queryKey: ["home-exceptions", trialId, reportDate],
    enabled: !!trialId && !beforeStart,
    queryFn: () => fetchDayInputs(trialId!, reportDate),
  });
  const review = useMemo(
    () =>
      dayInputs.data && pens.data
        ? computeDayReview({
            pens: pens.data as DayReviewPen[],
            assignments: assignments.data ?? [],
            trialInterval: trial.data?.weighing_interval_days,
            data: dayInputs.data,
            calendar,
            date: reportDate,
            siteName: siteName || "",
          })
        : null,
    [dayInputs.data, pens.data, assignments.data, trial.data?.weighing_interval_days, calendar, reportDate, siteName],
  );

  // Trial pens and breeder pens are always counted apart, so a completion
  // figure never silently mixes the two kinds of pen.
  const breederIds = useMemo(
    () => new Set((pens.data ?? []).filter((p) => p.role === "breeder").map((p) => p.id)),
    [pens.data],
  );
  const trialOnly = <T extends { pen_id: string }>(rows: T[]) => rows.filter((r) => !breederIds.has(r.pen_id));

  const expected = assignments.data?.length ?? 0;
  const breederExpected = breederIds.size;
  const fedToday = new Set(
    trialOnly((daily.data?.obs ?? []).filter((o) => o.obs_date === t && o.offered_g != null)).map((o) => o.pen_id),
  ).size;
  const checked = new Set(trialOnly(daily.data?.welfare ?? []).map((w) => w.pen_id)).size;
  const pmPhotos = new Set(
    trialOnly((daily.data?.photos ?? []).filter((p) => p.obs_date === t && p.photo_pm_url)).map((p) => p.pen_id),
  ).size;
  const amPhotos = new Set(
    trialOnly((daily.data?.photos ?? []).filter((p) => p.obs_date === yesterday && p.photo_am_url)).map((p) => p.pen_id),
  ).size;

  const start = trial.data?.start_date as string | undefined;
  const dayNumber = start ? daysBetween(start, t) + 1 : null;
  const acclimationDays = (trial.data?.acclimation_days as number | undefined) ?? 0;
  const inAcclimation = dayNumber != null && dayNumber <= acclimationDays;
  // Weighing runs pen by pen: each pen has its own interval, falling back to
  // the trial's when it has none.
  const startDateByPen = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments.data ?? []) if (!m.has(a.pen_id)) m.set(a.pen_id, a.start_date);
    return m;
  }, [assignments.data]);

  const scheduleRows = useMemo(
    () =>
      buildSchedule({
        pens: (pens.data ?? []) as SchedulePen[],
        trialInterval: trial.data?.weighing_interval_days,
        startDateByPen,
        events: daily.data?.biomass ?? [],
        today: t,
        isOperating: calendar.isOperating,
        nextOperatingDay: calendar.nextOperatingDay,
      }),
    [pens.data, trial.data?.weighing_interval_days, startDateByPen, daily.data?.biomass, t, calendar],
  );
  const dueTodayCount = scheduleRows.filter((r) => r.dueToday).length;
  const overdueCount = scheduleRows.filter((r) => r.overdueDays > 0).length;
  const isWeighDay = dueTodayCount > 0 || overdueCount > 0;
  const nextDueDate = scheduleRows
    .map((r) => r.nextDue)
    .filter((d): d is string => !!d && d > t)
    .sort()[0] ?? null;
  const daysToWeigh = nextDueDate ? daysBetween(t, nextDueDate) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">SNOVA Growth Tracker</h1>
        <p className="text-sm text-muted-foreground">{longDate(t)} · {siteName || "—"}</p>
      </div>

      <Link
        to="/dashboard"
        className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium"
      >
        <span className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4" /> Daily dashboard</span>
        <span className="text-xs text-muted-foreground">exceptions, completeness, numbers</span>
      </Link>

      {!!siteId && !trial.isLoading && !trial.data ? (
        <NoActiveTrial siteName={siteName} />
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Active trial · {siteName}</div>
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
              {dueTodayCount} pen{dueTodayCount === 1 ? "" : "s"} due today
              {overdueCount > 0 ? `, ${overdueCount} overdue` : ""} — open Weigh Day
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              {daysToWeigh != null
                ? `Next weighing due in ${daysToWeigh} day${daysToWeigh === 1 ? "" : "s"}.`
                : "No weighing is scheduled."}
            </p>
          )}
        </section>
      )}

      <OtherSites currentSiteId={siteId} date={t} />



      {trial.data && beforeStart && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          The trial starts {longDate(trial.data.start_date)} — nothing to report yet.
        </div>
      )}

      {trial.data && !beforeStart && (
        <Link
          to="/dashboard"
          search={{ date: reportDate }}
          className="block rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-sm"
        >
          {!review ? (
            <span className="text-muted-foreground">Checking {longDate(reportDate)}…</span>

          ) : review.exceptions.length === 0 ? (
            <span className="font-medium text-primary">Every item was closed on {longDate(reportDate)}.</span>
          ) : (
            <>
              <span className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 text-earth" />
                {review.exceptions.length} exception{review.exceptions.length === 1 ? "" : "s"} on {longDate(reportDate)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {summarizeExceptions(review.exceptions)}
              </span>
            </>
          )}
        </Link>
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
          <BigTile to="/dashboard" title="Dashboard" subtitle="Day in detail" icon={<LayoutDashboard className="h-5 w-5" />} tone="card" />
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

/** One compact line per other site: trial day, today's feeding completion and
 *  the exception count for its last completed day — the same computation the
 *  dashboard uses, so a problem elsewhere is visible without switching. */
function OtherSites({ currentSiteId, date }: { currentSiteId: string | null; date: string }) {
  const { sites } = useSiteScope();
  const { calendarFor } = useAllSiteCalendars();
  const otherIds = sites.filter((s) => s.id !== currentSiteId).map((s) => s.id);

  const summary = useQuery({
    queryKey: ["other-site-status", otherIds, date],
    enabled: otherIds.length > 0,
    queryFn: async () => {
      const { data: trials } = await supabase
        .from("trials")
        .select("id,site_id,start_date,weighing_interval_days")
        .eq("status", "active")
        .in("site_id", otherIds);
      const list = trials ?? [];
      if (list.length === 0)
        return [] as {
          siteId: string; day: number | null; fed: number; expected: number;
          exceptions: number | null; startDate: string | null;
        }[];
      const ids = list.map((t) => t.id);
      const [{ data: pa }, { data: obs }, { data: sitePens }] = await Promise.all([
        supabase.from("pen_assignments").select("trial_id,pen_id,start_date").in("trial_id", ids),
        supabase.from("observations").select("trial_id,pen_id,offered_g").in("trial_id", ids).eq("obs_date", date),
        supabase.from("pens").select("id,site_id,label,role,initial_snail_count,weighing_interval_days").in("site_id", otherIds),
      ]);
      return Promise.all(
        list.map(async (t) => {
          const calendar = calendarFor(t.site_id);
          const reportDate = lastCompletedDay(calendar);
          // Never screen a day that falls before this site's trial began.
          const beforeStart = !!t.start_date && reportDate < t.start_date;
          const review = beforeStart
            ? null
            : computeDayReview({
                pens: (sitePens ?? []).filter((p) => p.site_id === t.site_id) as DayReviewPen[],
                assignments: (pa ?? []).filter((r) => r.trial_id === t.id),
                trialInterval: t.weighing_interval_days,
                data: await fetchDayInputs(t.id, reportDate),
                calendar,
                date: reportDate,
                siteName: sites.find((s) => s.id === t.site_id)?.name ?? "",
              });
          return {
            siteId: t.site_id,
            startDate: t.start_date ?? null,
            day: t.start_date ? daysBetween(t.start_date, date) + 1 : null,
            expected: new Set((pa ?? []).filter((r) => r.trial_id === t.id).map((r) => r.pen_id)).size,
            fed: new Set(
              (obs ?? []).filter((r) => r.trial_id === t.id && r.offered_g != null).map((r) => r.pen_id),
            ).size,
            exceptions: review ? review.exceptions.length : null,
          };
        }),
      );
    },
  });

  if (otherIds.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground space-y-1">
      {sites
        .filter((s) => s.id !== currentSiteId)
        .map((s) => {
          const row = summary.data?.find((r) => r.siteId === s.id);
          return (
            <div key={s.id}>
              <span className="font-medium text-foreground">{s.name}</span>{" "}
              {row
                ? `· Day ${row.day ?? "—"} · fed ${row.fed}/${row.expected} today · ${
                    row.exceptions === null
                      ? `trial starts ${longDate(row.startDate!)}`
                      : row.exceptions === 0
                        ? "clean"
                        : `${row.exceptions} exception${row.exceptions === 1 ? "" : "s"}`
                  }`
                : summary.isPending
                  ? "· loading…"
                  : "· no active trial"}
            </div>
          );
        })}
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
