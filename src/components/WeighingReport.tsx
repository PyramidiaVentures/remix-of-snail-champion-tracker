import { ArrowDown, ArrowUp } from "lucide-react";
import {
  computeMetrics, incompleteLabel, meanOf, EATEN_COVERAGE_MIN,
  type IntervalMetrics, type MetricsInput,
} from "@/lib/metrics";

type Row = {
  key: string;
  label: string;
  treatment: string;
  cur: IntervalMetrics | null;
  prev: IntervalMetrics | null;
  isMean?: boolean;
};

type Fig = { v: number | null; why?: string };

function growth(iv: IntervalMetrics) {
  return iv.meanWeight2 - iv.meanWeight1;
}
function growthPct(iv: IntervalMetrics) {
  return iv.meanWeight1 > 0 ? (growth(iv) / iv.meanWeight1) * 100 : null;
}
function eatenWhy(iv: IntervalMetrics): string | undefined {
  if (iv.feedingDays > 0 && (iv.leftoverCoverage ?? 0) < EATEN_COVERAGE_MIN) return incompleteLabel(iv.leftoverDays, iv.feedingDays);
  if (iv.gain_g == null || iv.gain_g <= 0) return "no weight gain in this interval";
  return undefined;
}

const COLUMNS: { label: string; dp: number; get: (iv: IntervalMetrics) => Fig; flag?: (v: number) => boolean; better?: "up" | "down" }[] = [
  { label: "Days since previous", dp: 0, get: (iv) => ({ v: iv.days }) },
  { label: "Weight/snail before (g)", dp: 2, get: (iv) => ({ v: iv.meanWeight1 }) },
  { label: "Weight/snail after (g)", dp: 2, get: (iv) => ({ v: iv.meanWeight2 }) },
  { label: "Growth/snail (g)", dp: 2, get: (iv) => ({ v: growth(iv) }) },
  { label: "Growth (%)", dp: 1, get: (iv) => ({ v: growthPct(iv) }) },
  { label: "SGR (%/day)", dp: 2, get: (iv) => ({ v: iv.sgr, why: iv.sgr == null ? "not calculable" : undefined }) },
  { label: "Survival (%)", dp: 1, get: (iv) => ({ v: iv.survival }) },
  { label: "Feed offered (g)", dp: 0, get: (iv) => ({ v: iv.offered_g }) },
  { label: "Feed eaten (g)", dp: 0, get: (iv) => ({ v: iv.leftoverDays > 0 ? iv.eaten_g : null, why: iv.leftoverDays > 0 ? undefined : "eaten not yet measured for this period" }) },
  { label: "FCR (feed eaten)", dp: 2, get: (iv) => ({ v: iv.eatenPerKgGain, why: iv.eatenPerKgGain == null ? eatenWhy(iv) : undefined }) },
  {
    label: "FCR (dry matter eaten)", dp: 2,
    get: (iv) => ({
      v: iv.eatenDmPerKgGain,
      why: iv.eatenDmPerKgGain != null ? undefined : iv.dmMissing ? "add dry-matter % in Setup" : eatenWhy(iv),
    }),
    flag: (v) => v < 1,
  },
  { label: "Feed offered per kg gain", dp: 2, get: (iv) => ({ v: iv.offeredPerKgGain, why: iv.offeredPerKgGain == null ? "no weight gain in this interval" : undefined }) },
];

function fmt(v: number, dp: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp });
}

function longDay(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Averages each field over pen intervals, as treatment figures elsewhere do. */
function meanInterval(ivs: IntervalMetrics[]): IntervalMetrics | null {
  if (ivs.length === 0) return null;
  const m = (f: (i: IntervalMetrics) => number | null) => meanOf(ivs.map(f));
  const allDm = ivs.every((i) => i.eatenDmPerKgGain != null);
  const allEaten = ivs.every((i) => i.eatenPerKgGain != null);
  return {
    ...ivs[0]!,
    days: m((i) => i.days) ?? 0,
    meanWeight1: m((i) => i.meanWeight1) ?? 0,
    meanWeight2: m((i) => i.meanWeight2) ?? 0,
    sgr: m((i) => i.sgr),
    survival: m((i) => i.survival),
    offered_g: m((i) => i.offered_g) ?? 0,
    eaten_g: m((i) => i.eaten_g) ?? 0,
    gain_g: m((i) => i.gain_g),
    feedingDays: ivs.reduce((s, i) => s + i.feedingDays, 0),
    leftoverDays: ivs.reduce((s, i) => s + i.leftoverDays, 0),
    leftoverCoverage: m((i) => i.leftoverCoverage),
    eatenPerKgGain: allEaten ? m((i) => i.eatenPerKgGain) : null,
    eatenDmPerKgGain: allDm ? m((i) => i.eatenDmPerKgGain) : null,
    dmMissing: ivs.some((i) => i.dmMissing),
    offeredPerKgGain: m((i) => i.offeredPerKgGain),
  };
}

export function WeighingReport({
  input, sessions, date, onPick,
}: {
  /** Full, unscoped metrics input for the trial — the same function Results uses. */
  input: MetricsInput | null;
  /** Closed weighing sessions at the site, newest first. */
  sessions: { session_date: string }[];
  date: string;
  onPick: (d: string) => void;
}) {
  const metrics = input ? computeMetrics(input) : null;
  const tLabel = new Map((input?.treatments ?? []).map((t) => [t.id, t.label]));

  const rows: Row[] = [];
  for (const t of metrics?.treatments ?? []) {
    const penRows: Row[] = [];
    for (const p of t.pens) {
      const cur = p.intervals.find((i) => i.to === date) ?? null;
      if (!cur) continue;
      const prev = p.intervals.find((i) => i.to === cur.from) ?? null;
      penRows.push({ key: p.penId, label: p.label, treatment: t.label, cur, prev });
    }
    if (penRows.length === 0) continue;
    rows.push(...penRows);
    const prevs = penRows.map((r) => r.prev).filter((x): x is IntervalMetrics => !!x);
    rows.push({
      key: `mean-${t.treatmentId}`,
      label: `${tLabel.get(t.treatmentId) ?? t.label} — mean`,
      treatment: t.label,
      cur: meanInterval(penRows.map((r) => r.cur!)),
      prev: prevs.length === penRows.length ? meanInterval(prevs) : null,
      isMean: true,
    });
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-card p-3 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Weighing of {longDay(date)}</h2>
        <select value={date} onChange={(e) => onPick(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-sm">
          {!sessions.some((s) => s.session_date === date) && <option value={date}>{longDay(date)} (not closed)</option>}
          {sessions.map((s) => <option key={s.session_date} value={s.session_date}>{longDay(s.session_date)}</option>)}
        </select>
      </div>
      {!metrics ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pen has a completed interval ending on this date.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3">Pen</th>
                <th className="py-1 pr-3">Treatment</th>
                {COLUMNS.map((c) => <th key={c.label} className="py-1 pr-3 whitespace-nowrap">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={`border-t border-border align-top ${r.isMean ? "bg-muted/50 font-semibold" : ""}`}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.label}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.treatment}</td>
                  {COLUMNS.map((c) => {
                    const f = r.cur ? c.get(r.cur) : { v: null };
                    const pv = r.prev ? c.get(r.prev).v : null;
                    const amber = f.v != null && c.flag?.(f.v);
                    return (
                      <td key={c.label} className={`py-1.5 pr-3 ${amber ? "bg-earth/20" : ""}`}>
                        {f.v == null ? (
                          <span className="text-muted-foreground">{f.why ?? "—"}</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums">
                            {fmt(f.v, c.dp)}
                            {pv != null && f.v !== pv && (f.v > pv
                              ? <ArrowUp className="h-3 w-3 text-muted-foreground" aria-label={`up from ${fmt(pv, c.dp)}`} />
                              : <ArrowDown className="h-3 w-3 text-muted-foreground" aria-label={`down from ${fmt(pv, c.dp)}`} />)}
                          </span>
                        )}
                        {amber && (
                          <div className="mt-0.5 max-w-[12rem] text-[10px] text-earth">
                            check: gain larger than dry food eaten (count, deaths, scale zero?)
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-muted-foreground">Arrows compare with the same pen's previous interval.</p>
        </div>
      )}
    </section>
  );
}
