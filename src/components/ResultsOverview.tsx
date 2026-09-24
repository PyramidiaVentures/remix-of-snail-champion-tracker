import { useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  compareBenchmark, computeMetrics, daysBetween, displayEaten, feedingShare, literatureWeight, meanOf, pickBenchmark,
  pooledFcr, portionChanges,
  type Benchmark, type BenchmarkVerdict, type FeedingShare, type IntervalMetrics, type MetricsInput, type makeRetention,
} from "@/lib/metrics";
import { liveCount, type PopulationEventLike } from "@/lib/liveCount";
import { penListLabel } from "@/lib/weighSchedule";

const TREATMENT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
const LIT = "var(--literature)";
const LIT_BAND = "var(--literature-band)";

function day(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const ms = (d: string) => Date.parse(`${d}T00:00:00`);
const f = (v: number, dp: number) => v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
const signed = (v: number, dp: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${f(Math.abs(v), dp)}`;

type Obs = { pen_id: string; feed_id: string | null; obs_date: string; offered_g: number | null; leftover_g?: number | null; refusal_score?: string | null };

export interface ResultsOverviewProps {
  siteId: string | null;
  input: MetricsInput | null;
  sessions: { session_date: string }[];
  date: string;
  onPick: (d: string) => void;
  benchmarks: Benchmark[];
  population: PopulationEventLike[];
  pens: { id: string; initial_snail_count: number }[];
  observations: Obs[];
  retentionFor: ReturnType<typeof makeRetention>;
  isOperating: (d: string) => boolean;
  nextWeighing: string | null;
}

export function ResultsOverview(p: ResultsOverviewProps) {
  const metrics = useMemo(() => (p.input ? computeMetrics(p.input) : null), [p.input]);
  // Colours are fixed by treatment order in the trial, never by a filter.
  const treatments = useMemo(
    () => [...(p.input?.treatments ?? [])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [p.input?.treatments],
  );
  const colorOf = (id: string) => TREATMENT_COLORS[Math.max(0, treatments.findIndex((t) => t.id === id)) % TREATMENT_COLORS.length]!;
  const sgrB = pickBenchmark(p.benchmarks, "sgr", p.siteId);
  const bfcrB = pickBenchmark(p.benchmarks, "bfcr_dm", p.siteId);

  const groups = useMemo(() => {
    return (metrics?.treatments ?? [])
      .map((t) => {
        const rows = t.pens
          .map((pen) => ({ pen, iv: pen.intervals.find((i) => i.to === p.date) ?? null }))
          .filter((r): r is { pen: typeof r.pen; iv: IntervalMetrics } => !!r.iv)
          .sort((a, b) => a.pen.label.localeCompare(b.pen.label, undefined, { numeric: true }));
        return { t, rows, pooled: pooledFcr(rows.map((r) => r.iv)), sgr: meanOf(rows.map((r) => r.iv.sgr)) };
      })
      .filter((g) => g.rows.length > 0);
  }, [metrics, p.date]);

  const allRows = groups.flatMap((g) => g.rows);
  const from = allRows.map((r) => r.iv.from).sort()[0];
  const days = from ? daysBetween(from, p.date) : null;
  const treatmentNames = groups.map((g) => g.t.label).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <select
          value={p.date}
          onChange={(e) => p.onPick(e.target.value)}
          aria-label="Weighing"
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
        >
          {p.date && !p.sessions.some((s) => s.session_date === p.date) && <option value={p.date}>Weighing of {day(p.date)} (not closed)</option>}
          {p.sessions.map((s) => <option key={s.session_date} value={s.session_date}>Weighing of {day(s.session_date)}</option>)}
        </select>
        {from && (
          <span className="text-xs text-muted-foreground">
            {day(from)} → {day(p.date)} · {days} days · {penListLabel(allRows.map((r) => r.pen.label))} · {treatmentNames}
          </span>
        )}
      </div>

      {!p.date ? (
        <Card><p className="text-sm text-muted-foreground">No closed weighing at this site yet.</p></Card>
      ) : !metrics ? (
        <Card><p className="text-sm text-muted-foreground">Loading…</p></Card>
      ) : groups.length === 0 ? (
        <Card><p className="text-sm text-muted-foreground">No pen has a completed interval ending on {day(p.date)}.</p></Card>
      ) : (
        <>
          <Card title="At a glance">
            <div className="space-y-4">
              {groups.map((g) => (
                <div key={g.t.treatmentId}>
                  <p className="mb-2 text-xs text-muted-foreground">
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorOf(g.t.treatmentId) }} />
                    {g.t.label} · {g.rows.length} pens · all feed ÷ all gain
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Tile
                      value={g.pooled.economicFcr} dp={1} name="Economic FCR" sub="g feed offered per g gained"
                      why={g.pooled.gain_g != null && g.pooled.gain_g <= 0 ? "no weight gain" : null}
                      verdict={<Verdict v="none" />}
                    />
                    <Tile
                      value={g.pooled.biologicalFcr} dp={1} name="Biological FCR" sub="g feed eaten per g gained"
                      why={g.pooled.biologicalWhy ? `Starts once leftovers are weighed · ${g.pooled.biologicalWhy}` : null}
                      verdict={bfcrB
                        ? <Verdict v={compareBenchmark(g.pooled.biologicalFcrDm, bfcrB, true)} b={bfcrB} lowerIsBetter hint={`literature ${f(bfcrB.low, 1)}–${f(bfcrB.high, 1)} (dry matter)`} />
                        : <Verdict v="none" />}
                    />
                    <Tile
                      value={g.sgr} dp={2} pct name="SGR" sub="% body weight gained per day"
                      verdict={<Verdict v={compareBenchmark(g.sgr, sgrB, false)} b={sgrB} />}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Growth" sub={`Weight per snail, ${day(from!)} → ${day(p.date)}`}>
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="w-[14%] py-1 pr-1">Pen</th>
                  <th className="w-[10%] py-1 pr-1 text-right">Snails</th>
                  <th className="w-[22%] py-1 pr-1 text-right">Weight / snail (g)</th>
                  <th className="w-[13%] py-1 pr-1 text-right">Growth / day (g)</th>
                  <th className="w-[12%] py-1 pr-1 text-right">Growth</th>
                  <th className="w-[11%] py-1 pr-1 text-right">SGR %/day</th>
                  <th className="w-[18%] py-1 pl-1"><span className="sr-only">Flag</span></th>
                </tr>
              </thead>
              {groups.map((g) => {
                const w1 = meanOf(g.rows.map((r) => r.iv.meanWeight1))!;
                const w2 = meanOf(g.rows.map((r) => r.iv.meanWeight2))!;
                return (
                  <tbody key={g.t.treatmentId}>
                    {groups.length > 1 && <tr><td colSpan={7} className="pt-2 font-medium">{g.t.label}</td></tr>}
                    {g.rows.map(({ pen, iv }) => {
                      const pct = iv.meanWeight1 > 0 ? (iv.growthPerSnail_g / iv.meanWeight1) * 100 : null;
                      const penRow = p.pens.find((x) => x.id === pen.penId);
                      const expected = penRow ? liveCount(penRow, p.population, iv.to) : null;
                      const countOff = expected != null && expected !== iv.survivingCount;
                      const flag = iv.growthPerSnail_g < 0
                        ? <span className="text-earth">▼ lost weight</span>
                        : (pct != null && pct > 15) || countOff
                          ? <span className="text-earth" title={countOff ? `Death log says ${expected} snails` : "Growth above 15% in one interval"}>⚠ check</span>
                          : null;
                      return (
                        <tr key={pen.penId} className="border-t border-border">
                          <td className="py-1.5 pr-1 font-medium break-words">{pen.label}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{iv.survivingCount}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{f(iv.meanWeight1, 1)} → {f(iv.meanWeight2, 1)}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{signed(iv.growthPerSnailPerDay_g, 2)}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{pct == null ? "—" : `${signed(pct, 1)}%`}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{iv.sgr == null ? "—" : f(iv.sgr, 2)}</td>
                          <td className="py-1.5 pl-1 text-[11px] font-medium">{flag}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-muted/60 font-semibold">
                      <td className="py-1.5 pr-1">Average</td>
                      <td />
                      <td className="py-1.5 pr-1 text-right tabular-nums">{f(w1, 1)} → {f(w2, 1)}</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{signed(meanOf(g.rows.map((r) => r.iv.growthPerSnailPerDay_g))!, 2)}</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{signed(((w2 - w1) / w1) * 100, 1)}%</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{g.sgr == null ? "—" : f(g.sgr, 2)}</td>
                      <td />
                    </tr>
                  </tbody>
                );
              })}
            </table>
          </Card>

          <Card title="Feed" sub={`Per pen per day, ${day(from!)} → ${day(prevDay(p.date))} feedings`}>
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="w-[20%] py-1 pr-1">Pen</th>
                  <th className="w-[20%] py-1 pr-1 text-right">Offered / day (g)</th>
                  <th className="w-[20%] py-1 pr-1 text-right">Eaten / day (g)</th>
                  <th className="w-[20%] py-1 pr-1 text-right">Economic FCR</th>
                  <th className="w-[20%] py-1 text-right">Biological FCR</th>
                </tr>
              </thead>
              {groups.map((g) => {
                const allEaten = g.rows.every((r) => r.iv.leftoverDays > 0);
                return (
                  <tbody key={g.t.treatmentId}>
                    {groups.length > 1 && <tr><td colSpan={5} className="pt-2 font-medium">{g.t.label}</td></tr>}
                    {g.rows.map(({ pen, iv }) => {
                      const noGain = iv.gain_g == null || iv.gain_g <= 0;
                      return (
                        <tr key={pen.penId} className="border-t border-border">
                          <td className="py-1.5 pr-1 font-medium break-words">{pen.label}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{f(iv.offeredPerDay_g, 1)}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{iv.leftoverDays > 0 ? f(iv.eatenPerDay_g, 1) : <span className="text-muted-foreground">not weighed</span>}</td>
                          <td className="py-1.5 pr-1 text-right tabular-nums">{noGain ? <span className="text-muted-foreground">no gain</span> : f(iv.offeredPerKgGain!, 1)}</td>
                          <td className="py-1.5 text-right tabular-nums">{iv.eatenPerKgGain != null ? f(iv.eatenPerKgGain, 1) : noGain && iv.leftoverDays > 0 ? <span className="text-muted-foreground">no gain</span> : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border bg-muted/60 font-semibold">
                      <td className="py-1.5 pr-1">All {g.rows.length} pens</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{f(meanOf(g.rows.map((r) => r.iv.offeredPerDay_g))!, 1)}</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{allEaten ? f(meanOf(g.rows.map((r) => r.iv.eatenPerDay_g))!, 1) : "—"}</td>
                      <td className="py-1.5 pr-1 text-right tabular-nums">{g.pooled.economicFcr == null ? "—" : f(g.pooled.economicFcr, 1)}</td>
                      <td className="py-1.5 text-right tabular-nums">{g.pooled.biologicalFcr == null ? "—" : f(g.pooled.biologicalFcr, 1)}</td>
                    </tr>
                  </tbody>
                );
              })}
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Pens that lost weight have no FCR of their own, but their feed still counts in the total.
            </p>
          </Card>

          <WeightChart metrics={metrics} groups={groups} colorOf={colorOf} date={p.date} next={p.nextWeighing} b={sgrB} />
          <FcrChart kind="bio" metrics={metrics} groups={groups} colorOf={colorOf} date={p.date} next={p.nextWeighing} b={bfcrB} />
          <FcrChart kind="eco" metrics={metrics} groups={groups} colorOf={colorOf} date={p.date} next={p.nextWeighing} b={null} />
          <PortionsOverview
            treatments={groups.map((g) => ({ id: g.t.treatmentId, label: g.t.label, penIds: g.t.pens.map((x) => x.penId) }))}
            colorOf={colorOf}
            observations={p.observations}
            retentionFor={p.retentionFor}
            isOperating={p.isOperating}
            until={p.date}
          />
        </>
      )}
    </div>
  );
}

function prevDay(d: string) {
  return new Date(ms(d) - 86_400_000).toISOString().slice(0, 10);
}

function Card({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {sub && <p className="mb-2 text-xs text-muted-foreground">{sub}</p>}
      {title && !sub && <div className="mb-2" />}
      {children}
    </section>
  );
}

function Tile({ value, dp, pct, name, sub, why, verdict }: {
  value: number | null; dp: number; pct?: boolean; name: string; sub: string; why?: string | null; verdict: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-muted/60 p-3">
      {value == null ? (
        <div className="text-lg font-semibold text-muted-foreground">Not yet</div>
      ) : (
        <div className="text-3xl font-bold tabular-nums leading-none">{f(value, dp)}{pct && <span className="text-base">%</span>}</div>
      )}
      <div className="mt-1 text-xs font-semibold">{name}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
      {value == null && why && <div className="mt-1 text-[11px] text-muted-foreground">{why}</div>}
      <div className="mt-auto border-t border-border pt-1.5 text-[11px]">{verdict}</div>
    </div>
  );
}

function Verdict({ v, b, lowerIsBetter, hint }: { v: BenchmarkVerdict; b?: Benchmark | null; lowerIsBetter?: boolean; hint?: string }) {
  const range = b ? ` (${f(b.low, 2)}–${f(b.high, 2)})` : "";
  if (!b) return <span className="text-muted-foreground">No literature benchmark</span>;
  const title = `${b.citation} · ${b.species}`;
  if (v === "none") return <span className="text-muted-foreground" title={title}>{hint ?? `Literature${range}`}</span>;
  const map: Record<Exclude<BenchmarkVerdict, "none">, string> = {
    within: "✓ Within literature",
    better: "✓ Better than literature",
    worse: "▲ Above literature",
    below: "▼ Below literature",
    above: "▲ Above literature",
  };
  const good = v === "within" || v === "better" || (!lowerIsBetter && v === "above");
  return <span className={`font-semibold ${good ? "text-primary" : "text-earth"}`} title={title}>{map[v]}<span className="font-normal text-muted-foreground">{range}</span></span>;
}

function Legend({ items }: { items: { label: string; color: string; dash?: string }[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={i.color} strokeWidth="2" strokeDasharray={i.dash} /></svg>
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Source({ b, fallback }: { b: Benchmark | null; fallback: string }) {
  return (
    <p className="mt-2 text-[11px] text-muted-foreground">
      {b ? <>Literature: {b.species}, {b.diet}{b.snail_weight_range ? `, ${b.snail_weight_range}` : ""} ({b.url ? <a href={b.url} target="_blank" rel="noreferrer" className="underline">{b.citation}</a> : b.citation}).{b.notes ? ` ${b.notes}` : ""}</> : fallback}
    </p>
  );
}

type Metrics = ReturnType<typeof computeMetrics>;
type Group = { t: Metrics["treatments"][number]; rows: { pen: Metrics["pens"][number] }[] };

function ChartTip({ active, payload, label, b }: { active?: boolean; payload?: { name?: string; value?: unknown; color?: string; payload?: Record<string, unknown> }[]; label?: number | string; b?: Benchmark | null }) {
  if (!active || !payload?.length) return null;
  const when = typeof label === "number" ? day(new Date(label).toISOString().slice(0, 10)) : String(label ?? "");
  return (
    <div className="max-w-[16rem] rounded-lg border border-border bg-popover p-2 text-xs text-popover-foreground shadow">
      <div className="mb-1 font-medium">{when}</div>
      {payload.filter((x) => x.value != null && x.name !== "hidden").map((x, i) => {
        const v = x.value;
        const text = Array.isArray(v) ? `${f(Number(v[0]), 2)}–${f(Number(v[1]), 2)}` : typeof v === "number" ? f(v, 2) : String(v);
        const isBand = Array.isArray(v) || x.name?.startsWith("Literature");
        return (
          <div key={i}>
            <span style={{ color: x.color }}>{x.name}</span>: {text}
            {isBand && b && <div className="text-[10px] text-muted-foreground">{b.citation} · {b.species}</div>}
          </div>
        );
      })}
    </div>
  );
}

function WeightChart({ groups, colorOf, date, next, b }: { metrics?: Metrics; groups: Group[]; colorOf: (id: string) => string; date: string; next: string | null; b: Benchmark | null }) {
  const data = useMemo(() => {
    // Only the pens reported for this weighing, so the start matches the Growth table.
    const pens = groups.flatMap((g) => g.rows.map((r) => r.pen));
    const dates = Array.from(new Set(pens.flatMap((p) => p.weightSeries.map((w) => w.date)))).filter((d) => d <= date).sort();
    if (!dates.length) return { rows: [], start: null as string | null, w0: null as number | null };
    const start = dates[0]!;
    const w0 = meanOf(pens.map((p) => p.weightSeries.find((w) => w.date === start)?.meanWeight));
    const xs = [...dates];
    if (next && next > date) xs.push(next);
    const rows = xs.map((d) => {
      const row: Record<string, number | [number, number] | null> = { x: ms(d) };
      for (const g of groups) {
        row[g.t.treatmentId] = d <= date ? meanOf(g.rows.map((r) => r.pen).map((p) => p.weightSeries.find((w) => w.date === d)?.meanWeight)) : null;
      }
      if (b && w0 != null) {
        const n = daysBetween(start, d);
        row["lit"] = literatureWeight(w0, (b.low + b.high) / 2, n);
        row["band"] = [literatureWeight(w0, b.low, n), literatureWeight(w0, b.high, n)];
      }
      return row;
    });
    return { rows, start, w0 };
  }, [groups, date, next, b]);

  const ours = groups.map((g) => ({ g, v: data.rows.find((r) => r["x"] === ms(date))?.[g.t.treatmentId] as number | null }));
  const litAtDate = data.rows.find((r) => r["x"] === ms(date))?.["lit"] as number | undefined;

  return (
    <Card title="Weight per snail vs literature" sub="Average of the pens. Grey = what published growth rates predict from our starting weight.">
      <Legend items={[...groups.map((g) => ({ label: g.t.label, color: colorOf(g.t.treatmentId) })), ...(b ? [{ label: "Literature (dashed), grey band = range", color: LIT, dash: "4 3" }] : [])]} />
      <p className="mb-1 text-[11px] text-muted-foreground">
        {ours.map(({ g, v }) => v != null && <span key={g.t.treatmentId} className="mr-3">{g.t.label}: <b>{f(v, 1)} g</b></span>)}
        {litAtDate != null && <span>Literature: <b>{f(litAtDate, 1)} g</b> on {day(date)}</span>}
      </p>
      <div className="h-56">
        <ResponsiveContainer>
          <ComposedChart data={data.rows} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="x" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v) => day(new Date(v).toISOString().slice(0, 10))} ticks={data.rows.map((r) => r["x"] as number)} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} unit=" g" width={56} />
            <Tooltip content={<ChartTip b={b} />} />
            {b && <Area dataKey="band" name="Literature range (g)" stroke="none" fill={LIT_BAND} fillOpacity={0.8} isAnimationActive={false} />}
            {b && <Line dataKey="lit" name="Literature expected (g)" stroke={LIT} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
            {groups.map((g) => (
              <Line key={g.t.treatmentId} dataKey={g.t.treatmentId} name={g.t.label} stroke={colorOf(g.t.treatmentId)} strokeWidth={2} connectNulls dot={{ r: 3 }} isAnimationActive={false} />
            ))}
            {next && next > date && <ReferenceLine x={ms(next)} stroke={LIT} strokeDasharray="2 3" label={{ value: `next weighing ${day(next)}`, position: "insideTopRight", fontSize: 10, fill: LIT }} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Source b={b} fallback="No literature benchmark for SGR. Add one in Setup." />
    </Card>
  );
}

function FcrChart({ kind, metrics, groups, colorOf, date, next, b }: { kind: "bio" | "eco"; metrics: Metrics; groups: Group[]; colorOf: (id: string) => string; date: string; next: string | null; b: Benchmark | null }) {
  const { rows, any } = useMemo(() => {
    const ends = Array.from(new Set(groups.flatMap((g) => g.t.pens).flatMap((p) => p.intervals.map((i) => i.to)))).filter((d) => d <= date).sort();
    const xs = [...ends];
    if (next && next > date) xs.push(next);
    let any = false;
    const rows = xs.map((d) => {
      const row: Record<string, number | [number, number] | null> = { x: ms(d) };
      for (const { t } of groups) {
        const ivs = groups.find((g) => g.t.treatmentId === t.treatmentId)!.rows.map((r) => r.pen).map((p) => p.intervals.find((i) => i.to === d)).filter((i): i is IntervalMetrics => !!i);
        const pooled = ivs.length ? pooledFcr(ivs) : null;
        const v = pooled ? (kind === "bio" ? pooled.biologicalFcrDm : pooled.economicFcr) : null;
        if (v != null) any = true;
        row[t.treatmentId] = v;
      }
      if (b) row["band"] = [b.low, b.high];
      return row;
    });
    // A band needs width: pad a single date on both sides.
    return { rows, any };
  }, [groups, date, next, kind, b]);

  const title = kind === "bio" ? "Biological FCR (dry matter) per weighing" : "Economic FCR per weighing";
  const sub = kind === "bio" ? "Dry feed eaten per g gained. Lower is better." : "Feed offered per g gained. Lower is better.";
  const empty = kind === "bio" && !any
    ? `First point after the ${next ? day(next) : "next"} weighing: needs weighed leftovers`
    : kind === "eco" ? "No literature line: depends on how much you choose to offer" : null;

  return (
    <Card title={title} sub={sub}>
      <Legend items={groups.map(({ t }) => ({ label: t.label, color: colorOf(t.treatmentId) }))} />
      <div className="relative h-48">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="x" type="number" scale="time" domain={rows.length > 1 ? ["dataMin", "dataMax"] : ["dataMin - 86400000", "dataMax + 86400000"]} ticks={rows.map((r) => r["x"] as number)} tickFormatter={(v) => day(new Date(v).toISOString().slice(0, 10))} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={[0, (max: number) => Math.max(Math.ceil(max * 1.2), b ? Math.ceil(b.high * 1.4) : 5)]} width={40} />
            <Tooltip content={<ChartTip b={b} />} />
            {b && <Area dataKey="band" name={`Literature range ${f(b.low, 1)}–${f(b.high, 1)}`} stroke="none" fill={LIT_BAND} fillOpacity={0.9} isAnimationActive={false} />}
            {groups.map(({ t }) => (
              <Line key={t.treatmentId} dataKey={t.treatmentId} name={t.label} stroke={colorOf(t.treatmentId)} strokeWidth={2} connectNulls dot={{ r: 4, fill: colorOf(t.treatmentId) }} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
            <p className="text-center text-xs italic text-muted-foreground">{empty}</p>
          </div>
        )}
      </div>
      {kind === "bio"
        ? <Source b={b} fallback="No literature benchmark for Biological FCR (dry matter). Add one in Setup." />
        : <p className="mt-2 text-[11px] text-muted-foreground">Offered feed depends on the portion chosen, so there is no published comparison.</p>}
    </Card>
  );
}

function PortionsOverview({ treatments, colorOf, observations, retentionFor, isOperating, until }: {
  treatments: { id: string; label: string; penIds: string[] }[];
  colorOf: (id: string) => string;
  observations: Obs[];
  retentionFor: ReturnType<typeof makeRetention>;
  isOperating: (d: string) => boolean;
  until: string;
}) {
  const [pick, setPick] = useState<string>("");
  const t = treatments.find((x) => x.id === pick) ?? treatments[0];
  const color = t ? colorOf(t.id) : "var(--chart-1)";

  const rows = useMemo(() => {
    if (!t) return [];
    const byDate = new Map<string, FeedingShare[]>();
    for (const o of observations) {
      if (!t.penIds.includes(o.pen_id) || o.obs_date >= until || !isOperating(o.obs_date)) continue;
      const s = feedingShare(o, retentionFor);
      if (!s) continue;
      byDate.set(o.obs_date, [...(byDate.get(o.obs_date) ?? []), s]);
    }
    const dates = Array.from(byDate.keys()).sort();
    const series: FeedingShare[] = dates.map((d) => {
      const fs = byDate.get(d)!;
      return { obs_date: d, offered_g: meanOf(fs.map((x) => x.offered_g))!, eaten_g: null, shareLeft: null, visual: fs.some((x) => x.visual) };
    });
    const changes = new Map(portionChanges(series).map((c) => [c.date, c]));
    return dates.map((d, i) => {
      const fs = byDate.get(d)!;
      const offered = series[i]!.offered_g;
      const eaten = meanOf(fs.map(displayEaten));
      const visual = fs.every((x) => x.eaten_g == null) && eaten != null;
      const c = changes.get(d);
      return {
        x: d,
        offered,
        eatenWeighed: visual ? null : eaten,
        eatenVisual: visual ? eaten : null,
        gap: eaten != null ? [eaten, offered] as [number, number] : null,
        change: c ? offered : null,
        changeText: c ? `${f(c.previous_g, 0)} g → ${f(c.new_g, 0)} g (${c.change_pct > 0 ? "+" : "−"}${f(Math.abs(c.change_pct), 0)}%)` : null,
      };
    });
  }, [t, observations, retentionFor, isOperating, until]);

  // Join visual and weighed lines at the switch-over so the eaten line is continuous.
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!, b = rows[i]!;
    if (a.eatenVisual != null && b.eatenWeighed != null) a.eatenWeighed = a.eatenVisual;
  }

  return (
    <Card title="Portions: offered vs eaten" sub="Grams per pen per evening · shaded gap = left over · ○ = portion changed">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Legend items={[{ label: "Offered", color }, { label: "Eaten", color, dash: "5 3" }, { label: "Eaten (visual estimate)", color, dash: "1 3" }]} />
        {treatments.length > 1 && (
          <select value={t?.id} onChange={(e) => setPick(e.target.value)} aria-label="Treatment" className="rounded-md border border-border bg-background px-2 py-1 text-xs">
            {treatments.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        )}
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="x" tickFormatter={day} tick={{ fontSize: 10 }} minTickGap={16} />
            <YAxis tick={{ fontSize: 10 }} unit=" g" width={52} domain={[0, "auto"]} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0]!.payload as (typeof rows)[number];
                const eaten = r.eatenWeighed ?? r.eatenVisual;
                return (
                  <div className="rounded-lg border border-border bg-popover p-2 text-xs text-popover-foreground shadow">
                    <div className="mb-1 font-medium">{day(String(label))}</div>
                    <div>Offered: {f(r.offered, 1)} g</div>
                    <div>Eaten: {eaten == null ? "not recorded" : `${f(eaten, 1)} g${r.eatenVisual != null ? " (visual estimate)" : ""}`}</div>
                    {r.changeText && <div className="mt-1 font-medium">{r.changeText}</div>}
                  </div>
                );
              }}
            />
            <Area dataKey="gap" stroke="none" fill={color} fillOpacity={0.12} isAnimationActive={false} name="hidden" />
            <Line dataKey="offered" name="Offered" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="eatenWeighed" name="Eaten" stroke={color} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
            <Line dataKey="eatenVisual" name="Eaten (visual estimate)" stroke={color} strokeDasharray="1 3" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter dataKey="change" name="Portion changed" fill="var(--color-card)" stroke={color} strokeWidth={2} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Before 24 Sept "eaten" comes from the visual leftover score. From then on it is weighed and corrected for water loss. Closed days are left out.
      </p>
    </Card>
  );
}
