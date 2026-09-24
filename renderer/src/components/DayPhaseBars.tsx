import { PHASE_LABELS_BN, useLang } from '../i18n';
import { Settings } from '../services/api';
import { RADIUS } from '../spacing';

export type PhaseKey = 'morning' | 'work' | 'evening' | 'sleep';

// Matches legacy's _SEG_COLORS: a categorical palette independent of the
// theme's own accent (see themes.ts's per-theme --phase-* comment) — 4
// mutually distinct colors that still vary per theme, just not by the
// accent-derivation rule the rest of the app's tokens follow.
export const PHASE_COLOR: Record<PhaseKey, string> = {
  sleep: 'var(--phase-sleep)',
  morning: 'var(--phase-morning)',
  work: 'var(--phase-work)',
  evening: 'var(--phase-evening)',
};

const PHASE_LABEL: Record<PhaseKey, string> = {
  sleep: 'Sleep',
  morning: 'Morning',
  work: 'Work',
  evening: 'Evening',
};

export function formatHour(h: number): string {
  h = ((h % 24) + 24) % 24;
  let hh = Math.trunc(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) {
    hh += 1;
    mm = 0;
  }
  const ap = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 || 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

// Each phase ends at the next occurrence of the FOLLOWING phase's start,
// not its raw number — matches legacy's _phase_bounds, which fixed a bug
// where sleep's end was hard-coded to morning+24 (only correct while
// sleep starts in the evening; setting "Sleep starts" to 00:00 produced
// a 29-hour phase that never filled).
function nextOccurrence(after: number, h: number): number {
  return h >= after ? h : h + 24;
}

export function phaseBounds(settings: Settings): Record<PhaseKey, [number, number]> {
  const ms = settings.phase_morning_start;
  const ws = settings.phase_work_start;
  const es = settings.phase_evening_start;
  const ss = settings.phase_sleep_start;
  return {
    morning: [ms, nextOccurrence(ms, ws)],
    work: [ws, nextOccurrence(ws, es)],
    evening: [es, nextOccurrence(es, ss)],
    sleep: [ss, nextOccurrence(ss, ms)],
  };
}

function phaseProgress(key: PhaseKey, bounds: Record<PhaseKey, [number, number]>, nowH: number): number {
  const [startH, endH] = bounds[key];
  const duration = endH - startH;
  if (duration <= 0) return 0;
  if (key === 'sleep') {
    const morningStart = bounds.morning[0];
    let elapsed: number;
    if (nowH >= startH) elapsed = nowH - startH;
    else if (nowH < morningStart) elapsed = 24 - startH + nowH;
    else elapsed = 0;
    return Math.max(0, Math.min(1, elapsed / duration));
  }
  if (nowH < startH) return 0;
  if (nowH >= endH) return 1;
  return (nowH - startH) / duration;
}

export const PHASE_ORDER: PhaseKey[] = ['morning', 'work', 'evening', 'sleep'];

// Which phase is "now", plus enough to draw a progress ring for it —
// ClockCard's TODAY ring (2026-09-18 redesign) needs the same fact this
// component already computes for its own bold/dim styling, so it's
// exposed here rather than recomputed from a second reading of
// Settings elsewhere.
export function currentPhaseInfo(
  settings: Settings,
  now: Date,
): { key: PhaseKey; label: string; color: string; progress: number; remainingHours: number } | null {
  const bounds = phaseBounds(settings);
  const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const progresses = PHASE_ORDER.map((key) => phaseProgress(key, bounds, nowH));
  const i = progresses.findIndex((p) => p > 0 && p < 1);
  if (i === -1) return null;
  const key = PHASE_ORDER[i];
  const [startH, endH] = bounds[key];
  const elapsed = progresses[i] * (endH - startH);
  return {
    key,
    label: PHASE_LABEL[key],
    color: PHASE_COLOR[key],
    progress: progresses[i],
    remainingHours: endH - startH - elapsed,
  };
}

// The day as ONE bar, not four. Each phase gets a segment as wide as
// its share of the 24 hours, starting from Morning, so the bar reads
// left to right the way the day does, and a single marker says where in
// it you are. Four separate full-width bars (the previous shape) drew a
// 3-hour Morning and an 8-hour Work at the same length, so the one
// thing a day-strip exists to show — how much of the day each part
// takes and how much is left — was the one thing it could not show.
export default function DayPhaseStrip({ settings, now }: { settings: Settings; now: Date }) {
  const lang = useLang();
  const bounds = phaseBounds(settings);
  const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const dayStart = bounds.morning[0];
  const markerPct = ((((nowH - dayStart) % 24) + 24) % 24) / 24 * 100;

  return (
    <div>
      <div style={{ position: 'relative', display: 'flex', gap: 2, height: 12 }}>
        {PHASE_ORDER.map((key) => {
          const [startH, endH] = bounds[key];
          const pct = Math.round(phaseProgress(key, bounds, nowH) * 100);
          return (
            <div
              key={key}
              style={{
                flex: `${Math.max(endH - startH, 0.01)} 1 0`,
                borderRadius: RADIUS.control,
                background: `color-mix(in srgb, ${PHASE_COLOR[key]} 16%, var(--surface))`,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${pct}%`, height: '100%', background: PHASE_COLOR[key] }} />
            </div>
          );
        })}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: `calc(${markerPct}% - 1px)`,
            top: -4,
            width: 2,
            height: 20,
            borderRadius: RADIUS.pill,
            background: 'var(--text)',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {PHASE_ORDER.map((key) => {
          const [startH, endH] = bounds[key];
          return (
            <div key={key} style={{ flex: `${Math.max(endH - startH, 0.01)} 1 0`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: PHASE_COLOR[key], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lang === 'bn' ? PHASE_LABELS_BN[key] : PHASE_LABEL[key]}
              </span>
              <span
                title={`${formatHour(startH)}–${formatHour(endH)}`}
                style={{ fontSize: 12, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {formatHour(startH)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
