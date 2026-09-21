import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/date";
import { PenStepper, type PenCompletion, type StepperPen } from "@/components/PenStepper";
import { PhotoFrame, PhotoLightbox } from "@/components/PhotoFrame";
import { useSitePens, useSiteScope } from "@/lib/siteScope";

type Search = { mode?: string; date?: string; pen?: string };

export const Route = createFileRoute("/_authenticated/photos")({
  component: PhotosPage,
  validateSearch: (search: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof search['mode'] === "string") out.mode = search['mode'];
    if (typeof search['date'] === "string") out.date = search['date'];
    if (typeof search['pen'] === "string") out.pen = search['pen'];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Photo review — SNOVA Growth Tracker" },
      { name: "description", content: "Review the evening, morning and weighing photographs recorded for each pen, by date or over time." },
      { property: "og:title", content: "Photo review — SNOVA Growth Tracker" },
      { property: "og:description", content: "Browse the photographic evidence captured for every pen, day by day or pen by pen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type SessionRow = { pen_id: string; obs_date: string; photo_am_url: string | null; photo_pm_url: string | null };
type WeighRow = { pen_id: string; event_date: string; photo_url: string | null };
type ObservationRow = {
  pen_id: string;
  obs_date: string;
  offered_g: number | null;
  dish_action: string | null;
  refusal_score: string | null;
};

const PAGE = 8;

const DISH_ACTION_LABELS: Record<string, string> = {
  topped_up: "Topped up",
  emptied_refilled: "Emptied & refilled",
  emptied_spoiled: "Emptied — spoiled",
};

const REFUSAL_LABELS: Record<string, string> = {
  none_left: "None left",
  trace: "Trace",
  about_25: "About 25%",
  about_50: "About 50%",
  most_left: "Most left",
};

function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

/**
 * The morning the dish is actually checked. Normally the next day, but when
 * that day is closed at the site nobody is there — the check happens on the
 * next operating morning instead (a Saturday feeding is checked on Monday).
 */
function morningOf(date: string, calendar: OperatingCalendar) {
  return calendar.nextOperatingDay(nextDate(date));
}

/** "16 hours later" only holds for a same-next-morning check. */
function afterLabel(date: string, morning: string) {
  return morning === nextDate(date)
    ? "After — 16 hours later"
    : `After — checked ${displayDate(morning)} morning`;
}

function displayDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[value.getUTCDay()]} ${value.getUTCDate()} ${months[value.getUTCMonth()]}`;
}

function CycleDetails({ observation }: { observation: ObservationRow | undefined }) {
  return (
    <dl className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-3 lg:grid-cols-1">
      <div>
        <dt className="text-xs text-muted-foreground">Grams offered</dt>
        <dd className="font-semibold">{observation?.offered_g == null ? "—" : `${observation.offered_g} g`}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Dish action</dt>
        <dd className="font-semibold">
          {observation?.dish_action ? DISH_ACTION_LABELS[observation.dish_action] ?? observation.dish_action : "—"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Morning refusal score</dt>
        <dd className="font-semibold">
          {observation?.refusal_score ? REFUSAL_LABELS[observation.refusal_score] ?? observation.refusal_score : "—"}
        </dd>
      </div>
    </dl>
  );
}

function CycleHeading({ penLabel, date, morning }: { penLabel: string; date: string; morning: string }) {
  return (
    <h2 className="text-base font-semibold">
      {penLabel} — fed {displayDate(date)} evening, checked {displayDate(morning)} morning
    </h2>
  );
}

function PhotosPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/photos" });
  const { siteId, siteName } = useSiteScope();
  const pens = useSitePens();
  const allPens = useMemo(() => pens.data ?? [], [pens.data]);

  const mode = search.mode === "pen" ? "pen" : "date";
  const date = search.date || today();
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);

  const setSearch = (next: Search) => {
    const current = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("pen");
    void navigate({ search: { mode, date, ...(current ? { pen: current } : {}), ...next } });
  };

  const penIds = useMemo(() => allPens.map((p) => p.id), [allPens]);

  /* ------------------------------------------------------ mode 1: by date */

  const dayPhotos = useQuery({
    queryKey: ["photos-day", siteId, date, penIds.length],
    enabled: mode === "date" && penIds.length > 0,
    queryFn: async () => {
      const [sessions, weighs, observations] = await Promise.all([
        supabase.from("session_photos").select("pen_id,obs_date,photo_am_url,photo_pm_url")
          .in("pen_id", penIds).eq("obs_date", date),
        supabase.from("biomass_events").select("pen_id,event_date,photo_url")
          .in("pen_id", penIds).eq("event_date", date),
        supabase.from("observations").select("pen_id,obs_date,offered_g,dish_action,refusal_score")
          .in("pen_id", penIds).eq("obs_date", date),
      ]);
      return {
        sessions: (sessions.data ?? []) as SessionRow[],
        weighs: (weighs.data ?? []) as WeighRow[],
        observations: (observations.data ?? []) as ObservationRow[],
      };
    },
  });

  const sessionFor = (penId: string) => (dayPhotos.data?.sessions ?? []).find((s) => s.pen_id === penId);
  const weighFor = (penId: string) =>
    (dayPhotos.data?.weighs ?? []).find((w) => w.pen_id === penId && !!w.photo_url)?.photo_url ?? null;
  const observationFor = (penId: string) =>
    (dayPhotos.data?.observations ?? []).find((o) => o.pen_id === penId);

  const recorded = allPens.reduce((n, p) => {
    const s = sessionFor(p.id);
    return n + (s?.photo_pm_url ? 1 : 0) + (s?.photo_am_url ? 1 : 0);
  }, 0);
  const expected = allPens.length * 2;

  const stateFor = (penId: string): PenCompletion => {
    const s = sessionFor(penId);
    const n = (s?.photo_pm_url ? 1 : 0) + (s?.photo_am_url ? 1 : 0);
    return n === 2 ? "complete" : n === 1 ? "partial" : "empty";
  };
  const missingFor = (penId: string) => {
    const s = sessionFor(penId);
    const miss: string[] = [];
    if (!s?.photo_pm_url) miss.push("evening photo");
    if (!s?.photo_am_url) miss.push("morning photo");
    return miss;
  };

  const stepperPens: StepperPen[] = allPens.map((p) => ({
    id: p.id,
    label: p.label,
    role: p.role === "breeder" ? "breeder" : "trial",
  }));

  /* -------------------------------------------------- mode 2: by pen over time */

  const selectedPenId = search.pen && search.pen !== "summary" ? search.pen : allPens[0]?.id;
  const selectedPen = allPens.find((p) => p.id === selectedPenId);
  const [shown, setShown] = useState(PAGE);

  const penHistory = useQuery({
    queryKey: ["photos-pen", selectedPenId],
    enabled: mode === "pen" && !!selectedPenId,
    queryFn: async () => {
      if (!selectedPenId) return { sessions: [], weighs: [], observations: [] };
      const [sessions, weighs, observations] = await Promise.all([
        supabase.from("session_photos").select("pen_id,obs_date,photo_am_url,photo_pm_url")
          .eq("pen_id", selectedPenId).order("obs_date", { ascending: false }),
        supabase.from("biomass_events").select("pen_id,event_date,photo_url").eq("pen_id", selectedPenId),
        supabase.from("observations").select("pen_id,obs_date,offered_g,dish_action,refusal_score")
          .eq("pen_id", selectedPenId),
      ]);
      return {
        sessions: (sessions.data ?? []) as SessionRow[],
        weighs: (weighs.data ?? []) as WeighRow[],
        observations: (observations.data ?? []) as ObservationRow[],
      };
    },
  });

  const historyRows = useMemo(() => {
    const sessions = penHistory.data?.sessions ?? [];
    const weighs = penHistory.data?.weighs ?? [];
    const observations = penHistory.data?.observations ?? [];
    const dates = new Set<string>([
      ...sessions.filter((s) => s.photo_am_url || s.photo_pm_url).map((s) => s.obs_date),
      ...weighs.filter((w) => w.photo_url).map((w) => w.event_date),
    ]);
    return [...dates].sort((a, b) => b.localeCompare(a)).map((d) => ({
      date: d,
      pm: sessions.find((s) => s.obs_date === d)?.photo_pm_url ?? null,
      am: sessions.find((s) => s.obs_date === d)?.photo_am_url ?? null,
      weigh: weighs.find((w) => w.event_date === d && w.photo_url)?.photo_url ?? null,
      observation: observations.find((o) => o.obs_date === d),
    }));
  }, [penHistory.data]);

  const penLabel = (id: string) => allPens.find((p) => p.id === id)?.label ?? "Pen";

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{siteName || "—"}</div>
        <h1 className="text-2xl font-bold">Photo review</h1>
        <p className="text-sm text-muted-foreground">
          The photographic record for {siteName || "this site"} — evening, morning and weighing shots, breeder
          pens included.
        </p>
        <div className="flex gap-2">
          {(["date", "pen"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSearch({ mode: m })}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              }`}
            >
              {m === "date" ? "By date" : "By pen over time"}
            </button>
          ))}
        </div>
      </header>

      {allPens.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          No pens at {siteName || "this site"} yet.
        </p>
      ) : mode === "date" ? (
        <section className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Date</span>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setSearch({ date: e.currentTarget.value })}
              className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
          </label>
          <p className="text-sm font-medium">
            {recorded} of {expected} photos recorded for this date.
          </p>

          <PenStepper
            pens={stepperPens}
            stateFor={stateFor}
            missingFor={missingFor}
            renderPen={(pen) => {
              const s = sessionFor(pen.id);
              const weigh = weighFor(pen.id);
              return (
                <div className="space-y-3">
                  <CycleHeading penLabel={pen.label} date={date} />
                  <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_13rem]">
                    <PhotoFrame stored={s?.photo_pm_url} session="Before — feed offered" penLabel={pen.label}
                      siteName={siteName} date={date} onOpen={(url, caption) => setLightbox({ url, caption })} />
                    <PhotoFrame stored={s?.photo_am_url} session="After — 16 hours later" penLabel={pen.label}
                      siteName={siteName} date={nextDate(date)} onOpen={(url, caption) => setLightbox({ url, caption })} />
                    <CycleDetails observation={observationFor(pen.id)} />
                  </div>
                  {weigh && (
                    <div className="max-w-md">
                      <PhotoFrame stored={weigh} session="Weighing" penLabel={pen.label}
                        siteName={siteName} date={date} onOpen={(url, caption) => setLightbox({ url, caption })} />
                    </div>
                  )}
                </div>
              );
            }}
          />
        </section>
      ) : (
        <section className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Pen</span>
            <select
              value={selectedPenId ?? ""}
              onChange={(e) => { setShown(PAGE); setSearch({ pen: e.currentTarget.value }); }}
              className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
            >
              {allPens.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}{p.role === "breeder" ? " (breeder)" : ""}
                </option>
              ))}
            </select>
          </label>

          {penHistory.isPending ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : historyRows.length === 0 ? (
            <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              No photos recorded for {selectedPen?.label ?? "this pen"} yet.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {historyRows.length} day{historyRows.length === 1 ? "" : "s"} with photos, newest first.
              </p>
              <div className="space-y-4">
                 {historyRows.slice(0, shown).map((row) => {
                   const label = selectedPenId ? penLabel(selectedPenId) : "Pen";
                   return (
                   <div key={row.date} className="space-y-3 border-b border-border pb-5 last:border-0">
                     <CycleHeading penLabel={label} date={row.date} />
                     <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_13rem]">
                       <PhotoFrame stored={row.pm} session="Before — feed offered" penLabel={label}
                         siteName={siteName} date={row.date} onOpen={(url, caption) => setLightbox({ url, caption })} />
                       <PhotoFrame stored={row.am} session="After — 16 hours later" penLabel={label}
                         siteName={siteName} date={nextDate(row.date)} onOpen={(url, caption) => setLightbox({ url, caption })} />
                       <CycleDetails observation={row.observation} />
                    </div>
                     {row.weigh && (
                       <div className="max-w-md">
                         <PhotoFrame stored={row.weigh} session="Weighing" penLabel={label}
                           siteName={siteName} date={row.date} onOpen={(url, caption) => setLightbox({ url, caption })} />
                       </div>
                     )}
                  </div>
                   );
                 })}
              </div>
              {shown < historyRows.length && (
                <button
                  type="button"
                  onClick={() => setShown((s) => s + PAGE)}
                  className="w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold"
                >
                  Show earlier days
                </button>
              )}
            </>
          )}
        </section>
      )}

      <PhotoLightbox open={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
