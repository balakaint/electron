import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { ProjectOrderEntry, TodayProgress } from '../services/api';
import { PB_RAMPS, accentText, currentTheme, inkOn } from '../themes';

const H = 22;

// Legacy's _fmt_goal (task_tracker_v3_THEMES.py 7819-7833). Worth keeping
// its reasoning: this figure is the SUM of six per-project minute
// targets, so '%g' hours rendered 30+30+60+60+90+155 as "7.08333h" — six
// digits of false precision on a number chosen in 15-minute steps.
function fmtGoal(secs: number): string {
  const m = Math.round(secs / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h && mm) return `${h}h ${String(mm).padStart(2, '0')}m`;
  return h ? `${h}h` : `${mm}m`;
}

// Did this project get REAL time today, not just a tap? Legacy's
// _proj_meaningful (7896-7908): a quarter of the project's own target,
// floored at 5 minutes. Counting anything above zero seconds meant
// tapping play/pause on four projects reported "4/6 projects today" off
// eight minutes of total work.
function meaningful(secsToday: number, targetMinutes: number): boolean {
  return secsToday >= Math.max(300, targetMinutes * 60 * 0.25);
}

// Legacy paints this readout green >= 70, amber >= 40, else red
// (_update_progress_labels). The green stays; the amber and the red do
// not, and the reason is what moving the colour onto the numbers made
// visible: at 7:31am, 45 minutes into a 5h 15m day, the line rendered
// "0h 45m / 5h 15m" in alarm red. You are not behind at 7:31am — you
// have barely started, which is what the number already says. A scale
// that is red for most of every morning is a scale you learn to ignore,
// and then it is not there for you in the evening either.
//
// So: green only where it is news, default ink everywhere else. The
// exact percentage is one hover away in the title.
function pctColor(pct: number): string {
  return pct >= 70 ? 'var(--success)' : 'var(--text)';
}

export default function TodayProgressBar({
  entries,
  progress,
}: {
  entries: ProjectOrderEntry[];
  progress: TodayProgress;
}) {
  const named = entries.filter((e) => e.project.is_named);
  const workPct = progress.target_secs > 0 ? Math.min(progress.secs / progress.target_secs, 1) : 0;

  // Milestone glow: a 2s ring each time a quarter mark is crossed.
  // Keyed off the quarter INDEX, as legacy does, so re-renders inside
  // the same quarter don't retrigger it.
  const [glow, setGlow] = useState(false);
  const lastMilestone = useRef<number | null>(null);
  useEffect(() => {
    const m = Math.floor(workPct * 4);
    // The first render establishes a baseline instead of firing:
    // reopening the app at 80% should not celebrate three milestones.
    if (lastMilestone.current === null) {
      lastMilestone.current = m;
      return;
    }
    if (m > lastMilestone.current) {
      lastMilestone.current = m;
      setGlow(true);
      const id = setTimeout(() => setGlow(false), 2000);
      return () => clearTimeout(id);
    }
    lastMilestone.current = m;
  }, [workPct]);

  const complete = workPct >= 1;
  const pctInt = Math.round(workPct * 100);
  const minsDone = Math.floor(progress.secs / 60);
  const minsLeft = Math.max(0, Math.floor((progress.target_secs - progress.secs) / 60));
  const goalTxt = fmtGoal(progress.target_secs);
  const n = named.length;
  const touched = named.filter((e) => meaningful(e.project.secs_today, e.project.target_minutes)).length;

  // Ring drawn as an inset box-shadow rather than a border, so it can
  // appear and disappear without the 2px reflowing everything inside.
  const ring = complete
    ? 'inset 0 0 0 2px var(--progress-ring)'
    : glow
      ? 'inset 0 0 0 2px var(--success)'
      : undefined;

  const gradient = `linear-gradient(90deg, ${PB_RAMPS[currentTheme()].join(', ')})`;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)', fontWeight: 700 }}>TODAY PROGRESS</span>
        {/* The standalone "↻ 12%" is gone. This card was saying the same
            day four ways: a percentage, this time pair, the segmented
            bar, and "n/6 projects today" underneath. Three of those
            answer different questions — the bar says WHICH project got
            skipped, the pair says HOW MUCH time, the count says how many
            got real work (a stricter test than the bar's fill, see
            meaningful() above). The percentage was the bar's own fill
            and this pair's own ratio, written out a third time.
            Its one irreplaceable job was the green/amber/red signal, so
            that moved onto the numbers instead of being deleted with
            them. */}
        <span
          title={`${pctInt}% of today's goal`}
          style={{ fontSize: 12, color: pctColor(pctInt), fontWeight: 700 }}
        >
          {complete ? `${goalTxt} / ${goalTxt}` : `${Math.floor(minsDone / 60)}h ${minsDone % 60}m / ${goalTxt}`}
        </span>
      </div>

      <div
        role="img"
        aria-label={
          n > 0
            ? `Today progress: ${touched} of ${n} projects worked, ${pctInt}% of the daily goal`
            : `Today progress: ${pctInt}% of the daily goal`
        }
        style={{
          display: 'flex',
          gap: 4,
          height: H,
          background: 'var(--progress-track)',
          boxShadow: ring,
          overflow: 'hidden',
        }}
      >
        {n > 0 ? (
          // One segment per project rather than one long fill. Six hours
          // could be an hour on each of six projects or six on one — a
          // totals bar reads 100% either way, while "you haven't touched
          // four of them" is the answer you can act on this afternoon.
          // Legacy 7719-7772.
          named.map((e) => {
            const p = e.project;
            const tgt = p.target_minutes * 60;
            const f = tgt > 0 ? Math.min(1, p.secs_today / tgt) : 0;
            const untouched = p.secs_today <= 0;
            const running = p.running_since !== null;
            return (
              <div
                key={p.key}
                title={`${p.name || `Project ${e.number}`} — ${Math.round(p.secs_today / 60)}m / ${p.target_minutes}m`}
                style={{
                  position: 'relative',
                  flex: 1,
                  background: 'var(--progress-track)',
                  // An untouched project gets a dashed outline rather than
                  // just staying empty — otherwise "not started" and "no
                  // target set" look identical.
                  border: untouched ? `1px dashed ${p.accent_color}` : '1px solid transparent',
                  boxSizing: 'border-box',
                  // The running project gets a solid ring so you can see
                  // at a glance which clock is live.
                  outline: running ? '2px solid var(--progress-ring)' : undefined,
                  outlineOffset: -2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${f * 100}%`,
                    background: p.accent_color,
                  }}
                />
                {/* The number matches the badge on the project card, so
                    the eye can jump from "4 is empty" to the right card.
                    Anonymous segments answer only half the question.

                    Its colour is chosen against whatever is actually
                    UNDER it. A centred number sits on the fill once the
                    fill passes halfway and on the bare track before
                    that, and the old rule — white when full enough,
                    otherwise the raw accent — got both ends wrong: white
                    on a light theme's track measured 1.1:1, and the raw
                    accent on a dark theme's 2.6:1. */}
                <span
                  style={{
                    position: 'relative',
                    fontSize: 12,
                    fontWeight: 700,
                    color: f > 0.55 ? inkOn(p.accent_color) : accentText(p.accent_color, '--progress-track'),
                    lineHeight: 1,
                  }}
                >
                  {e.number}
                </span>
              </div>
            );
          })
        ) : (
          // No project named yet: legacy falls back to a gradient fill of
          // the whole bar (7785-7799). Its own comment calls for "thin
          // bands so it reads as a smooth ramp" — a CSS gradient is that
          // ramp directly, with no banding to interpolate away.
          <div style={{ width: `${workPct * 100}%`, background: gradient }} />
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        {complete ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontWeight: 700 }}>
            <Check size={13} /> {goalTxt.toUpperCase()} DEEP WORK COMPLETE!
          </span>
        ) : n > 0 ? (
          // Legacy swaps the "2h 14m left" readout for this on the
          // segmented path: which project got skipped is the better
          // question once the bar is already showing you the time.
          `${touched}/${n} projects today`
        ) : (
          `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m left`
        )}
      </div>
    </div>
  );
}
