import { useEffect, useState } from 'react';
import { PHASE_LABELS_BN, useLang } from '../i18n';
import { Settings, settingsApi } from '../services/api';
import { RADIUS } from '../spacing';

type PhaseKey = 'morning' | 'work' | 'evening' | 'sleep';

// Matches legacy's _SEG_COLORS: a categorical palette independent of the
// theme's own accent (see themes.ts's per-theme --phase-* comment) — 4
// mutually distinct colors that still vary per theme, just not by the
// accent-derivation rule the rest of the app's tokens follow.
const PHASE_COLOR: Record<PhaseKey, string> = {
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

function formatHour(h: number): string {
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

const PHASE_ORDER: PhaseKey[] = ['morning', 'work', 'evening', 'sleep'];

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

export default function DayPhaseBars() {
  const lang = useLang();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    settingsApi.get().then(setSettings);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  if (!settings) return null;

  const bounds = phaseBounds(settings);
  const nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const progresses = PHASE_ORDER.map((key) => phaseProgress(key, bounds, nowH));
  const currentPhase = PHASE_ORDER.find((key, i) => progresses[i] > 0 && progresses[i] < 1) ?? null;

  return (
    <div style={{ marginTop: 8 }}>
      {PHASE_ORDER.map((key, i) => {
        const [startH, endH] = bounds[key];
        const pct = Math.round(progresses[i] * 100);
        // The active phase leads (thicker, glowing track, bold text);
        // the other three recede (2026-09-18 redesign, Zahid: all 4
        // bars read as equally weighted, so "where am I right now"
        // took reading every row instead of one glance).
        const isNow = key === currentPhase;
        return (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 8,
              padding: '4px 8px',
              marginLeft: -8,
              marginRight: -8,
              borderRadius: RADIUS.control,
              opacity: isNow ? 1 : 0.55,
              // Tint dropped 12%→7% (visual redesign pass, 2026-09-20):
              // the dot/left-border/bold-text already carry "this is the
              // active phase" — the wash on top of them read as more
              // saturated red/blue than the signal needed.
              background: isNow ? `color-mix(in srgb, ${PHASE_COLOR[key]} 7%, transparent)` : 'transparent',
              borderLeft: isNow ? `3px solid ${PHASE_COLOR[key]}` : '3px solid transparent',
            }}
          >
            <span
              style={{
                width: isNow ? 12 : 10,
                height: isNow ? 12 : 10,
                borderRadius: RADIUS.control,
                background: PHASE_COLOR[key],
                flexShrink: 0,
              }}
            />
            <span
              style={{
                width: 60,
                textAlign: 'left',
                fontSize: 12,
                fontWeight: isNow ? 700 : 600,
                color: isNow ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {lang === 'bn' ? PHASE_LABELS_BN[key] : PHASE_LABEL[key]}
            </span>
            <div
              style={{
                flex: 1,
                height: isNow ? 10 : 6,
                background: 'var(--border)',
                borderRadius: RADIUS.pill,
                overflow: 'hidden',
                boxShadow: isNow ? `0 0 0 3px color-mix(in srgb, ${PHASE_COLOR[key]} 12%, transparent)` : undefined,
              }}
            >
              <div style={{ width: `${pct}%`, height: '100%', background: PHASE_COLOR[key] }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
              {formatHour(startH)}–{formatHour(endH)}
            </span>
            <span style={{ fontSize: 12, color: isNow ? 'var(--text)' : 'var(--text-faint)', fontWeight: isNow ? 700 : 400, width: 32, textAlign: 'right' }}>
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
