import { useEffect, useRef, useState } from 'react';
import {
  MindsetEntry,
  MorningEnergy,
  MorningMood,
  MorningSleep,
  MorningRitualTrend as TrendData,
  morningRitualApi,
} from '../services/api';
import { RADIUS } from '../spacing';
import RitualRing from './RitualRing';
import { EnergyIcon, MoodIcon, SleepIcon } from './RitualIcons';

// History/trend view for Morning Ritual — the "linked trend page"
// Zahid asked for, confirmed to mean a history view analogous to this
// app's existing DeepWorkTrend: which days it was done, the streak, and
// energy/mood over time. Deliberately simpler than DeepWorkTrend's chart
// (no rolling average, no month/30d/90d picker) — Morning Ritual is a
// single daily yes/no plus two 1-5 scales, not a continuous quantity, so
// a day-strip plus two sparklines says everything DeepWorkTrend's fuller
// chart machinery would say here, without the parts that machinery
// exists for and this data doesn't have (a numeric goal line, an hours
// total).
//
// Redesign (2026-09-15): the streak now sits inside a RitualRing badge
// (same shape the Discipline card and flow use, at 1.0 progress once
// there's a streak) instead of plain text, and each sparkline gets
// 1/5 endpoint labels so the line has a stated scale instead of
// floating with no y-axis reference.
//
// Second pass, same day (Zahid: "theam er sathe miss match"): `accent`
// is now always passed in as the theme's own `--accent` CSS variable
// (see MorningRitualPanel.tsx), not a fixed module hex — so this view
// matches the active theme instead of carrying its own fixed color, and
// no contrast-correction function is needed here since `--accent` is
// already the theme-authored, contrast-correct value.
//
// Third pass (2026-09-18, Zahid: combine daily check-in with energy/
// mood/sleep to free space for journal + sleep-pattern history): the
// day-strip and CombinedTrendChart now share one card instead of two,
// and the two RecentList cards (journal, wake-up time) got the freed
// vertical room — bigger padding, row dividers, larger text.
//
// Fourth pass, same day (Zahid: chart "more strong and space saving
// compact", blank day-strip cells "need transparent to see checked box
// easily"): CHART_H 120->76, line stroke 2->3, end/hover dots r 4->5,
// legend folded into the date-range row instead of its own line below.
// Not-yet-completed day cells are now transparent+bordered instead of
// a solid --progress-track fill, so the accent-filled completed days
// are the only solid color in the strip.
//
// Fifth pass, same day (Zahid: "i can see only one color in line
// graph"): not a rendering bug — Energy/Mood/Sleep are three
// independent pill-pickers in MorningRitualFlow's check-in (a day can
// have Energy set with Mood/Sleep left blank), and a lone non-null day
// with blank neighbors on both sides never formed a 2-point segment,
// so it drew nothing. Added a per-point "lone dot" so an isolated
// entry is visible, and legend swatches for a series with zero data in
// the whole range now dim to 40% opacity so "no line drawn" reads as
// "nothing logged for this yet" instead of "the chart is broken."
//
// Sixth pass (2026-09-18, Zahid: "cant see mood and sleep line graph"):
// the adjacency-only rule above still failed once a series was logged
// on non-consecutive days — two real entries a day apart drew as two
// lone dots, no line, since seriesGeometry required both neighbors
// filled. It now bridges any gap and connects all of a series' logged
// points in one segment, so a line appears as soon as 2+ entries exist
// anywhere in the range, not just on back-to-back days.

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// Energy/mood/sleep became categorical strings in the "Morning
// Activation" rebuild (2026-09-15) rather than a 1-5 scale, so a plain
// line chart needs each one turned into a rank first — no false interval
// scale between "Okay" and "Good", just low-to-high position.
const ENERGY_RANK: Record<MorningEnergy, number> = { LOW: 1, OKAY: 2, GOOD: 3, STRONG: 4 };
const MOOD_RANK: Record<MorningMood, number> = { LOW: 1, NEUTRAL: 2, GOOD: 3, POSITIVE: 4 };
const SLEEP_RANK: Record<MorningSleep, number> = { POOR: 1, OKAY: 2, GOOD: 3 };

// Combined Energy/Mood/Sleep line chart (2026-09-18, Zahid: 3 separate
// boxes "onek space nossto korse" — wasted too much space; then "modern
// look kore world class" — the dataviz skill's mark specs and hover
// layer applied below). Each series is normalized to its own 0-1 rank
// range before plotting, so all three share one y-axis meaningfully
// despite Energy/Mood having 4 levels and Sleep only 3. --chart-1/2/3
// (themes.ts) are a real 3-slot categorical palette — validated
// CVD-distinct in both light and dark surfaces, unlike --accent/
// --accent-2 which are the same hue family in most themes and were
// never meant to sit side by side as separate series.
const CHART_W = 600;
const CHART_H = 76;
// Vertical inset so a max/min-rank value (e.g. a "GOOD" sleep day) plots
// just inside the frame instead of flush against the top/bottom edge,
// where an end-dot or stroke can read as clipped against the card border.
const CHART_PAD_Y = 8;
const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];
// Energy/Mood/Sleep share one 0-1 rank scale, so identical days (e.g. all
// three logged "GOOD") land on the same pixel and the last-drawn series
// hides the other two. A small fixed per-series offset keeps coincident
// values as 3 tight parallel lines instead of 1 — exact values still live
// in the hover tooltip, this only nudges the drawn position.
const SERIES_JITTER = [-3, 0, 3];

type Pt = { x: number; y: number };

function seriesGeometry<T extends string>(values: (T | null)[], rank: Record<T, number>, maxRank: number, jitter: number) {
  const n = values.length;
  const plotH = CHART_H - CHART_PAD_Y * 2;
  const points: (Pt | null)[] = values.map((v, i) =>
    v === null ? null : { x: (i / (n - 1)) * CHART_W, y: CHART_PAD_Y + plotH - (rank[v] / maxRank) * plotH + jitter },
  );
  // Bridge gaps: connect logged points in order regardless of blank days
  // between them, so a habit only logged every few days still reads as a
  // trend line instead of scattered dots (Zahid, 2026-09-18: "cant see
  // mood and sleep line graph" — those were logged on non-consecutive
  // days, and the old adjacency-only rule drew nothing for them).
  const nonNull = points.filter((p): p is Pt => p !== null);
  const segments: Pt[][] = nonNull.length > 1 ? [nonNull] : [];
  return { segments, points };
}

function linePath(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

// Area wash under a segment — the series hue at ~10% opacity (mark
// spec), closed down to the chart baseline so it reads as a fill, not a
// second stroke.
function areaPath(pts: Pt[]): string {
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `M ${linePath(pts).replace(/ /g, ' L ')} L ${last.x},${CHART_H} L ${first.x},${CHART_H} Z`;
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function CombinedTrendChart({
  days,
  energy,
  mood,
  sleep,
}: {
  days: string[];
  energy: (MorningEnergy | null)[];
  mood: (MorningMood | null)[];
  sleep: (MorningSleep | null)[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hasData = [...energy, ...mood, ...sleep].some((v) => v !== null);
  if (!hasData) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: 8 }}>No data yet</div>
    );
  }

  const n = days.length;
  const series = [
    { key: 'energy' as const, label: 'Energy', ...seriesGeometry(energy, ENERGY_RANK, 4, SERIES_JITTER[0]), color: SERIES_COLORS[0], hasData: energy.some((v) => v !== null), Icon: EnergyIcon },
    { key: 'mood' as const, label: 'Mood', ...seriesGeometry(mood, MOOD_RANK, 4, SERIES_JITTER[1]), color: SERIES_COLORS[1], hasData: mood.some((v) => v !== null), Icon: MoodIcon },
    { key: 'sleep' as const, label: 'Sleep', ...seriesGeometry(sleep, SLEEP_RANK, 3, SERIES_JITTER[2]), color: SERIES_COLORS[2], hasData: sleep.some((v) => v !== null), Icon: SleepIcon },
  ];
  const raw = { energy, mood, sleep };

  const updateHover = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(frac * (n - 1)));
  };

  const hoverX = hoverIdx === null ? null : (hoverIdx / (n - 1)) * CHART_W;
  const tooltipLeftPct = hoverIdx === null ? 0 : Math.min(88, Math.max(12, (hoverIdx / (n - 1)) * 100));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: '100%', height: CHART_H, display: 'block', overflow: 'visible' }}
        onPointerMove={(e) => updateHover(e.clientX)}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Recessive gridlines — hairline, one step off the surface. */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            y1={CHART_H * f}
            x2={CHART_W}
            y2={CHART_H * f}
            stroke="var(--border)"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {series.map((s) => (
          <g key={s.key}>
            {s.segments.map((seg, i) => (
              <path key={`area-${i}`} d={areaPath(seg)} fill={s.color} opacity={0.1} stroke="none" />
            ))}
            {s.segments.map((seg, i) => (
              <polyline
                key={`line-${i}`}
                points={linePath(seg)}
                fill="none"
                stroke={s.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {/* Lone-point dot — segments only form with 2+ logged points, so
                a series with exactly one entry in the whole range (nothing
                to bridge to) still needs a visible marker. */}
            {s.segments.length === 0 &&
              s.points.map(
                (p, i) => p && <circle key={`lone-${i}`} cx={p.x} cy={p.y} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />,
              )}
            {/* End-dot — the one marker each line always carries, ringed
                in the surface color so it stays legible crossing another
                line (mark spec: marker >= 8px, 2px surface ring). */}
            {(() => {
              const lastSeg = s.segments[s.segments.length - 1];
              const end = lastSeg?.[lastSeg.length - 1];
              return (
                end && <circle cx={end.x} cy={end.y} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              );
            })()}
          </g>
        ))}

        {/* Hover crosshair + per-series highlight dots. */}
        {hoverX !== null && (
          <>
            <line x1={hoverX} y1={0} x2={hoverX} y2={CHART_H} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="2,3" />
            {series.map((s) => {
              const p = s.points[hoverIdx!];
              return (
                p && <circle key={s.key} cx={p.x} cy={p.y} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              );
            })}
          </>
        )}
      </svg>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(days[0])}</span>
        {/* Legend folded into the date row (2026-09-18: compact pass),
            now as icon chips (2026-09-18 redesign) — the same glyph
            check-in uses for this dimension, so the shape carries the
            identity and color is relief rather than the only channel. */}
        <div style={{ display: 'flex', gap: 8 }}>
          {series.map((s) => (
            <div
              key={s.key}
              title={s.hasData ? undefined : `No ${s.label.toLowerCase()} logged yet`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 9px',
                borderRadius: RADIUS.pill,
                background: 'var(--surface-2)',
                color: s.color,
                opacity: s.hasData ? 1 : 0.4,
              }}
            >
              <s.Icon size={11} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(days[days.length - 1])}</span>
      </div>

      {hoverIdx !== null && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: `${tooltipLeftPct}%`,
            transform: 'translate(-50%, -100%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.control,
            padding: '8px 12px',
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ color: 'var(--text-faint)', marginBottom: 4 }}>{fmtDate(days[hoverIdx])}</div>
          {series.map((s) => {
            const v = raw[s.key][hoverIdx];
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 2, background: s.color, borderRadius: RADIUS.pill, flex: 'none' }} />
                <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{ marginLeft: 'auto', paddingLeft: 12, fontWeight: 700, color: 'var(--text)' }}>
                  {v ? titleCase(v) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Day + text, newest first — the shape Mindset's own RECENT list uses,
// shared here between the journal ("Clear Your Mind") and wake-up-time
// histories (Zahid, 2026-09-18) rather than duplicating the same grid
// twice.
function RecentList({ title, entries, emptyText }: { title: string; entries: MindsetEntry[]; emptyText: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {entries.map((e, i) => (
            <div
              key={e.day}
              style={{
                display: 'grid',
                gridTemplateColumns: '72px 1fr',
                gap: 16,
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', paddingTop: 2 }}>{e.label}</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{e.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function MorningRitualTrend({ accent }: { accent: string }) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [trend, setTrend] = useState<TrendData | null>(null);

  useEffect(() => {
    morningRitualApi.trend(cursor.year, cursor.month).then(setTrend);
  }, [cursor.year, cursor.month]);

  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1;
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const shiftMonth = (delta: number) => {
    setCursor(({ year, month }) => {
      const total = year * 12 + (month - 1) + delta;
      return { year: Math.floor(total / 12), month: (total % 12) + 1 };
    });
  };

  if (!trend) return <div>Loading…</div>;

  const doneCount = trend.completed.filter(Boolean).length;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {trend.streak > 0 && (
          <RitualRing progress={1} size={40} stroke={3} accent={accent}>
            <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{trend.streak}</span>
          </RitualRing>
        )}
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16, margin: 0, color: accent }}>☀ Morning Ritual — History</h2>
          {trend.streak > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{trend.streak}-day streak</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => shiftMonth(-1)}
            title="Previous month"
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: RADIUS.control, color: 'var(--text)', cursor: 'pointer', padding: '4px 8px', fontSize: 13 }}
          >
            ←
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', minWidth: 108, textAlign: 'center' }}>
            {MONTH_NAMES[cursor.month - 1]} {cursor.year}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            title={isCurrentMonth ? "Can't view a future month" : 'Next month'}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: RADIUS.control,
              color: isCurrentMonth ? 'var(--text-faint)' : 'var(--text)',
              cursor: isCurrentMonth ? 'default' : 'pointer',
              padding: '4px 8px',
              fontSize: 13,
              opacity: isCurrentMonth ? 0.5 : 1,
            }}
          >
            →
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          {MONTH_NAMES[cursor.month - 1]} {cursor.year} · {doneCount} completed
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          {trend.days.map((d, i) => {
            // "Not here yet" (a day later than today, only possible on the
            // current month now that the strip spans the full calendar
            // month) should read differently from "skipped" — dashed and
            // faint instead of the same solid border a real missed day
            // gets (2026-09-18 redesign). Today gets a dot marker under
            // its cell so "where am I in the month" has an answer.
            const future = d > todayIso;
            const isToday = d === todayIso;
            return (
              <div key={d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div
                  title={`${d} — ${trend.completed[i] ? 'completed' : future ? 'upcoming' : 'not completed'}`}
                  style={{
                    width: '100%',
                    height: 24,
                    borderRadius: RADIUS.control,
                    background: trend.completed[i] ? accent : 'transparent',
                    border: trend.completed[i] ? 'none' : `1px ${future ? 'dashed' : 'solid'} var(--border)`,
                    opacity: future ? 0.45 : 1,
                  }}
                />
                <div style={{ width: 4, height: 4, borderRadius: RADIUS.pill, background: isToday ? accent : 'transparent' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
          <span>{fmtDate(trend.days[0])}</span>
          <span>{fmtDate(trend.days[trend.days.length - 1])}</span>
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Energy · Mood · Sleep</div>
        <CombinedTrendChart days={trend.days} energy={trend.energy} mood={trend.mood} sleep={trend.sleep_quality} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <RecentList title="Clear Your Mind — Recent" entries={trend.journal} emptyText="Nothing written yet." />
      </div>

      {/* Each entry's text is "Closed 11:42 PM → Woke 06:15 AM · slept
          6h 33m" when the prior night's Night Closure has a close time,
          or just the bare wake time otherwise — composed server-side
          (engine/morning_ritual.py's trend), not two separate fields,
          so this stays the same day/label/text shape RecentList
          already renders for the journal list above. */}
      <RecentList title="Sleep — Recent" entries={trend.wake_up_time} emptyText="Nothing logged yet." />
    </div>
  );
}
