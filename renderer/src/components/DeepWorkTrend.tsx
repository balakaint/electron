import { useEffect, useRef, useState } from 'react';
import { Trend, TrendDays, WeekSummary, projectsApi, tasksApi } from '../services/api';

function movingAvg(vals: number[], window = 7): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < vals.length; i++) {
    run += vals[i];
    if (i >= window) run -= vals[i - window];
    out.push(run / Math.min(i + 1, window));
  }
  return out;
}

function fmtHM(secs: number): string {
  return `${Math.floor(secs / 3600)}h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}m`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function fmtWeekday(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

// "How much" and "how many days on target" in one beat, matching
// legacy's _update_week_line — days-on-target is what actually changes
// behavior; total hours alone can be one heroic Tuesday.
function directionLabel(n: number, showAvg: boolean, secs: number[]): string {
  if (n < 14 || !showAvg) return '';
  const recent = secs.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const before = secs.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
  if (before <= 0) return '';
  if (recent > before * 1.05) return '↗ trending up';
  if (recent < before * 0.95) return '↘ trending down';
  return '→ holding steady';
}

// Three layers in deliberate order of visual weight, matching legacy's
// _draw_trend: dotted goal line (reference, quietest), raw daily line
// (pale — it's the noise), 7-day average (accent, thick — it's the
// signal, withheld until 3+ live days exist since two points can't
// support a claim about direction). Zero days get a red dot only while
// they're still the exception (<=50% of the window) — past that a dot
// on every gap stops meaning "here's the gap" and starts meaning
// "everything is bad," same reasoning as hiding the streak at zero.
export default function DeepWorkTrend() {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [trendDays, setTrendDaysState] = useState<TrendDays>(30);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    projectsApi.getTrendDays().then((r) => setTrendDaysState(r.trend_days));
    projectsApi.trend().then(setTrend);
    projectsApi.weekSummary().then(setWeek);
    projectsApi.deepStreak().then((r) => setStreak(r.streak_days));
    tasksApi.capacityInsight().then((r) => setInsight(r.insight));
  }, []);

  const changeTrendDays = (days: TrendDays) => {
    projectsApi.setTrendDays(days).then(() => {
      setTrendDaysState(days);
      projectsApi.trend().then(setTrend);
    });
  };

  if (!trend) return null;

  const { days, secs, goal } = trend;
  const n = secs.length;
  const liveCount = secs.filter((v) => v > 0).length;
  const showAvg = liveCount >= 3;
  const avg = movingAvg(secs);
  const topSecs = Math.max(goal, ...secs, 1) * 1.12;

  const W = 600;
  const H = 160;
  const x0 = 40;
  const x1 = W - 8;
  const y0 = 10;
  const y1 = H - 20;
  const px = (i: number) => x0 + (x1 - x0) * (n <= 1 ? 0 : i / (n - 1));
  const py = (v: number) => y1 - (y1 - y0) * Math.min(1, v / topSecs);

  const rawPts = secs.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const avgPts = avg.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const zeros = secs.map((v, i) => (v <= 0 ? i : -1)).filter((i) => i >= 0);
  const showZeros = zeros.length <= n * 0.5;
  const weekBandX = n > 7 ? px(Math.max(0, n - 7)) : x1;

  // Three x-axis ticks — first, middle, last — deduplicated, because on
  // a new install there may be only one or two days of data (the range
  // is clipped to the earliest day with any activity). At n=1 all three
  // expressions collapse to 0 and at n=2 two of them do, which produced
  // duplicate React keys AND drew the same date two or three times on
  // top of itself.
  const tickIndices = [...new Set([0, Math.floor(n / 2), n - 1])].sort((a, b) => a - b);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let closestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(px(i) - relX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    setHoverI(closest);
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 'bold' }}>
          Deep Work Trend
          {streak > 0 && <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 'normal', color: 'var(--accent)' }}>🔥 {streak}d streak</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([30, 90] as const).map((d) => (
            <button
              key={d}
              onClick={() => changeTrendDays(d)}
              disabled={trendDays === d}
              style={{ fontSize: 12, height: 24, padding: '0 10px' }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {week && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
          {week.has_data
            ? `This week: ${fmtHM(week.total_secs)} · ${week.hit_days} of 7 days on target · best ${
                week.best_day ? fmtWeekday(week.best_day) : ''
              } ${fmtHM(week.best_secs)}`
            : 'This week: nothing logged yet'}
        </div>
      )}

      {n < 2 ? (
        <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--text-faint)' }}>
          Start a project timer — today lands here
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            onMouseMove={onMove}
            onMouseLeave={() => setHoverI(null)}
          >
            {n > 7 && <rect x={weekBandX} y={y0} width={x1 - weekBandX} height={y1 - y0} fill="var(--accent)" opacity={0.06} />}

            <line x1={x0} y1={py(0)} x2={x1} y2={py(0)} stroke="var(--border)" />
            <text x={x0 - 4} y={py(0)} fontSize={9} fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">
              0
            </text>
            <line x1={x0} y1={py(goal)} x2={x1} y2={py(goal)} stroke="var(--border)" strokeDasharray="2,3" />
            <text x={x0 - 4} y={py(goal)} fontSize={9} fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">
              {fmtHM(goal)}
            </text>

            <polyline points={rawPts} fill="none" stroke="var(--accent)" strokeOpacity={0.3} strokeWidth={1} />

            {showZeros && zeros.map((i) => <circle key={i} cx={px(i)} cy={py(0)} r={1.5} fill="var(--danger)" />)}

            {showAvg ? (
              <polyline points={avgPts} fill="none" stroke="var(--accent)" strokeWidth={2} />
            ) : (
              <text x={(x0 + x1) / 2} y={y0 + (y1 - y0) * 0.3} fontSize={10} fill="var(--text-muted)" textAnchor="middle">
                trend line appears after {3 - liveCount} more day{3 - liveCount === 1 ? '' : 's'}
              </text>
            )}

            <circle cx={px(n - 1)} cy={py(secs[n - 1])} r={2.5} fill="var(--accent)" stroke="var(--surface)" />

            {tickIndices.map((i) => (
              <text
                key={i}
                x={px(i)}
                y={H - 4}
                fontSize={9}
                fill="var(--text-muted)"
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              >
                {fmtDate(days[i])}
              </text>
            ))}

            {hoverI !== null && (
              <>
                <line x1={px(hoverI)} y1={y0} x2={px(hoverI)} y2={y1} stroke="var(--text-muted)" strokeDasharray="2,2" />
                <circle cx={px(hoverI)} cy={py(secs[hoverI])} r={3} fill="var(--accent)" stroke="var(--surface)" />
              </>
            )}
          </svg>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', minHeight: 14 }}>
            {hoverI !== null ? `${fmtDate(days[hoverI])} · ${fmtHM(secs[hoverI])}` : directionLabel(n, showAvg, secs)}
          </div>
        </>
      )}

      {insight && <div style={{ fontSize: 12, marginTop: 8 }}>⚡ {insight}</div>}
    </div>
  );
}
