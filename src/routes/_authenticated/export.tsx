import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv } from "@/lib/csv";
import { useState } from "react";
import { Download } from "lucide-react";
import { computeMetrics, daysBetween, intervalExtras, roundOut, makeRetention, feedEaten, incompleteLabel, correctionStatus, eatenDryMatter, feedingShare, portionChanges } from "@/lib/metrics";
import { retentionContext } from "@/lib/retention";
import { makeCalendar } from "@/lib/operatingDays";

const out = (v: number | null | undefined, dp: number): number | "" => roundOut(v, dp) ?? "";
import { liveCount } from "@/lib/liveCount";
import { readIncludeAcclimation } from "@/lib/acclimation";
import { today } from "@/lib/date";
import { useSiteScope, useSiteTrial } from "@/lib/siteScope";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
  head: () => ({
    meta: [
      { title: "Data Export — SNOVA Growth Tracker" },
      { name: "description", content: "Download every trial table as CSV, including the computed interval summary used for analysis and costing." },
      { property: "og:title", content: "Data Export — SNOVA Growth Tracker" },
      { property: "og:description", content: "Download every trial table as CSV, including the computed interval summary." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = Record<string, unknown>;
const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);
const fileFor = (name: string) => `snova_${name}_${today()}.csv`;

async function all(table: string): Promise<Row[]> {
  const { data, error } = await supabase.from(table as never).select("*");
  if (error) throw error;
  return (data ?? []) as Row[];
}

import { PHOTO_BUCKET, storagePathFromUrl } from "@/lib/photoUpload";

/** Batch-sign photo references (stored public-style URLs or bare paths) so CSV
 *  links open while the bucket is private. Valid for 7 days. */
async function signPhotoRefs(values: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(values.filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const paths = unique.map((v) => storagePathFromUrl(v));
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, 7 * 24 * 3600);
  if (error) return out;
  data?.forEach((d, i) => {
    if (d?.signedUrl) out.set(unique[i]!, d.signedUrl);
  });
  return out;
}

const EXPORTS = [
  "feeds",
  "pens",
  "trials",
  "treatments",
  "pen_assignments",
  "observations",
  "biomass_events",
  "population_events",
  "welfare_checks",
  "session_photos",
  "interval_summary",
  "portion_changes",
  "moisture_controls",
] as const;

type ExportName = (typeof EXPORTS)[number];

const DESCRIPTIONS: Record<ExportName, string> = {
  feeds: "all columns",
  pens: "+ current live count",
  trials: "all columns",
  treatments: "+ feed name",
  pen_assignments: "+ pen and treatment labels",
  observations: "+ photos, pen, treatment, feed",
  biomass_events: "+ mean weight, pen, treatment",
  population_events: "+ pen label",
  welfare_checks: "+ pen label, flags as a list",
  session_photos: "all columns",
  interval_summary: "computed analysis sheet — selected site's active trial",
  portion_changes: "one row per portion change, derived from grams offered",
  moisture_controls: "+ nights and retention per night",
};

async function buildRows(name: ExportName, siteId: string | null): Promise<Row[]> {
  const [pens, feeds, trials, treatments, assignments, popEvents, sites] = await Promise.all([
    all("pens"), all("feeds"), all("trials"), all("treatments"), all("pen_assignments"), all("population_events"),
    all("sites"),
  ]);
  // "Pen 1" exists at more than one site, so every pen is named with its site.
  const siteName = new Map(sites.map((s) => [s['id'] as string, s['name'] as string]));
  const penLabel = new Map(
    pens.map((p) => {
      const site = siteName.get(p['site_id'] as string);
      return [p['id'] as string, site ? `${p['label']} · ${site}` : (p['label'] as string)];
    }),
  );
  const feedName = new Map(feeds.map((f) => [f['id'] as string, f['name'] as string]));
  const dmPercent = new Map(feeds.map((f) => [f['id'] as string, f['dm_percent'] == null ? null : Number(f['dm_percent'])]));
  const treatmentLabel = new Map(treatments.map((t) => [t['id'] as string, t['label'] as string]));

  const treatmentByPen = new Map(
    assignments.map((a) => [`${a['trial_id']}|${a['pen_id']}`, a['treatment_id'] as string]),
  );
  const treatmentFeed = new Map(treatments.map((t) => [t['id'] as string, t['feed_id'] as string]));
  const labelOfTreatmentForPen = (trialId: unknown, penId: unknown) => {
    const t = treatmentByPen.get(`${trialId}|${penId}`);
    return t ? treatmentLabel.get(t) ?? "" : "";
  };

  // Water-loss retention per trial, from its control feed and readings.
  let controlRows: Row[] | null = null;
  let closureRows: Row[] | null = null;
  const retentionCtxFor = async (trialId: string) => {
    controlRows ??= await all("moisture_controls");
    closureRows ??= await all("site_closures");
    const t = trials.find((x) => x['id'] === trialId);
    const sId = t?.['site_id'] as string | undefined;
    const site = sites.find((x) => x['id'] === sId);
    const cal = makeCalendar(
      (site?.['non_operating_weekdays'] as number[] | undefined) ?? [],
      closureRows.filter((c) => c['site_id'] === sId).map((c) => ({ closure_date: c['closure_date'] as string, reason: (c['reason'] as string) ?? null })),
    );
    const controlFeedId = (t?.['control_feed_id'] as string | null) ?? null;
    const readings = controlRows
      .filter((c) => c['trial_id'] === trialId && c['feed_id'] === controlFeedId)
      .map((c) => ({ obs_date: c['obs_date'] as string, offered_g: Number(c['offered_g']), remaining_g: c['remaining_g'] == null ? null : Number(c['remaining_g']) }));
    return retentionContext(controlFeedId, readings, cal);
  };

  switch (name) {
    case "feeds":
      return feeds;
    case "trials":
      return trials;
    case "session_photos": {
      const rows = await all("session_photos");
      const signed = await signPhotoRefs(
        rows.flatMap((r) => [r['photo_am_url'] as string, r['photo_pm_url'] as string]).filter(Boolean),
      );
      return rows.map((r) => ({
        ...r,
        photo_am_url: signed.get(r['photo_am_url'] as string) ?? "",
        photo_pm_url: signed.get(r['photo_pm_url'] as string) ?? "",
      }));
    }
    case "pens": {
      const d = today();
      return pens.map((p) => ({
        ...p,
        current_live_count: liveCount(
          { id: p['id'] as string, initial_snail_count: (p['initial_snail_count'] as number) ?? 0 },
          popEvents as never,
          d,
        ),
      }));
    }
    case "treatments":
      return treatments.map((t) => ({ ...t, feed_name: feedName.get(t['feed_id'] as string) ?? "" }));
    case "pen_assignments":
      return assignments.map((a) => ({
        ...a,
        pen_label: penLabel.get(a['pen_id'] as string) ?? "",
        treatment_label: treatmentLabel.get(a['treatment_id'] as string) ?? "",
      }));
    case "population_events":
      return popEvents.map((e) => ({ ...e, pen_label: penLabel.get(e['pen_id'] as string) ?? "" }));
    case "welfare_checks": {
      const rows = await all("welfare_checks");
      return rows.map((w) => ({
        ...w,
        health_flags: Array.isArray(w['health_flags']) ? (w['health_flags'] as string[]).join(";") : "",
        pen_label: penLabel.get(w['pen_id'] as string) ?? "",
      }));
    }
    case "observations": {
      const [obs, photos] = await Promise.all([all("observations"), all("session_photos")]);
      const signed = await signPhotoRefs(
        photos.flatMap((p) => [p['photo_am_url'] as string, p['photo_pm_url'] as string]).filter(Boolean),
      );
      const idx = new Map<string, { am: string; pm: string }>();
      for (const p of photos) {
        if (p['pen_id'] == null) continue;
        idx.set(`${p['trial_id']}|${p['pen_id']}|${p['obs_date']}`, {
          am: signed.get(p['photo_am_url'] as string) ?? "",
          pm: signed.get(p['photo_pm_url'] as string) ?? "",
        });
      }
      const retentionByTrial = new Map<string, ReturnType<typeof makeRetention>>();
      for (const tid of new Set(obs.map((o) => o['trial_id'] as string))) {
        retentionByTrial.set(tid, makeRetention(await retentionCtxFor(tid)));
      }
      return obs.map((o) => {
        const ph = idx.get(`${o['trial_id']}|${o['pen_id']}|${o['obs_date']}`);
        const r = retentionByTrial.get(o['trial_id'] as string)!(o['feed_id'] as string | null, o['obs_date'] as string);
        const leftover = o['leftover_g'] == null ? null : Number(o['leftover_g']);
        const offered = o['offered_g'] == null ? null : Number(o['offered_g']);
        const e = feedEaten(offered, leftover, r.retention);
        return {
          ...o,
          retention_used: leftover == null ? "" : out(r.retention, 4),
          correction_status: leftover == null ? "" : correctionStatus(r.status),
          leftover_as_offered_g: out(e?.leftoverAsOffered_g, 1),
          eaten_g: out(e?.eaten_g, 1),
          eaten_dm_g: out(eatenDryMatter(e?.eaten_g, dmPercent.get(o['feed_id'] as string)), 1),
          share_left_percent: out(e ? e.shareLeft * 100 : null, 1),
          pen_photo_am_url: ph?.am ?? "",
          pen_photo_pm_url: ph?.pm ?? "",
          pen_label: penLabel.get(o['pen_id'] as string) ?? "",
          treatment_label: labelOfTreatmentForPen(o['trial_id'], o['pen_id']),
          feed_name: feedName.get(o['feed_id'] as string) ?? "",
        };
      });
    }
    case "portion_changes": {
      const obs = (await all("observations")).filter((o) => o['feed_id'] != null);
      const trialIds = new Set(obs.map((o) => o['trial_id'] as string));
      const rows: Row[] = [];
      for (const tid of trialIds) {
        const trial = trials.find((t) => t['id'] === tid);
        const retentionFor = makeRetention(await retentionCtxFor(tid));
        const trialObs = obs.filter((o) => o['trial_id'] === tid);
        const penIds = Array.from(new Set(trialObs.map((o) => o['pen_id'] as string)))
          .sort((a, b) => (penLabel.get(a) ?? "").localeCompare(penLabel.get(b) ?? "", undefined, { numeric: true }));
        for (const penId of penIds) {
          const penObs = trialObs.filter((o) => o['pen_id'] === penId);
          const shares = penObs
            .map((o) => feedingShare({
              feed_id: o['feed_id'] as string,
              obs_date: o['obs_date'] as string,
              offered_g: o['offered_g'] == null ? null : Number(o['offered_g']),
              leftover_g: o['leftover_g'] == null ? null : Number(o['leftover_g']),
              refusal_score: (o['refusal_score'] as string) ?? null,
            }, retentionFor))
            .filter((x): x is NonNullable<typeof x> => x != null);
          for (const c of portionChanges(shares)) {
            const feedId = penObs.find((o) => o['obs_date'] === c.date)?.['feed_id'] as string | undefined;
            rows.push({
              site_name: siteName.get(trial?.['site_id'] as string) ?? "",
              trial_name: (trial?.['name'] as string) ?? "",
              pen_label: penLabel.get(penId) ?? "",
              treatment_label: labelOfTreatmentForPen(tid, penId),
              feed_name: feedName.get(feedId ?? "") ?? "",
              date: c.date,
              previous_g: out(c.previous_g, 1),
              new_g: out(c.new_g, 1),
              change_g: out(c.change_g, 1),
              change_pct: out(c.change_pct, 1),
              mean_share_left_before_percent: out(c.meanShareLeftBefore != null ? c.meanShareLeftBefore * 100 : null, 1),
              share_left_basis: c.basisBefore,
            });
          }
        }
      }
      return rows;
    }
    case "moisture_controls": {
      const rows = await all("moisture_controls");
      const lookups = new Map<string, ReturnType<typeof makeRetention>>();
      for (const tid of new Set(rows.map((c) => c['trial_id'] as string))) {
        lookups.set(tid, makeRetention(await retentionCtxFor(tid)));
      }
      return rows.map((c) => {
        const r = lookups.get(c['trial_id'] as string)!(c['feed_id'] as string, c['obs_date'] as string);
        const measured = r.status === "measured";
        const trial = trials.find((t) => t['id'] === c['trial_id']);
        return {
          ...c,
          site_name: siteName.get(c['site_id'] as string) ?? "",
          trial_name: (trial?.['name'] as string) ?? "",
          feed_name: feedName.get(c['feed_id'] as string) ?? "",
          nights: r.nights,
          retention_per_night: measured ? out(r.retentionNight, 4) : "",
        };
      });
    }
    case "biomass_events": {
      const rows = await all("biomass_events");
      const signed = await signPhotoRefs(rows.map((b) => b['photo_url'] as string).filter(Boolean));
      return rows.map((b) => {
        const n = (b['live_count'] as number) ?? 0;
        const net = (b['net_biomass_g'] as number) ?? 0;
        return {
          ...b,
          photo_url: signed.get(b['photo_url'] as string) ?? "",
          mean_weight_g: n > 0 ? net / n : "",
          pen_label: penLabel.get(b['pen_id'] as string) ?? "",
          treatment_label: labelOfTreatmentForPen(b['trial_id'], b['pen_id']),
        };
      });
    }
    case "interval_summary": {
      // The active trial of the site selected in the header — never another site's.
      const trial = trials.find((t) => t['status'] === "active" && t['site_id'] === siteId) ?? null;
      if (!trial) return [];
      const trialSiteName = siteName.get(trial['site_id'] as string) ?? "";
      const trialName = (trial['name'] as string) ?? "";
      const trialId = trial['id'] as string;
      // Closed days are not expected to carry a feeding, so they never count
      // as a missing feeding day.
      const trialSiteId = trial['site_id'] as string | null;
      const trialSite = sites.find((x) => x['id'] === trialSiteId);
      const closures = (await all("site_closures")).filter((c) => c['site_id'] === trialSiteId);
      const calendar = makeCalendar(
        (trialSite?.['non_operating_weekdays'] as number[] | undefined) ?? [],
        closures.map((c) => ({ closure_date: c['closure_date'] as string, reason: (c['reason'] as string) ?? null })),
      );
      const [obs, biomass] = await Promise.all([all("observations"), all("biomass_events")]);
      // Breeder pens have no feed, so they never enter the analysis sheet.
      const trialObs = obs
        .filter((o) => o['trial_id'] === trialId && o['feed_id'] != null)
        .map((o) => ({
          pen_id: o['pen_id'] as string,
          feed_id: o['feed_id'] as string,
          obs_date: o['obs_date'] as string,
          offered_g: (o['offered_g'] as number) ?? null,
          dish_action: (o['dish_action'] as string) ?? null,
          leftover_g: o['leftover_g'] == null ? null : Number(o['leftover_g']),
        }));
      const trialBiomass = biomass
        .filter((b) => b['trial_id'] === trialId)
        .map((b) => ({
          pen_id: b['pen_id'] as string,
          event_date: b['event_date'] as string,
          net_biomass_g: b['net_biomass_g'] as number,
          live_count: b['live_count'] as number,
        }));
      const trialTreatments = treatments
        .filter((t) => t['trial_id'] === trialId)
        .map((t) => ({ id: t['id'] as string, label: t['label'] as string, feed_id: t['feed_id'] as string }));
      const trialAssignments = assignments
        .filter((a) => a['trial_id'] === trialId)
        .map((a) => ({ pen_id: a['pen_id'] as string, treatment_id: a['treatment_id'] as string }));
      const assignedPens = pens
        .filter((p) => p['role'] !== "breeder" && trialAssignments.some((a) => a.pen_id === p['id']))
        .map((p) => ({ id: p['id'] as string, label: penLabel.get(p['id'] as string) ?? (p['label'] as string) }));


      const includeAcclimation = readIncludeAcclimation();
      const acclimationEnd = addDays(trial['start_date'] as string, (trial['acclimation_days'] as number) ?? 0);
      const dateIncluded = (d: string) => includeAcclimation || d >= acclimationEnd;

      const metrics = computeMetrics({
        trial: {
          id: trialId,
          start_date: trial['start_date'] as string,
          acclimation_days: (trial['acclimation_days'] as number) ?? 0,
        },
        pens: assignedPens,
        feeds: feeds.map((f) => ({
          id: f['id'] as string,
          name: f['name'] as string,
          dm_percent: (f['dm_percent'] as number) ?? null,
        })),
        treatments: trialTreatments,
        assignments: trialAssignments,
        observations: trialObs,
        biomass: trialBiomass,
        includeAcclimation,
        dryMatter: false,
        retention: await retentionCtxFor(trialId),
      });

      const rows: Row[] = [];
      for (const pen of metrics.pens) {
        const treatmentId = pen.treatmentId;
        const treatment = trialTreatments.find((t) => t.id === treatmentId);
        const penObs = trialObs.filter((o) => o.pen_id === pen.penId);
        for (const iv of pen.intervals) {
          const extras = intervalExtras(iv, penObs, dateIncluded, calendar.isOperating);
          const usable = iv.gain_g != null && iv.gain_g > 0;
          rows.push({
            site_name: trialSiteName,
            trial_name: trialName,
            pen_label: pen.label,
            treatment_label: treatment?.label ?? "",
            feed_name: treatment ? feedName.get(treatmentFeed.get(treatment.id) ?? "") ?? "" : "",
            interval_start: iv.from,
            interval_end: iv.to,
            days: daysBetween(iv.from, iv.to),
            "Economic FCR": iv.offeredPerKgGain != null ? out(iv.offeredPerKgGain, 2) : "",
            "Biological FCR": iv.eatenPerKgGain != null ? out(iv.eatenPerKgGain, 2) : usable ? incompleteLabel(iv.leftoverDays, iv.feedingDays) : "",
            "Biological FCR (dry matter)": iv.dmMissing ? "add dry-matter % in Setup" : iv.eatenDmPerKgGain != null ? out(iv.eatenDmPerKgGain, 2) : usable ? incompleteLabel(iv.leftoverDays, iv.feedingDays) : "",
            cum_eaten_g: out(iv.eaten_g, 1),
            leftover_coverage_percent: out(iv.leftoverCoverage != null ? iv.leftoverCoverage * 100 : null, 1),
            mean_share_left_percent: out(iv.meanShareLeft != null ? iv.meanShareLeft * 100 : null, 1),
            note: iv.eatenPerKgGain == null && usable ? "eaten not yet measured for this period" : "",
            cum_offered_g: out(iv.offered_g, 1),
            cum_eaten_dm_g: iv.dmMissing ? "" : out(iv.eatenDm_g, 1),
            mean_weight_start_g: out(iv.meanWeight1, 2),
            mean_weight_end_g: out(iv.meanWeight2, 2),
            live_count_start:
              trialBiomass.find((b) => b.pen_id === pen.penId && b.event_date === iv.from)?.live_count ?? "",
            live_count_end: iv.survivingCount,
            gain_g: out(iv.gain_g, 1),
            "growth per snail per day (g)": out(iv.growthPerSnailPerDay_g, 2),
            "pen gain per day (g)": out(iv.gainPerDay_g, 1),
            "feed offered per day (g)": out(iv.offeredPerDay_g, 1),
            "feed eaten per day (g)": iv.leftoverDays > 0 ? out(iv.eatenPerDay_g, 1) : "",
            "SGR (% body weight per day)": out(iv.sgr, 2),
            survival_percent: out(iv.survival, 1),
            feeding_rate_percent_bw_day: out(iv.feedingRate, 1),
            missing_feeding_days: extras.missingFeedingDays,
          });
        }
      }
      return rows;
    }
  }
}

function ExportPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { siteId, siteName } = useSiteScope();
  const siteTrial = useSiteTrial();

  const run = async (name: ExportName) => {
    setBusy(name);
    setError(null);
    try {
      if (name === "interval_summary" && !siteTrial.data) {
        setError(`No active trial at ${siteName || "this site"}`);
        return;
      }
      const rows = await buildRows(name, siteId);
      downloadCsv(fileFor(name), toCsv(rows));
    } catch (e) {
      console.error(`Export ${name} failed`, e);
      setError(`Could not export ${name}. Try again.`);
    } finally {
      setBusy(null);
    }
  };

  const runAll = async () => {
    for (const name of EXPORTS) await run(name);
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Export</h1>
        <p className="text-sm text-muted-foreground">
          Download the trial records as CSV. The interval summary is the analysis sheet — one row per pen per
          weighing interval, using exactly the figures shown on Results. Apply your own feed price there.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p>
      )}

      <button
        onClick={runAll}
        disabled={!!busy}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-primary-foreground font-semibold disabled:opacity-60"
      >
        <Download className="h-4 w-4" /> {busy ? `Exporting ${busy}…` : "Download all"}
      </button>

      <ul className="space-y-2">
        {EXPORTS.map((name) => (
          <li key={name}>
            <button
              onClick={() => run(name)}
              disabled={!!busy}
              className={`w-full flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm text-left ${
                name === "interval_summary" ? "border-primary/60" : "border-border"
              }`}
            >
              <span>
                <span className="font-medium">{name}</span>{" "}
                <span className="text-xs text-muted-foreground">{DESCRIPTIONS[name]}</span>
              </span>
              <span className="text-primary text-xs font-medium shrink-0">
                {busy === name ? "…" : "CSV →"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
