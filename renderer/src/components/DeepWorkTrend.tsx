import { useEffect, useRef, useState } from 'react';
import { Trend, TrendDays, WeekSummary, projectsApi, tasksApi } from '../services/api';
import { RADIUS } from '../spacing';
import { useL } from '../i18n';

// Deep Work — three ranges, and the default is the one you are living in.
//
// MONTH is a calendar, not a window. Every other chart in this app slides
// a 30- or 90-day box backwards from today, which answers "which way am I
// going" and cannot answer the question this card is actually opened
// with: "where am I in this month, and how much have I got done in it?"
// A rolling window has no first of the month in it and no end in sight,
// so "21 days left" stays a number you have to trust rather than a thing
// you can see.
//
// The month view draws layers, each with exactly one job:
//
//   dark slots     days that have gone
//   outlined slot  today — running, not finished
//   light slots    days you still have
//   the line       what you actually did
//   the goal line  what you were aiming at
//
// Nothing is drawn twice. In particular the slots do NOT encode hours:
// their height is fixed and identical for every day, because the line
// already carries the hours, and a bar chart of the same numbers under
// the same line is the duplication this app keeps having to remove.
// The slots are the CALENDAR; the line is the PERFORMANCE.
//
// The slots are also deliberately neutral rather than accent-coloured:
// the accent belongs to the data, and a strip of accent squares under an
// accent line reads as a second series.
//
// 30d / 90d keep the rolling behaviour, including the 7-day average —
// which the month view does not draw, because actual + average + goal +
// slots + today divider in one small card is exactly the visual noise
// the month layout exists to avoid. The rolling views also answer the
// one thing a calendar month cannot: on the 1st, a month chart is a
// single dot, and 30d still shows the run you are continuing.

type Range = 'month' | 30 | 90;

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

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 28, 29, 30 or 31 — asked of the calendar, never hard-coded. Day 0 of
// the next month IS the last day of this one, which is also what makes
// leap Februaries correct without a rule about them.
function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

// "How much" and "how many days on target" in one beat, matching
// legacy's _update_week_line — days-on-target is what actually changes
// behavior; total hours alone can be one heroic Tuesday.
function directionLabel(n: number, showAvg: boolean, secs: number[]): string {
  if (n < 14 || !showAvg) return '';
  const recent = secs.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const before = secs.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
  if (before <= 0) return '';
  // No arrow glyphs: ↗ and ↘ describe motion across a left-to-right
  // axis, and this card's axis runs the other way.
  if (recent > before * 1.05) return 'trending up';
  if (recent < before * 0.95) return 'trending down';
  return 'holding steady';
}

export default function DeepWorkTrend() {
  const L = useL();
  const [range, setRange] = useState<Range>('month');
  const [trend, setTrend] = useState<Trend | null>(null);
  // The month is cut out of a 90-day fetch rather than given its own
  // endpoint: 90 days always contains the whole of the current month,
  // whatever the rolling setting happens to be, so the strip can never
  // lose its first day on the 31st of a 31-day month.
  const [long, setLong] = useState<Trend | null>(null);
  const [trendDays, setTrendDaysState] = useState<TrendDays>(30);
  const [week, setWeek] = useState<WeekSummary | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // The chart is drawn in a 600-wide viewBox and painted at whatever
  // width the panel happens to be — 530px in compact, far more in full.
  // Everything in it scales with that, TEXT INCLUDED, so labels written
  // at fontSize 9 were rendering at about 8 real pixels in the panel
  // this app spends most of its life in. Measuring the painted width is
  // the only way a viewBox-scaled label can be told to come out at a
  // fixed size, so the font sizes below are divided by the scale the
  // browser is actually applying.
  const [paintedW, setPaintedW] = useState(600);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      if (w > 0) setPaintedW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [trend, long, range]);

  useEffect(() => {
    projectsApi.getTrendDays().then((r) => setTrendDaysState(r.trend_days));
    projectsApi.trend().then(setTrend);
    projectsApi.trend(90).then(setLong);
    projectsApi.weekSummary().then(setWeek);
    projectsApi.deepStreak().then((r) => setStreak(r.streak_days));
    tasksApi.capacityInsight().then((r) => setInsight(r.insight));
  }, []);

  const changeTrendDays = (d: TrendDays) => {
    setRange(d);
    projectsApi.setTrendDays(d).then(() => {
      setTrendDaysState(d);
      projectsApi.trend().then(setTrend);
    });
  };

  const isMonth = range === 'month';
  const source = isMonth ? long : trend;
  if (!source) {
    // Fixed-height placeholder matching the loaded card's chrome — the
    // fetch used to resolve into a bare `return null`, so the whole
    // card (header, range picker, chart) popped in at once and shifted
    // whatever sat below it in the scroll column (ui-ux-audit verify
    // pass, 2026-09-22).
    return (
      <div
        className="card-elevated"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 12, marginBottom: 12, boxShadow: 'var(--shadow-sm)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{L('Deep Work', 'ডিপ ওয়ার্ক')}</div>
          <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
            {([['month', L('Month', 'মাস')], [30, L('30d', '৩০দি')], [90, L('90d', '৯০দি')]] as [Range, string][]).map(([r, label]) => (
              <button
                key={label}
                disabled
                className="btn-ghost"
                style={{ fontSize: 12, height: 24, padding: '0 8px' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 16, marginBottom: 8 }} />
        <div style={{ height: isMonth ? 176 : 160, borderRadius: RADIUS.control, background: 'var(--surface-2)', opacity: 0.5 }} />
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mDays = daysInMonth(today.getFullYear(), today.getMonth());
  const dayOfMonth = today.getDate();
  const monthName = today.toLocaleDateString(undefined, { month: 'long' });

  // ── The series the chart draws ─────────────────────────────────────
  // Month: one slot per calendar day, whether or not anything was ever
  // recorded on it. A day with no record is a zero — that is what it
  // means — but the SLOT exists regardless, because the month has that
  // day in it whatever the database remembers.
  let days: string[];
  let secs: number[];
  if (isMonth) {
    const byDay = new Map<string, number>();
    source.days.forEach((d, i) => byDay.set(d, source.secs[i]));
    days = [];
    secs = [];
    for (let d = 1; d <= mDays; d++) {
      const iso = isoOf(new Date(today.getFullYear(), today.getMonth(), d));
      days.push(iso);
      secs.push(byDay.get(iso) ?? 0);
    }
  } else {
    days = source.days;
    secs = source.secs;
  }
  const goal = source.goal;
  const n = secs.length;
  // Everything past today is the future and must not be drawn as a
  // result of any kind.
  const todayIdx = isMonth ? Math.min(dayOfMonth - 1, n - 1) : n - 1;

  const past = secs.slice(0, todayIdx + 1);
  const monthTotal = past.reduce((a, b) => a + b, 0);
  const monthOnTarget = past.filter((v) => v >= goal).length;
  const daysLeft = mDays - dayOfMonth;

  const liveCount = past.filter((v) => v > 0).length;
  const showAvg = !isMonth && liveCount >= 3;
  const avg = movingAvg(secs);
  const topSecs = Math.max(goal, ...past, 1) * 1.12;

  const W = 600;
  const H = isMonth ? 176 : 160;
  const fs = (real: number) => +(real * (W / Math.max(1, paintedW))).toFixed(2);
  // The gutter holds ONE character. The goal label sits INSIDE the plot,
  // above its own line, where no gutter can clip it.
  const x0 = Math.round(Math.max(16, fs(12) * 1.4));
  const x1 = W - 8;
  const y0 = 20;
  // The month view keeps a band under the axis for the day slots and
  // their sparse labels.
  const y1 = isMonth ? H - 44 : H - 26;

  // A calendar axis is BANDED, not linear: each day owns a slice of the
  // width and its point sits in the middle of that slice, so the line
  // and the slot beneath it line up. The rolling views keep the linear
  // mapping, where the points are samples rather than bands.
  const slotW = (x1 - x0) / n;

  // TIME RUNS RIGHT TO LEFT in this card: day 1 at the right edge, the
  // end of the month at the left, so the days you still have open out
  // ahead of the line instead of trailing behind it. Applied to all
  // three ranges rather than to the month alone, because one card with
  // one button row and two opposite time directions is worse than
  // either direction on its own.
  //
  // Everything below is written in ordinary left-to-right terms and
  // passed through `flip`, so the index maths stays readable and the
  // mirroring happens in exactly one place.
  const flip = (x: number) => x0 + x1 - x;
  const px = (i: number) =>
    flip(isMonth ? x0 + slotW * (i + 0.5) : x0 + (x1 - x0) * (n <= 1 ? 0 : i / (n - 1)));
  const py = (v: number) => y1 - (y1 - y0) * Math.min(1, v / topSecs);
  const todayX = flip(x0 + slotW * (todayIdx + 1));

  // In the month view the line STOPS at today. Running it on to the end
  // of the month would draw days you have not lived yet as days you
  // failed.
  const linePts = (isMonth ? past : secs).map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const avgPts = avg.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const areaSrc = isMonth ? past : avg;
  const areaEnd = isMonth ? todayIdx : n - 1;
  const area = `M ${px(0)},${py(0)} L ${areaSrc.map((v, i) => `${px(i)},${py(v)}`).join(' L ')} L ${px(areaEnd)},${py(0)} Z`;

  const zeros = past.map((v, i) => (v <= 0 ? i : -1)).filter((i) => i >= 0);
  const showZeros = !isMonth && zeros.length <= n * 0.5;
  // Mirrored, the most recent seven days are the LEFT-hand end.
  const weekBandX = !isMonth && n > 7 ? px(Math.max(0, n - 7)) : x0;

  // Sparse labels. Thirty-one numbers under a 505px card is a row of
  // digits nobody reads; 1 · 5 · 10 · 15 · 20 · 25 · last locates any
  // day by counting at most two slots.
  const tickIndices = isMonth
    ? [0, 4, 9, 14, 19, 24, n - 1].filter((i, idx, arr) => i >= 0 && i < n && arr.indexOf(i) === idx && (i === n - 1 || n - 1 - i > 2))
    : [...new Set([0, Math.floor(n / 2), n - 1])].sort((a, b) => a - b);

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
    // 12 below, the same as the clock card above it. Every card in this
    // column owns the gap UNDER itself and nothing owns a gap above, so
    // the spacing cannot be the sum of two decisions made in two files —
    // which is what it was: 16 here plus 24 on the review card made a
    // 40px trench between these two, against 12 everywhere else.
    <div
      className="card-elevated"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 12, marginBottom: 12, boxShadow: 'var(--shadow-sm)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {/* "Deep Work", not "Month Execution". The whole app calls this
              deep work — the trend, the streak, the targets, the card on
              EXECUTE — and naming this after the calendar would make the
              calendar the subject when it is the context. */}
          {L('Deep Work', 'ডিপ ওয়ার্ক')}
          {!isMonth && streak > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: 'var(--accent)' }}>
              · {streak}d streak
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
          {([['month', L('Month', 'মাস')], [30, L('30d', '৩০দি')], [90, L('90d', '৯০দি')]] as [Range, string][]).map(([r, label]) => {
            const on = range === r;
            return (
              // A range picker is a control, not content. Drawn as three
              // full buttons it put a bordered cluster at the same weight
              // as the card's own title, two inches from it, so the eye
              // had two things to land on and neither was the subject.
              // The unselected two recede to ghosts; only the current
              // range is drawn, which is also the only one carrying
              // information.
              <button
                key={label}
                onClick={() => (r === 'month' ? setRange('month') : changeTrendDays(r as TrendDays))}
                aria-pressed={on}
                title={r === 'month' ? 'This calendar month' : `The last ${r} days, rolling`}
                className={on ? undefined : 'btn-ghost'}
                style={{
                  fontSize: 12,
                  height: 24,
                  padding: '0 8px',
                  fontWeight: on ? 600 : 400,
                  background: on ? 'var(--accent-light)' : undefined,
                  borderColor: on ? 'var(--accent)' : undefined,
                  color: on ? 'var(--accent)' : undefined,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Where you are, then what you did — in that order, because the
          second only means something inside the first: "5h 27m" is a
          different fact on day 3 than on day 27. */}
      {isMonth ? (
        // ONE line, not two, and not all one weight.
        //
        // It was two lines of identical 12px muted text — the month
        // position on one, the total on the other — which is two lines
        // of chrome with no entry point: nothing in the card told the
        // eye where to land first. The hours are the achievement and
        // everything after them is the context they sit in, so the
        // hours lead in full-strength text and the rest recedes. The
        // month NAME is gone with the second line: the clock card
        // directly above already prints "September 9, 2026", and this
        // card does not need to say it again.
        //
        // Hovering a day replaces the line rather than adding one, so
        // the readout costs no height at all.
        <>
        {/* The month's three numbers get a row of their own, one tile
            each, instead of sharing a sentence: the total, how many of
            the days so far met the goal, and the streak. Read side by
            side they answer "how is this month going" before the chart
            has to. The sentence below keeps the day count and the hover
            readout. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, margin: '8px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{fmtHM(monthTotal)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L('this month', 'এই মাসে')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
              {monthOnTarget}
              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)' }}>/{todayIdx + 1}</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L(`days on ${fmtHM(goal)} goal`, `দিন ${fmtHM(goal)} লক্ষ্য পূরণ`)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{streak}d</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L('current streak', 'চলতি ধারা')}</span>
          </div>
        </div>
        <div style={{ fontSize: 12, marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {hoverI !== null && hoverI <= todayIdx ? (
            <>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtHM(secs[hoverI])}</span>
              <span style={{ color: 'var(--text-muted)' }}> on {fmtDate(days[hoverI])}</span>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--text-muted)' }}>
                {L(
                  `Day ${dayOfMonth} of ${mDays} · ${daysLeft} left · hover a day for its hours`,
                  `${mDays} দিনের ${dayOfMonth}তম দিন · ${daysLeft} দিন বাকি · কোনো দিনের ওপর মাউস রাখলে ঘণ্টা দেখাবে`,
                )}
              </span>
            </>
          )}
        </div>
        </>
      ) : (
        week && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {week.has_data
              ? `This week: ${fmtHM(week.total_secs)} · ${week.hit_days} of 7 days on target${
                  week.best_day ? ` · best ${fmtWeekday(week.best_day)} ${fmtHM(week.best_secs)}` : ''
                }`
              : 'This week: nothing logged yet'}
          </div>
        )
      )}

      {n < 2 ? (
        <div style={{ textAlign: 'center', padding: 24, fontSize: 12, color: 'var(--text-faint)' }}>
          Start a project timer — today lands here
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            role="img"
            aria-label={
              isMonth
                ? `Deep work in ${monthName}. Day ${dayOfMonth} of ${mDays}, ${daysLeft} left. ` +
                  `${fmtHM(monthTotal)} so far, ${monthOnTarget} days on target, goal ${fmtHM(goal)} a day.`
                : `Deep work, last ${n} days. Goal ${fmtHM(goal)} a day. ` +
                  `Best ${fmtHM(Math.max(...secs))}, today ${fmtHM(secs[n - 1])}.`
            }
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            onMouseMove={onMove}
            onMouseLeave={() => setHoverI(null)}
          >
            {!isMonth && n > 7 && (
              <>
                <rect x={x0} y={y0} width={weekBandX - x0} height={y1 - y0} fill="var(--accent)" opacity={0.06} />
                <text x={weekBandX - 3} y={y0 + fs(11)} fontSize={fs(12)} fill="var(--text-faint)" textAnchor="end">
                  this week
                </text>
              </>
            )}

            <line x1={x0} y1={py(0)} x2={x1} y2={py(0)} stroke="var(--border)" />
            {/* The zero label stays in the LEFT gutter. Which side a
                y-axis label sits on has nothing to do with which way
                time runs — and there are only 8 units of margin on the
                right, so moving it there would clip it. */}
            <text x={x0 - 4} y={py(0)} fontSize={fs(12)} fill="var(--text-muted)" textAnchor="end" dominantBaseline="middle">
              0
            </text>
            {/* The goal line runs the FULL width, past today and across
                the days not lived yet: the target does not stop applying
                on the 9th. */}
            <line x1={x0} y1={py(goal)} x2={x1} y2={py(goal)} stroke="var(--border)" strokeDasharray="2,3" />
            {/* The caption sits at the right-hand end, because that is
                where the month starts and where the eye enters the plot. */}
            <text x={x1 - 2} y={py(goal) - fs(4)} fontSize={fs(12)} fill="var(--text-muted)" textAnchor="end">
              {fmtHM(goal)} goal
            </text>

            <defs>
              <linearGradient id="dwt-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {isMonth ? (
              <>
                <path d={area} fill="url(#dwt-fill)" stroke="none" />
                <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth={2} />
                {/* One point per day lived: filled where the day met the
                    goal, hollow where it did not, so the count in the
                    tile above can be read straight off the line. Today
                    keeps its own marker below. */}
                {past.map((v, i) =>
                  i === todayIdx ? null : (
                    <circle
                      key={days[i]}
                      cx={px(i)}
                      cy={py(v)}
                      r={fs(3)}
                      fill={v >= goal ? 'var(--accent)' : 'var(--surface)'}
                      stroke="var(--accent)"
                      strokeWidth={fs(1.5)}
                    />
                  ),
                )}
              </>
            ) : (
              <>
                {/* A mixed colour rather than strokeOpacity. Measured
                    across the six themes: at 0.3 opacity this ran
                    1.55-2.07:1, under the 3:1 WCAG 1.4.11 asks of a
                    graphic that carries meaning; the 70% mix runs
                    3.07-5.68:1 and is still the quieter of the two lines
                    because the other is twice as thick. */}
                <polyline
                  points={linePts}
                  fill="none"
                  stroke="color-mix(in srgb, var(--accent) 70%, var(--surface))"
                  strokeWidth={1}
                />
                {showZeros && zeros.map((i) => <circle key={i} cx={px(i)} cy={py(0)} r={1.5} fill="var(--danger)" />)}
                {showAvg ? (
                  <>
                    <path d={area} fill="url(#dwt-fill)" stroke="none" />
                    <polyline points={avgPts} fill="none" stroke="var(--accent)" strokeWidth={2} />
                  </>
                ) : (
                  <text x={(x0 + x1) / 2} y={y0 + (y1 - y0) * 0.3} fontSize={fs(12)} fill="var(--text-muted)" textAnchor="middle">
                    trend line appears after {3 - liveCount} more day{3 - liveCount === 1 ? '' : 's'}
                  </text>
                )}
              </>
            )}

            <circle
              cx={px(todayIdx)}
              cy={py(secs[todayIdx])}
              r={isMonth ? fs(4.5) : 2.5}
              fill={isMonth ? 'var(--surface)' : 'var(--accent)'}
              stroke={isMonth ? 'var(--text)' : 'var(--surface)'}
              strokeWidth={isMonth ? fs(2) : 1}
            />

            {/* ── The month as a strip of days ────────────────────────
                Fixed height, every slot identical: this is the calendar,
                not a second copy of the hours. */}
            {isMonth && (
              <>
                {secs.map((v, i) => {
                  const gone = i < todayIdx;
                  const now = i === todayIdx;
                  return (
                    <rect
                      key={days[i]}
                      x={flip(x0 + slotW * (i + 1)) + 0.75}
                      y={y1 + 10}
                      width={Math.max(1, slotW - 1.5)}
                      height={9}
                      fill={
                        now
                          ? 'transparent'
                          : gone
                            ? 'color-mix(in srgb, var(--text) 42%, var(--surface))'
                            : 'var(--progress-track)'
                      }
                      // Today is outlined, never filled. A filled slot
                      // says the day is spent, and it is only 2pm.
                      stroke={now ? 'var(--text)' : 'none'}
                      strokeWidth={now ? 1.5 : 0}
                    >
                      <title>{`${days[i]} — ${gone || now ? fmtHM(v) : 'not yet'}`}</title>
                    </rect>
                  );
                })}
                {/* The boundary between what is spent and what is left.
                    This is the one thing the month view exists to make
                    visible, so it runs the full height. */}
                <line
                  x1={todayX}
                  y1={y0}
                  x2={todayX}
                  y2={y1 + 21}
                  stroke="var(--text)"
                  strokeWidth={1}
                  strokeDasharray="2,2"
                />
              </>
            )}

            {tickIndices.map((i) => (
              <text
                key={i}
                x={px(i)}
                y={H - 6}
                fontSize={fs(12)}
                fill="var(--text-muted)"
                textAnchor={i === 0 ? 'end' : i === n - 1 ? 'start' : 'middle'}
              >
                {isMonth ? i + 1 : fmtDate(days[i])}
              </text>
            ))}

            {hoverI !== null && hoverI <= todayIdx && (
              <>
                <line x1={px(hoverI)} y1={y0} x2={px(hoverI)} y2={y1} stroke="var(--text-muted)" strokeDasharray="2,2" />
                <circle cx={px(hoverI)} cy={py(secs[hoverI])} r={3} fill="var(--accent)" stroke="var(--surface)" />
              </>
            )}
          </svg>

          {/* A key earns its place only when two marks could be
              confused for each other. The rolling views draw two lines
              in one hue — pale daily, solid average — and without a key
              you cannot tell which is which. The month view draws ONE
              line, and a strip of light and dark squares under a label
              that already says "day 9 of 30 · 21 left"; there is nothing
              to disambiguate, so the row was 16px of restating the
              obvious. */}
          {!isMonth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-muted)', minHeight: 16 }}>
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                  <span
                    aria-hidden
                    style={{ width: 12, height: 2, background: 'color-mix(in srgb, var(--accent) 70%, var(--surface))' }}
                  />
                  each day
                </span>
                {showAvg && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                    <span aria-hidden style={{ width: 12, height: 2, background: 'var(--accent)' }} />
                    7-day average
                  </span>
                )}
              </>
            <span style={{ flex: 1, textAlign: 'right', minWidth: 0 }}>
              {hoverI !== null && hoverI <= todayIdx
                ? `${fmtDate(days[hoverI])} · ${fmtHM(secs[hoverI])}`
                : directionLabel(n, showAvg, secs)}
            </span>
          </div>
          )}
        </>
      )}

      {insight && (
        <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>·</span> {insight}
        </div>
      )}
    </div>
  );
}
