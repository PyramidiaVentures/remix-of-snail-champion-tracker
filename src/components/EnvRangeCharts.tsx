import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { roundOut } from "@/lib/metrics";

const TEMP_MIN = 25, TEMP_MAX = 30, HUM_MIN = 70, HUM_MAX = 95;
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export interface EnvDay { date: string; tempMin: number | null; tempMax: number | null; humMin: number | null; humMax: number | null; tempRange?: number[] | null; humRange?: number[] | null }

type WelfareRow = { obs_date: string; temp_c?: number | null; humidity_pct?: number | null; temp_min_c?: number | null; temp_max_c?: number | null; humidity_min_pct?: number | null; humidity_max_pct?: number | null };

/** Daily lowest/highest reading across every pen in the room. */
export function envDailyFrom(rows: WelfareRow[]): EnvDay[] {
  const days = [...new Set(rows.map((r) => r.obs_date))].sort();
  const lo = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.min(...v) : null; };
  const hi = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.max(...v) : null; };
  return days.map((date) => {
    const f = rows.filter((r) => r.obs_date === date);
    const tempMin = lo(f.map((w) => w.temp_min_c ?? w.temp_c)), tempMax = hi(f.map((w) => w.temp_max_c ?? w.temp_c));
    const humMin = lo(f.map((w) => w.humidity_min_pct ?? w.humidity_pct)), humMax = hi(f.map((w) => w.humidity_max_pct ?? w.humidity_pct));
    return { date, tempMin, tempMax, humMin, humMax,
      tempRange: tempMin != null && tempMax != null ? [tempMin, tempMax] : null,
      humRange: humMin != null && humMax != null ? [humMin, humMax] : null };
  }).filter((d) => d.tempMin != null || d.humMin != null || d.tempMax != null || d.humMax != null);
}

export function EnvRangeCharts({ data }: { data: EnvDay[] }) {
  return <>
            {([
              { title: "Temperature", unit: " °C", dp: 1, range: "tempRange", min: "tempMin", max: "tempMax", lo: TEMP_MIN, hi: TEMP_MAX, color: "var(--color-primary)" },
              { title: "Humidity", unit: " %", dp: 0, range: "humRange", min: "humMin", max: "humMax", lo: HUM_MIN, hi: HUM_MAX, color: "var(--color-earth)" },
            ] as const).map((c) => (
              <div key={c.title} className="space-y-1">
                <h4 className="text-xs font-semibold">{c.title} — daily minimum to maximum</h4>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={envDaily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10 }} minTickGap={16} />
                      <YAxis domain={[(m: number) => Math.floor(m - 2), (m: number) => Math.ceil(m + 2)]} allowDecimals={false} tickFormatter={(v: number) => String(Math.round(v))} tick={{ fontSize: 10 }} width={36} />
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
  </>;
}
