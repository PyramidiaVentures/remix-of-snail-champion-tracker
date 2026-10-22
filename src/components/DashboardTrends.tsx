import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  CartesianGrid,
  ComposedChart,
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
      const [obs, welfare, controls, trays] = await Promise.all([
        supabase
          .from("observations")
          .select("pen_id,feed_id,obs_date,offered_g,leftover_g,refusal_score")
          .eq("trial_id", trialId!)
          .gte("obs_date", from)
          .lte("obs_date", to),
        supabase
          .from("welfare_checks")
          .select("pen_id,obs_date,temp_c,humidity_pct,temp_min_c,temp_max_c,humidity_min_pct,humidity_max_pct")
          .eq("trial_id", trialId!)
          .gte("obs_date", from)
          .lte("obs_date", to),
        supabase
          .from("moisture_controls")
          .select("checked_on,obs_date,offered_g,remaining_g,feed_id")
          .eq("trial_id", trialId!),
        supabase.from("control_trays").select("*").eq("trial_id", trialId ?? ""),
      ]);
      return { obs: obs.data ?? [], welfare: welfare.data ?? [], controls: controls.data ?? [], trays: trays.data ?? [] };
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
        trends.data?.trays ?? [],
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
  }, [trends.data?.obs, trends.data?.controls, trends.data?.trays, controlFeedId, calendar, days, treatmentFilter, treatmentByPen, breederPenIds]);

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
      const tempMins = forDay.map((w) => w.temp_min_c ?? w.temp_c).filter((v): v is number => v != null);
      const tempMaxs = forDay.map((w) => w.temp_max_c ?? w.temp_c).filter((v): v is number => v != null);
      const humMins = forDay.map((w) => w.humidity_min_pct ?? w.humidity_pct).filter((v): v is number => v != null);
      const humMaxs = forDay.map((w) => w.humidity_max_pct ?? w.humidity_pct).filter((v): v is number => v != null);
      const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
      const tMin = tempMins.length ? Math.min(...tempMins) : null;
      const tMax = tempMaxs.length ? Math.max(...tempMaxs) : null;
      const hMin = humMins.length ? Math.min(...humMins) : null;
      const hMax = humMaxs.length ? Math.max(...humMaxs) : null;
      return {
        date: day,
        label: shortDate(day),
        temp: tMin != null && tMax != null ? mean([tMin, tMax]) : null,
        hum: hMin != null && hMax != null ? mean([hMin, hMax]) : null,
        tempMin: tMin,
        tempMax: tMax,
        humMin: hMin,
        humMax: hMax,
        tempRange: tMin != null && tMax != null ? [tMin, tMax] : null,
        humRange: hMin != null && hMax != null ? [hMin, hMax] : null,
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
          tempOutDays: rows.filter((r) => r.tempMin != null && r.tempMax != null && (r.tempMin < TEMP_MIN || r.tempMax > TEMP_MAX)).length,
          humOutDays: rows.filter((r) => r.humMin != null && r.humMax != null && (r.humMin < HUM_MIN || r.humMax > HUM_MAX)).length,
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
                <h3 className="text-sm font-semibold">Share left — how many pens in each band</h3>
                <p className="text-xs text-muted-foreground">
                  Leftover as a share of feed offered, from the weighed leftover (leaves corrected for
                  water loss). <strong>Over 50%</strong> rising means cut portions;{" "}
                  <strong>0–2%</strong> rising means the snails may be feed-limited. Days before leftovers were
                  weighed use the old visual score, shown as "visual estimate". Breeder pens are not included.
                  All six charts share the same scale.
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
                 Lowest and highest reading recorded each day, across pens. Every pen in the room, breeder pens included. Target bands 25–30 °C and 70–95 % are shaded.
              </p>
            </div>

            {([
              { title: "Temperature", unit: " °C", dp: 1, range: "tempRange", min: "tempMin", max: "tempMax", lo: TEMP_MIN, hi: TEMP_MAX, color: "var(--color-primary)" },
              { title: "Humidity", unit: " %", dp: 0, range: "humRange", min: "humMin", max: "humMax", lo: HUM_MIN, hi: HUM_MAX, color: "var(--color-earth)" },
            ] as const).map((c) => (
              <div key={c.title} className="space-y-1">
                <h4 className="text-xs font-semibold">{c.title} — daily minimum to maximum</h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={envDaily} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} minTickGap={16} />
                      <YAxis domain={[(m: number) => Math.floor(m - 2), (m: number) => Math.ceil(m + 2)]} allowDecimals={false} tick={{ fontSize: 10 }} width={44} />
                      <ReferenceArea y1={c.lo} y2={c.hi} fill="var(--color-muted-foreground)" fillOpacity={0.08} ifOverflow="extendDomain" />
                      <Tooltip
                        labelFormatter={(v) => shortDate(String(v))}
                        formatter={(v, name) =>
                          Array.isArray(v) ? [`${roundOut(Number(v[0]), c.dp)}–${roundOut(Number(v[1]), c.dp)}${c.unit}`, "Range"]
                            : typeof v === "number" ? [`${roundOut(v, c.dp)}${c.unit}`, String(name)] : ["—", String(name)]
                        }
                      />
                      <Area dataKey={c.range} name="Range" stroke="none" fill={c.color} fillOpacity={0.25} connectNulls isAnimationActive={false} />
                      <Line dataKey={c.max} name="Maximum" stroke={c.color} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
                      <Line dataKey={c.min} name="Minimum" stroke={c.color} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground">Solid line: daily maximum · dashed line: daily minimum · shaded band between them: the day's range · grey band: target {c.lo}–{c.hi}{c.unit}.</p>
              </div>
            ))}

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
