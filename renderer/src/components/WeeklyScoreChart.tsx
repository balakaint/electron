import { WeekScore } from '../services/api';

// Legacy's WEEKLY SCORE card (task_tracker_v3_THEMES.py 17145-17223): a
// bar per weekday, thresholded green/amber/red, with a thin line and
// round markers riding over the tops and the value printed above each
// non-zero bar. Legacy draws it with matplotlib when available and falls
// back to a hand-drawn canvas otherwise; this is one implementation of
// what both of those produce.
//
// The bars and the line carry the SAME series, which would normally be
// redundant encoding — here the bar answers "was this day good enough"
// via its color threshold, and the line answers "which way is the week
// going", which the bars alone read poorly for. That is legacy's reason
// for drawing both, and it holds.
//
// Colors come from the --habit-* tokens, not the app-wide status ones:
// this card lives on the Habits surface, which legacy paints from its
// own _VB palette (see themes.ts).

const W = 280;
const H = 120;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 14; // room for the value labels above the tallest bar
const PAD_B = 16; // room for the weekday labels
const Y_MAX = 115; // legacy's ax.set_ylim(0, 115) — 100 shouldn't touch the top

function barColor(pct: number): string {
  if (pct >= 70) return 'var(--habit-success)';
  if (pct >= 40) return 'var(--habit-warning)';
  return 'var(--habit-danger)';
}

export default function WeeklyScoreChart({ week, today }: { week: WeekScore[]; today: string }) {
  if (week.length === 0) return null;

  const plotH = H - PAD_T - PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const slot = plotW / week.length;
  const barW = slot * 0.6; // legacy's ax.bar(..., width=0.6)

  const x = (i: number) => PAD_L + slot * (i + 0.5);
  const y = (pct: number) => PAD_T + plotH * (1 - Math.min(pct, Y_MAX) / Y_MAX);

  const line = week.map((w, i) => `${x(i)},${y(w.pct)}`).join(' ');

  const vals = week.map((w) => w.pct);
  const best = Math.max(...vals);
  const worst = Math.min(...vals);

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)', fontWeight: 'bold', marginBottom: 4 }}>
        📊 WEEKLY SCORE
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Weekly habit score: ${week.map((w) => `${w.label} ${w.pct}%`).join(', ')}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Baseline only — legacy keeps the axis spines in the border
            color and no gridlines, so the marks stay the loudest thing. */}
        <line x1={PAD_L} y1={PAD_T + plotH} x2={W - PAD_R} y2={PAD_T + plotH} stroke="var(--border)" strokeWidth={1} />

        {week.map((w, i) => {
          const h = plotH * (Math.min(w.pct, Y_MAX) / Y_MAX);
          const isToday = w.day === today;
          return (
            <g key={w.day}>
              <title>{`${w.label} — ${w.pct}%`}</title>
              {/* Rounded data-end on the bar, squared at the baseline. */}
              <rect
                x={x(i) - barW / 2}
                y={PAD_T + plotH - h}
                width={barW}
                height={Math.max(h, w.pct > 0 ? 2 : 0)}
                rx={h > 4 ? 3 : 0}
                fill={barColor(w.pct)}
                opacity={isToday ? 1 : 0.55}
              />
              {w.pct > 0 && (
                <text
                  x={x(i)}
                  y={PAD_T + plotH - h - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {w.pct}
                </text>
              )}
              <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                {w.label}
              </text>
            </g>
          );
        })}

        <polyline points={line} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} />
        {week.map((w, i) => (
          // A 2px surface ring keeps a marker legible where it sits on
          // top of its own bar fill.
          <circle
            key={w.day}
            cx={x(i)}
            cy={y(w.pct)}
            r={3}
            fill="var(--text-muted)"
            stroke="var(--surface)"
            strokeWidth={1.5}
          />
        ))}
      </svg>

      <div style={{ display: 'flex', gap: 12, fontSize: 12, marginTop: 2 }}>
        <span style={{ color: 'var(--habit-success)' }}>◈ Best: {best}%</span>
        <span style={{ color: 'var(--habit-danger)' }}>📉 Worst: {worst}%</span>
      </div>
    </div>
  );
}
