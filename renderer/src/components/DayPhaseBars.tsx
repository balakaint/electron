import { useEffect, useState } from 'react';
import { PHASE_LABELS_BN, useLang } from '../i18n';
import { Settings, settingsApi } from '../services/api';

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
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: PHASE_COLOR[key],
                flexShrink: 0,
              }}
            />
            <span
              style={{
                width: 60,
                textAlign: 'left',
                fontSize: 12,
                fontWeight: 600,
                color: key === currentPhase ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {lang === 'bn' ? PHASE_LABELS_BN[key] : PHASE_LABEL[key]}
            </span>
            <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: PHASE_COLOR[key] }} />
            </div>
            <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'nowrap' }}>
              {formatHour(startH)}–{formatHour(endH)}
            </span>
            <span style={{ fontSize: 11, opacity: 0.6, width: 32, textAlign: 'right' }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}
