import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { today } from "@/lib/date";
import { addDays, roundOut, makeRetention, observationBand, SHARE_BANDS, type ShareBand } from "@/lib/metrics";
import { retentionContext } from "@/lib/retention";
import type { OperatingCalendar } from "@/lib/operatingDays";

type Band = ShareBand;
const BAND_ORDER = SHARE_BANDS.map((b) => b.key);
const BAND_LABEL = Object.fromEntries(SHARE_BANDS.map((b) => [b.key, b.label])) as Record<Band, string>;
const BAND_MEANING = Object.fromEntries(SHARE_BANDS.map((b) => [b.key, b.meaning])) as Record<Band, string>;

const TEMP_MIN = 25;
const TEMP_MAX = 30;
const HUM_MIN = 70;
const HUM_MAX = 95;

type Props = {
  trialId: string | undefined;
  /** pen id -> treatment id, for the treatment filter */
  treatmentByPen: Map<string, string>;
  treatments: { id: string; label: string }[];
  breederPenIds: Set<string>;
  /** The site's operating calendar — closed days never appear on an axis. */
  calendar: OperatingCalendar;
  /** The trial's control feed — leftovers of this feed are corrected for water loss. */
  controlFeedId?: string | null;
};

/** Every date in the window, oldest first. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

/** Monday that starts the calendar week containing the date. */
function weekStart(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  const dow = (dt.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(d, -dow);
}

const shortDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function DashboardTrends({ trialId, treatmentByPen, treatments, breederPenIds, calendar, controlFeedId }: Props) {
  const [to, setTo] = useState(today());
  const [from, setFrom] = useState(addDays(today(), -13));
  const [treatmentFilter, setTreatmentFilter] = useState<string>("all");

  const rangeValid = from <= to;

  const trends = useQuery({
    queryKey: ["dash-trends", trialId, from, to],
    enabled: !!trialId && rangeValid,
    queryFn: async () => {
      const [obs, welfare, controls] = await Promise.all([
        supabase
          .from("observations")
          .select("pen_id,feed_id,obs_date,offered_g,leftover_g,refusal_score")
          .eq("trial_id", trialId!)
          .gte("obs_date", from)
          .lte("obs_date", to),
        supabase
          .from("welfare_checks")
          .select("pen_id,obs_date,temp_c,humidity_pct")
          .eq("trial_id", trialId!)
          .gte("obs_date", from)
          .lte("obs_date", to),
        supabase
          .from("moisture_controls")
          .select("obs_date,offered_g,remaining_g,feed_id")
          .eq("trial_id", trialId!),
      ]);
      return { obs: obs.data ?? [], welfare: welfare.data ?? [], controls: controls.data ?? [] };
    },
  });

  // Operating days only — a closed day never appears on an axis, never plots
  // a zero, and never counts toward a weekly mean or a days-outside count.
  const days = useMemo(
    () => (rangeValid ? dateRange(from, to).filter((d) => calendar.isOperating(d)) : []),
    [from, to, rangeValid, calendar],
  );

  /* ------------------------------------------------- refusal distribution */

  const refusalSeries = useMemo(() => {
    const rows = (trends.data?.obs ?? []).filter((o) => {
      if (breederPenIds.has(o.pen_id)) return false; // breeder pens have no refusal score
      if (treatmentFilter === "all") return true;
      return treatmentByPen.get(o.pen_id) === treatmentFilter;
    });
    const retentionFor = makeRetention(
      retentionContext(
        controlFeedId,
        (trends.data?.controls ?? [])
          .filter((c) => c.feed_id === controlFeedId)
          .map((c) => ({ obs_date: c.obs_date, offered_g: Number(c.offered_g), remaining_g: c.remaining_g == null ? null : Number(c.remaining_g) })),
        calendar,
      ),
    );
    const banded = rows
      .map((o) => ({ o, b: observationBand(o, retentionFor) }))
      .filter((x) => x.b != null);
    const byScore = {} as Record<Band, { date: string; pens: number; visual: number }[]>;
    for (const band of BAND_ORDER) {
      byScore[band] = days.map((day) => {
        const hits = banded.filter((x) => x.o.obs_date === day && x.b!.band === band);
        return { date: day, pens: hits.length, visual: hits.filter((x) => x.b!.visual).length };
      });
    }
    return byScore;
  }, [trends.data?.obs, trends.data?.controls, controlFeedId, calendar, days, treatmentFilter, treatmentByPen, breederPenIds]);

  const refusalMax = useMemo(() => {
    let max = 0;
    for (const score of BAND_ORDER)
      for (const p of refusalSeries[score]) if (p.pens > max) max = p.pens;
    return Math.max(max, 1);
  }, [refusalSeries]);

  /* ------------------------------------------------ environment over time */

  const envDaily = useMemo(() => {
    const rows = trends.data?.welfare ?? []; // breeder pens included — same room
    return days.map((day) => {
      const forDay = rows.filter((w) => w.obs_date === day);
      const temps = forDay.map((w) => w.temp_c).filter((v): v is number => v != null);
      const hums = forDay.map((w) => w.humidity_pct).filter((v): v is number => v != null);
      const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
      return {
        date: day,
        label: shortDate(day),
        temp: mean(temps),
        hum: mean(hums),
        tempMin: temps.length ? Math.min(...temps) : null,
        tempMax: temps.length ? Math.max(...temps) : null,
        humMin: hums.length ? Math.min(...hums) : null,
        humMax: hums.length ? Math.max(...hums) : null,
      };
    });
  }, [trends.data?.welfare, days]);

  const weeks = useMemo(() => {
    const map = new Map<string, typeof envDaily>();
    for (const row of envDaily) {
      const key = weekStart(row.date);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([start, rows]) => {
        const temps = rows.flatMap((r) => (r.temp == null ? [] : [r.temp]));
        const hums = rows.flatMap((r) => (r.hum == null ? [] : [r.hum]));
        const tMins = rows.flatMap((r) => (r.tempMin == null ? [] : [r.tempMin]));
        const tMaxs = rows.flatMap((r) => (r.tempMax == null ? [] : [r.tempMax]));
        const hMins = rows.flatMap((r) => (r.humMin == null ? [] : [r.humMin]));
        const hMaxs = rows.flatMap((r) => (r.humMax == null ? [] : [r.humMax]));
        const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
        return {
          start,
          tMin: tMins.length ? Math.min(...tMins) : null,
          tMean: mean(temps),
          tMax: tMaxs.length ? Math.max(...tMaxs) : null,
          hMin: hMins.length ? Math.min(...hMins) : null,
          hMean: mean(hums),
          hMax: hMaxs.length ? Math.max(...hMaxs) : null,
          tempOutDays: rows.filter((r) => r.temp != null && (r.temp < TEMP_MIN || r.temp > TEMP_MAX)).length,
          humOutDays: rows.filter((r) => r.hum != null && (r.hum < HUM_MIN || r.hum > HUM_MAX)).length,
        };
      });
  }, [envDaily]);

  const num = (v: number | null, dp: number, unit: string) => (v == null ? "—" : `${roundOut(v, dp)}${unit}`);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Trends</h2>
        <p className="text-xs text-muted-foreground">
          A rolling window, independent of the date chosen above.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.currentTarget.value)}
              className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">To</span>
            <input
              type="date"
              value={to}
              max={today()}
              onChange={(e) => setTo(e.currentTarget.value)}
              className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => { setTo(today()); setFrom(addDays(today(), -13)); }}
            className="rounded-lg border border-input px-3 py-2 text-sm"
          >
            Last 14 days
          </button>
        </div>
      </div>

      {!rangeValid ? (
        <p className="text-sm text-destructive">The start date must come before the end date.</p>
      ) : trends.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* REFUSAL DISTRIBUTION */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Refusal distribution — how many pens at each level</h3>
                <p className="text-xs text-muted-foreground">
                  Portion tuning: <strong>Most left</strong> rising means cut portions.{" "}
                  <strong>None left</strong> rising means the snails may be feed-limited. Breeder pens are
                  not included — they have no refusal score. All five charts share the same scale.
                </p>
              </div>
              <label className="block">
                <span className="text-xs text-muted-foreground">Feed arm</span>
                <select
                  value={treatmentFilter}
                  onChange={(e) => setTreatmentFilter(e.currentTarget.value)}
                  className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  <option value="all">All treatments</option>
                  {treatments.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {BAND_ORDER.map((score) => (
                <div key={score} className="rounded-xl border border-border p-2">
                  <div className="text-xs font-semibold">{BAND_LABEL[score]}</div>
                  <div className="mb-1 text-[10px] leading-tight text-muted-foreground">
                    {BAND_MEANING[score]}
                  </div>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={refusalSeries[score]} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={shortDate}
                          tick={{ fontSize: 9 }}
                          interval="preserveStartEnd"
                          minTickGap={16}
                        />
                        <YAxis
                          domain={[0, refusalMax]}
                          allowDecimals={false}
                          tick={{ fontSize: 9 }}
                          width={34}
                          label={{ value: "pens", angle: -90, position: "insideLeft", fontSize: 9 }}
                        />
                        <Tooltip
                          labelFormatter={(v) => shortDate(String(v))}
                          formatter={(v, _n, item) => {
                            const visual = (item?.payload as { visual?: number } | undefined)?.visual ?? 0;
                            return [`${v} pens${visual ? ` (${visual} visual estimate)` : ""}`, BAND_LABEL[score]];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="pens"
                          stroke="var(--color-primary)"
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TEMPERATURE AND HUMIDITY */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Temperature and humidity</h3>
              <p className="text-xs text-muted-foreground">
                Every pen in the room, breeder pens included. Target bands 25–30 °C and 70–95 % are shaded.
              </p>
            </div>

            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={envDaily} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} minTickGap={16} />
                  <YAxis yAxisId="t" domain={[15, 40]} tick={{ fontSize: 10 }} width={38} />
                  <YAxis yAxisId="h" orientation="right" domain={[40, 100]} tick={{ fontSize: 10 }} width={38} />
                  <ReferenceArea yAxisId="t" y1={TEMP_MIN} y2={TEMP_MAX} fill="var(--color-primary)" fillOpacity={0.08} />
                  <ReferenceArea yAxisId="h" y1={HUM_MIN} y2={HUM_MAX} fill="var(--color-earth)" fillOpacity={0.08} />
                  <Tooltip
                    labelFormatter={(v) => shortDate(String(v))}
                    formatter={(v, name) =>
                      typeof v === "number"
                        ? [name === "Humidity" ? `${roundOut(v, 0)} %` : `${roundOut(v, 1)} °C`, String(name)]
                        : ["—", String(name)]
                    }
                  />
                  <Line yAxisId="t" name="Temperature" type="monotone" dataKey="temp" stroke="var(--color-primary)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                  <Line yAxisId="h" name="Humidity" type="monotone" dataKey="hum" stroke="var(--color-earth)" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-5 bg-primary" /> Daily mean temperature (left)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-5 bg-earth" /> Daily mean humidity (right)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-3">Week starting</th>
                    <th className="py-1.5 pr-3 text-right">Temp min</th>
                    <th className="py-1.5 pr-3 text-right">Temp mean</th>
                    <th className="py-1.5 pr-3 text-right">Temp max</th>
                    <th className="py-1.5 pr-3 text-right">Hum min</th>
                    <th className="py-1.5 pr-3 text-right">Hum mean</th>
                    <th className="py-1.5 pr-3 text-right">Hum max</th>
                    <th className="py-1.5 pr-3 text-right">Days off temp</th>
                    <th className="py-1.5 text-right">Days off humidity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {weeks.map((w) => (
                    <tr key={w.start}>
                      <td className="py-1.5 pr-3">{shortDate(w.start)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(w.tMin, 1, " °C")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(w.tMean, 1, " °C")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(w.tMax, 1, " °C")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(w.hMin, 0, " %")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(w.hMean, 0, " %")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{num(w.hMax, 0, " %")}</td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums ${w.tempOutDays > 0 ? "text-destructive" : ""}`}>{w.tempOutDays}</td>
                      <td className={`py-1.5 text-right tabular-nums ${w.humOutDays > 0 ? "text-destructive" : ""}`}>{w.humOutDays}</td>
                    </tr>
                  ))}
                  {weeks.length === 0 && (
                    <tr><td colSpan={9} className="py-2 text-muted-foreground">No readings in this window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
