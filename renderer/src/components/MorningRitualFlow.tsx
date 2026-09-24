import { useEffect, useRef, useState } from 'react';
import {
  MorningEnergy,
  MorningIntention,
  MorningMood,
  MorningRitual,
  MorningSleep,
  MorningSpiritual,
  Task,
  morningRitualApi,
  tasksApi,
} from '../services/api';
import { RADIUS } from '../spacing';
import { Check } from 'lucide-react';
import RitualRing from './RitualRing';
import { useAutofocus } from '../hooks/useAutofocus';
import DoDontList from './DoDontList';
import breatheAudioUrl from '../assets/audio/breath.mp3';
import { useL } from '../i18n';
import { morningSteps } from '../ritualSteps';

// Redesigned 2026-09-19 to match Zahid's morning-activation.html sample
// 1:1 (structure, copy, section order, plain-pill/plain-button visual
// language — no icon chips, no ring timers) while staying wired to the
// real backend (see engine/morning_ritual.py) instead of the sample's
// localStorage. Two deliberate deviations from the sample, both agreed
// with Zahid beforehand:
//   - Reset's Breathe/Body Stretch/Sunlight keep their existing 60s/
//     180s/180s COUNTDOWN TIMERS (a 2026-09-18 addition the sample
//     doesn't have, which predates and survives this redesign) — only
//     their ring-shaped rendering is dropped for the sample's plain
//     button + text countdown.
//   - The "AI-suggested next action" in Clear Your Mind is wired to the
//     real (heuristic, not LLM) backend endpoint
//     engine.morning_ritual.suggest_action, same status quo as before.
const ACCENT = 'var(--accent)';
const BREAK_TIMER_SECS = 180;
const STRETCH_TIMER_SECS = 120;

const ENERGY_OPTIONS: { value: MorningEnergy; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'OKAY', label: 'Okay' },
  { value: 'GOOD', label: 'Good' },
  { value: 'STRONG', label: 'Strong' },
];
const MOOD_OPTIONS: { value: MorningMood; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NEUTRAL', label: 'Neutral' },
  { value: 'GOOD', label: 'Good' },
  { value: 'POSITIVE', label: 'Positive' },
];
const SLEEP_OPTIONS: { value: MorningSleep; label: string }[] = [
  { value: 'POOR', label: 'Poor' },
  { value: 'OKAY', label: 'Okay' },
  { value: 'GOOD', label: 'Good' },
];
const INTENTION_OPTIONS: MorningIntention[] = ['Focus', 'Patience', 'Discipline', 'Calm'];
const SPIRITUAL_OPTIONS: MorningSpiritual[] = ['OFF', 'Prayer', 'Dhikr', 'Quran', 'Meditation', 'Personal Reflection', 'Custom'];
const URGENCY_DOT: Record<Task['urgency'], string> = {
  low: 'var(--border)',
  med: 'var(--warning)',
  high: 'var(--danger)',
};
const MODE_COLOR: Record<string, string> = {
  standard: 'var(--accent)',
  gentle: 'var(--success)',
  fast: 'var(--warning)',
};

// Same five lines as the sample's own READING_LINES, day-of-year
// indexed so everyone sees the same line on the same day.
const READING_LINES = [
  'Small actions compound. Start with the smallest true one.',
  "You don't need the whole day figured out — just the next step.",
  'Discipline is choosing the action before the mood agrees.',
  'Clarity comes from motion, not more thinking.',
  'One honest action beats ten perfect plans.',
];
function dayOfYearIndex(): number {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  return dayOfYear % READING_LINES.length;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtKpi(secs: number | null): string {
  if (secs === null) return '—';
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return `${mins}m ${rem}s`;
}

function MicroLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', marginBottom: 8, ...style }}>
      {children}
    </div>
  );
}

function Pill<T extends string>({ label, active, onClick }: { value: T; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={active ? undefined : 'btn-ghost'}
      style={{
        fontSize: 12,
        padding: '4px 12px',
        borderRadius: RADIUS.pill,
        background: active ? 'var(--accent-light)' : undefined,
        borderColor: active ? ACCENT : undefined,
        color: active ? ACCENT : undefined,
        fontWeight: active ? 600 : undefined,
      }}
    >
      {label}
    </button>
  );
}

// One row on the RESET strip — plain name/sub-copy + a right-aligned
// action, colored left border per item, matching morning-activation
// .reset-item exactly (Zahid, 2026-09-19: drop the ring visual, keep
// the row layout).
function ResetRow({
  border,
  name,
  sub,
  dotClassName,
  right,
}: {
  border: string;
  name: string;
  sub: string;
  dotClassName?: string;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${border}`,
        borderRadius: RADIUS.card,
        padding: '8px 12px',
        background: 'var(--surface)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {dotClassName !== undefined && (
            <span
              className={dotClassName || undefined}
              style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: ACCENT, opacity: dotClassName ? undefined : 0.25, flex: 'none' }}
            />
          )}
          {name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>
      </div>
      {right}
    </div>
  );
}

function ResetButton({ label, onClick, disabled, done }: { label: React.ReactNode; onClick: () => void; disabled?: boolean; done?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={done}
      className={done ? undefined : 'btn-ghost'}
      style={{
        fontSize: 12,
        padding: '4px 12px',
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: done ? 'var(--accent-light)' : undefined,
        borderColor: done ? 'var(--success)' : undefined,
        color: done ? 'var(--success)' : undefined,
      }}
    >
      {label}
    </button>
  );
}

// One card inside the outer Morning Prime <details> — matches
// morning-activation's .prime-item, all five shown together once
// opened (not nested per-item details).
function PrimeItem({ border, name, children }: { border: string; name: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${border}`,
        borderRadius: RADIUS.card,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{name}</div>
      {children}
    </div>
  );
}

export default function MorningRitualFlow({ onViewTrend }: { onViewTrend?: () => void }) {
  const [ritual, setRitual] = useState<MorningRitual | null>(null);

  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [firstMoveDraft, setFirstMoveDraft] = useState('');
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [editingFirstMove, setEditingFirstMove] = useState(false);
  const outcomeInputRef = useAutofocus<HTMLInputElement>(editingOutcome);
  const firstMoveInputRef = useAutofocus<HTMLInputElement>(editingFirstMove);
  const [journalDraft, setJournalDraft] = useState('');
  const [journalTouched, setJournalTouched] = useState(false);
  const [gratitudeDraft, setGratitudeDraft] = useState('');
  const [wakeDraft, setWakeDraft] = useState('');
  const [suggestDraft, setSuggestDraft] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);

  const [sleepOpen, setSleepOpen] = useState(false);

  const [breatheSecs, setBreatheSecs] = useState(60);
  const [breatheRunning, setBreatheRunning] = useState(false);
  const breatheRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breatheAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio(breatheAudioUrl);
    a.loop = true;
    a.addEventListener('error', () => console.error('breathe audio load failed:', a.error));
    breatheAudio.current = a;
    return () => {
      a.pause();
    };
  }, []);

  const [sunSecs, setSunSecs] = useState(BREAK_TIMER_SECS);
  const [sunRunning, setSunRunning] = useState(false);
  const sunRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stretchSecs, setStretchSecs] = useState(STRETCH_TIMER_SECS);
  const [stretchRunning, setStretchRunning] = useState(false);
  const stretchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [medSecs, setMedSecs] = useState(90);
  const [medRunning, setMedRunning] = useState(false);
  const medRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [readingIdx, setReadingIdx] = useState(dayOfYearIndex());
  const readingMarkedRef = useRef(false);
  const visualizeMarkedRef = useRef(false);

  const [nudgeShown, setNudgeShown] = useState(false);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSectionRef = useRef<HTMLDivElement>(null);
  const startSectionRef = useRef<HTMLDivElement>(null);
  const resetSectionRef = useRef<HTMLDivElement>(null);

  const checkinSectionRef = useRef<HTMLDivElement>(null);
  const primeSectionRef = useRef<HTMLDetailsElement>(null);
  const L = useL();
  // A finished Reset collapses to one row of ticks; this reopens it.
  const [resetOpen, setResetOpen] = useState(false);
  // Whether the Ready card is on screen — the sticky Start bar only
  // shows while it is not, so the button never appears twice.
  const [startVisible, setStartVisible] = useState(false);
  const hasRitual = ritual !== null;
  useEffect(() => {
    const el = startSectionRef.current;
    if (!hasRitual || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStartVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [hasRitual]);

  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  useEffect(() => {
    tasksApi.list('focus').then((all) => {
      const pending = all
        .filter((t) => !t.done)
        .sort((a, b) => Number(b.strike) - Number(a.strike))
        .slice(0, 5);
      setPendingTasks(pending);
    });
  }, []);

  useEffect(() => {
    morningRitualApi.today().then((r) => {
      setRitual(r);
      setOutcomeDraft(r.today_outcome);
      setFirstMoveDraft(r.first_move);
      setJournalDraft(r.journal_text);
      setJournalTouched(r.journal_text.trim().length > 0);
      setGratitudeDraft(r.prime_gratitude);
      setWakeDraft(r.wake_up_time ?? '');
      if (r.sleep_quality || r.wake_up_time) setSleepOpen(true);
      if (r.reset_breathe) setBreatheSecs(0);
      if (r.reset_daylight) setSunSecs(0);
      if (r.reset_move) setStretchSecs(0);
      if (r.started_first_action_at === null) {
        nudgeTimerRef.current = setTimeout(() => setNudgeShown(true), 6 * 60 * 1000);
      }
    });
    return () => {
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!breatheRunning) {
      if (breatheRef.current) clearInterval(breatheRef.current);
      return;
    }
    breatheRef.current = setInterval(() => {
      setBreatheSecs((v) => {
        if (v <= 1) {
          setBreatheRunning(false);
          breatheAudio.current?.pause();
          if (breatheAudio.current) breatheAudio.current.currentTime = 0;
          morningRitualApi.markBreatheDone().then(setRitual);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => {
      if (breatheRef.current) clearInterval(breatheRef.current);
    };
  }, [breatheRunning]);

  useEffect(() => {
    if (!sunRunning) {
      if (sunRef.current) clearInterval(sunRef.current);
      return;
    }
    sunRef.current = setInterval(() => {
      setSunSecs((v) => {
        if (v <= 1) {
          setSunRunning(false);
          morningRitualApi.setResetDaylight(true).then(setRitual);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => {
      if (sunRef.current) clearInterval(sunRef.current);
    };
  }, [sunRunning]);

  useEffect(() => {
    if (!stretchRunning) {
      if (stretchRef.current) clearInterval(stretchRef.current);
      return;
    }
    stretchRef.current = setInterval(() => {
      setStretchSecs((v) => {
        if (v <= 1) {
          setStretchRunning(false);
          // Same audio element Breathe uses (Zahid: "use same breath
          // sound in Body Stretch") — a single shared, looping track,
          // not two independent players.
          breatheAudio.current?.pause();
          if (breatheAudio.current) breatheAudio.current.currentTime = 0;
          morningRitualApi.setResetMove(true).then(setRitual);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => {
      if (stretchRef.current) clearInterval(stretchRef.current);
    };
  }, [stretchRunning]);

  useEffect(() => {
    if (!medRunning) {
      if (medRef.current) clearInterval(medRef.current);
      return;
    }
    medRef.current = setInterval(() => {
      setMedSecs((v) => {
        if (v <= 1) {
          setMedRunning(false);
          morningRitualApi.markPrimeMeditation().then(setRitual);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => {
      if (medRef.current) clearInterval(medRef.current);
    };
  }, [medRunning]);

  if (!ritual) return <div>Loading…</div>;

  const mode = ritual.morning_mode;
  const gentle = mode === 'gentle';
  const wwwHidden = mode === 'gentle' || mode === 'fast';
  const journalMinHeight = gentle ? 84 : 130;

  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const dismissNudge = () => {
    setNudgeShown(false);
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
  };

  const steps = morningSteps(ritual);
  const resetDone = ritual.reset_water && ritual.reset_breathe && ritual.reset_move && (gentle || ritual.reset_daylight);
  const resetCompact = resetDone && !resetOpen;
  const outcomeText = outcomeDraft.trim() || "Set today's outcome";
  const firstMoveText = firstMoveDraft.trim() || 'Set your first move';
  const visualizeText = `See yourself completing "${outcomeDraft.trim() || "today's outcome"}." Then see yourself taking the first physical step: ${firstMoveDraft.trim() || 'the first action'}.`;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 32, position: 'relative' }}>

      {/* ── SEE ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 4px' }}>Good morning</h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '4px 8px',
              borderRadius: RADIUS.pill,
              border: '1px solid var(--border)',
              borderLeft: `3px solid ${MODE_COLOR[mode]}`,
              color: 'var(--text-muted)',
              background: 'var(--surface)',
            }}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </span>
        </div>

        {/* Where the morning stands, as the five steps the Discipline card
            counts — each one jumps to its section. */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 4, marginTop: 16 }}>
          {steps.map((st, i) => (
            <button
              key={st.key}
              onClick={() => {
                const target = {
                  checkin: checkinSectionRef,
                  reset: resetSectionRef,
                  mind: clearSectionRef,
                  prime: primeSectionRef,
                  ready: startSectionRef,
                }[st.key];
                target?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="hover-tint"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
                padding: '4px 0',
                border: 'none',
                background: 'transparent',
                font: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--text)',
              }}
            >
              <span
                style={{
                  height: 4,
                  alignSelf: 'stretch',
                  borderRadius: RADIUS.pill,
                  background:
                    st.state === 'done'
                      ? ACCENT
                      : st.state === 'now'
                        ? `color-mix(in srgb, ${ACCENT} 45%, var(--surface))`
                        : 'color-mix(in srgb, var(--progress-track) 40%, var(--surface))',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: st.state === 'now' ? 700 : 400,
                  color: st.state === 'next' ? 'var(--text-muted)' : 'var(--text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {st.state === 'done' ? '✓ ' : `${i + 1}. `}
                {L(st.en, st.bn)}
              </span>
            </button>
          ))}
        </div>

        <div
          className="card-elevated"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${ACCENT}`,
            borderRadius: RADIUS.card,
            padding: 16,
            marginTop: 12,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
              {ritual.carried_from_date ? L('☾ You wrote last night', '☾ গত রাতে লিখেছিলেন') : L('Carried from yesterday', 'গতকাল থেকে')}
            </span>
            {ritual.carried_from_date && (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {L('Night Closure', 'নাইট ক্লোজার')} · {ritual.carried_from_date}
              </span>
            )}
          </div>
          {ritual.carried_from_date ? (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>
                <span style={{ color: 'var(--text-faint)' }}>{L('Outcome', 'ফলাফল')} · </span>
                {ritual.today_outcome || L('not set', 'সেট করা নেই')}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>
                <span style={{ color: 'var(--text-faint)' }}>{L('First move', 'প্রথম পদক্ষেপ')} · </span>
                {ritual.first_move || L('not set', 'সেট করা নেই')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                {L('Edit below if the morning sees it differently.', 'সকালে অন্যরকম মনে হলে নিচে বদলে নিন।')}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8 }}>
              {L(
                'Nothing carried over yet. Close tonight out on Night Closure and it will be waiting here.',
                'এখনো কিছু আসেনি। আজ রাতে নাইট ক্লোজার করলে কাল সকালে এখানে থাকবে।'
              )}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginTop: 12,
          }}
        >
          <div
            className="card-elevated"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '2px solid var(--success)',
              borderRadius: RADIUS.card,
              padding: 12,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>
              Today
            </div>
            {editingOutcome ? (
              <input
                ref={outcomeInputRef}
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                onBlur={() => {
                  setEditingOutcome(false);
                  morningRitualApi.setOutcome(outcomeDraft).then(setRitual);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ width: '100%', fontSize: 16, fontWeight: 600, marginTop: 8 }}
              />
            ) : (
              <button
                onClick={() => setEditingOutcome(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  font: 'inherit',
                  padding: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 8,
                  cursor: 'text',
                  color: outcomeDraft ? undefined : 'var(--text-faint)',
                }}
              >
                {outcomeText}
              </button>
            )}
          </div>
          <div
            className="card-elevated"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '2px solid var(--warning)',
              borderRadius: RADIUS.card,
              padding: 12,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>
              First move
            </div>
            {editingFirstMove ? (
              <input
                ref={firstMoveInputRef}
                value={firstMoveDraft}
                onChange={(e) => setFirstMoveDraft(e.target.value)}
                onBlur={() => {
                  setEditingFirstMove(false);
                  morningRitualApi.setFirstMove(firstMoveDraft).then(setRitual);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ width: '100%', fontSize: 16, fontWeight: 600, marginTop: 8 }}
              />
            ) : (
              <button
                onClick={() => setEditingFirstMove(true)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  font: 'inherit',
                  padding: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 8,
                  cursor: 'text',
                  color: firstMoveDraft ? undefined : 'var(--text-faint)',
                }}
              >
                {firstMoveText}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── CHECK-IN + RESET ────────────────────────────────────── */}
      <div ref={checkinSectionRef} style={{ marginBottom: 32 }}>
        <MicroLabel>CHECK-IN</MicroLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 52, flex: 'none' }}>Energy</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {ENERGY_OPTIONS.map((o) => (
              <Pill
                key={o.value}
                value={o.value}
                label={o.label}
                active={ritual.energy === o.value}
                onClick={() => morningRitualApi.setCheckIn(o.value).then(setRitual)}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 52, flex: 'none' }}>Mood</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {MOOD_OPTIONS.map((o) => (
              <Pill
                key={o.value}
                value={o.value}
                label={o.label}
                active={ritual.mood === o.value}
                onClick={() => morningRitualApi.setCheckIn(undefined, o.value).then(setRitual)}
              />
            ))}
          </div>
          {(ritual.mood === 'LOW' || ritual.mood === 'NEUTRAL') && (
            <button onClick={() => scrollTo(resetSectionRef)} className="link" style={{ fontSize: 12 }}>
              Break Pattern
            </button>
          )}
        </div>

        <div>
          <button
            onClick={() => setSleepOpen((v) => !v)}
            className="link"
            style={{ fontSize: 13 }}
            aria-expanded={sleepOpen}
          >
            {sleepOpen ? '– Sleep quality' : '+ Sleep quality'}
          </button>
          {sleepOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 52, flex: 'none' }}>Sleep</span>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {SLEEP_OPTIONS.map((o) => (
                    <Pill
                      key={o.value}
                      value={o.value}
                      label={o.label}
                      active={ritual.sleep_quality === o.value}
                      onClick={() => morningRitualApi.setCheckIn(undefined, undefined, o.value).then(setRitual)}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 52, flex: 'none' }}>Woke at</span>
                <div style={{ position: 'relative', display: 'inline-flex' }}>
                  <input
                    type="time"
                    value={wakeDraft}
                    onChange={(e) => setWakeDraft(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 32px 4px 8px' }}
                  />
                  <button
                    onClick={() => setWakeDraft(nowHHMM())}
                    style={{
                      position: 'absolute',
                      right: 3,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '2px 8px',
                      border: 'none',
                      borderRadius: RADIUS.control,
                      background: 'var(--accent-light)',
                      color: ACCENT,
                      cursor: 'pointer',
                    }}
                  >
                    Now
                  </button>
                </div>
                <button
                  onClick={() => morningRitualApi.setCheckIn(undefined, undefined, undefined, wakeDraft).then(setRitual)}
                  className="btn-ghost"
                  disabled={!wakeDraft}
                  style={{ fontSize: 12, padding: '4px 8px' }}
                >
                  Set
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  Optional — keeping wake time steady has the strongest evidence here.
                </span>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <MicroLabel style={{ marginTop: 16 }}>RESET</MicroLabel>
          {resetDone && (
            <button onClick={() => setResetOpen((v) => !v)} className="link" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {resetOpen ? L('Collapse', 'গুটিয়ে নিন') : L('Show', 'দেখুন')}
            </button>
          )}
        </div>
        {resetCompact && (
          <div
            ref={resetSectionRef}
            style={{ display: 'grid', gridTemplateColumns: `repeat(${gentle ? 3 : 4}, minmax(0, 1fr))`, gap: 8 }}
          >
            {[
              L('Water', 'পানি'),
              L('Breathe', 'শ্বাস'),
              L('Stretch', 'স্ট্রেচ'),
              ...(gentle ? [] : [L('Day Light', 'দিনের আলো')]),
            ].map((name) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 8,
                  borderRadius: RADIUS.control,
                  border: '1px solid var(--border)',
                  background: 'color-mix(in srgb, var(--success) 12%, var(--surface))',
                  fontSize: 13,
                  fontWeight: 600,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                <Check size={12} color="var(--success)" style={{ flex: 'none' }} />
                {name}
              </div>
            ))}
          </div>
        )}
        <div ref={resetCompact ? undefined : resetSectionRef} style={{ display: resetCompact ? 'none' : 'flex', flexDirection: 'column', gap: 8 }}>
          <ResetRow
            border="var(--ba-upside)"
            name="Water"
            sub={gentle ? "One glass. That's the whole task." : "A glass before coffee — you've gone all night without any."}
            right={
              <ResetButton
                label={ritual.reset_water ? <>Done <Check size={12} /></> : 'Done'}
                done={ritual.reset_water}
                onClick={() => morningRitualApi.setResetWater(!ritual.reset_water).then(setRitual)}
              />
            }
          />
          <ResetRow
            border="var(--ba-idea)"
            name="Breathe"
            sub={ritual.reset_breathe ? 'Done' : breatheRunning ? `${breatheSecs}s — in through the nose, out slowly` : '60 seconds, slow and comfortable'}
            dotClassName={breatheRunning ? 'ritual-pulse' : ''}
            right={
              <ResetButton
                label={ritual.reset_breathe ? 'Done' : breatheRunning ? 'Stop' : 'Start'}
                done={ritual.reset_breathe}
                disabled={ritual.reset_breathe}
                onClick={() => {
                  if (breatheRunning) {
                    setBreatheRunning(false);
                    breatheAudio.current?.pause();
                    return;
                  }
                  setBreatheSecs(60);
                  setBreatheRunning(true);
                  breatheAudio.current?.play().catch((e) => console.error('breathe audio play failed:', e));
                }}
              />
            }
          />
          <ResetRow
            border="var(--ba-money)"
            name="Body Stretch"
            sub={ritual.reset_move ? 'Done' : stretchRunning ? `${stretchSecs}s remaining` : 'Rub your hands together, then stand up — 2 minutes'}
            right={
              <ResetButton
                label={ritual.reset_move ? 'Done' : stretchRunning ? 'Stop' : 'Start'}
                done={ritual.reset_move}
                disabled={ritual.reset_move}
                onClick={() => {
                  if (stretchRunning) {
                    setStretchRunning(false);
                    breatheAudio.current?.pause();
                    return;
                  }
                  setStretchSecs(STRETCH_TIMER_SECS);
                  setStretchRunning(true);
                  breatheAudio.current?.play().catch((e) => console.error('breathe audio play failed:', e));
                }}
              />
            }
          />
          {!gentle && (
            <ResetRow
              border="var(--ba-do)"
              name="Day Light"
              sub={ritual.reset_daylight ? 'Done' : sunRunning ? `${sunSecs}s remaining` : 'Win today. Clear vision.'}
              right={
                <ResetButton
                  label={ritual.reset_daylight ? 'Done' : sunRunning ? 'Stop' : 'Start'}
                  done={ritual.reset_daylight}
                  disabled={ritual.reset_daylight}
                  onClick={() => {
                    if (sunRunning) {
                      setSunRunning(false);
                      return;
                    }
                    setSunSecs(BREAK_TIMER_SECS);
                    setSunRunning(true);
                  }}
                />
              }
            />
          )}
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
            Worth trying, not proven
          </div>
          <ul style={{ margin: '8px 0 8px', paddingLeft: 16, display: 'grid', gap: 4 }}>
            <li style={{ fontSize: 14, color: 'var(--text-muted)' }}>Hold off on coffee for the first hour or so.</li>
            <li style={{ fontSize: 14, color: 'var(--text-muted)' }}>Keep the phone out of the first 30 minutes.</li>
            <li style={{ fontSize: 14, color: 'var(--text-muted)' }}>Cold water on the face if you're still foggy.</li>
          </ul>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Evidence for these three is thin. Keep whichever actually helps you, drop the rest.
          </div>
        </div>

        <button onClick={() => scrollTo(clearSectionRef)} className="link" style={{ fontSize: 13, marginTop: 12, display: 'block' }}>
          I'm ready →
        </button>
      </div>

      {/* ── DO'S & DON'TS ────────────────────────────────────────── */}
      <DoDontList />

      {/* ── CLEAR YOUR MIND ─────────────────────────────────────── */}
      <div ref={clearSectionRef} style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Clear Your Mind</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          You don't need to write a journal entry. Just capture what's on your mind.
        </p>

        {!wwwHidden && (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', display: 'grid', gap: 4 }}>
            <div>
              <strong style={{ color: 'var(--text)' }}>What</strong> — whatever is sitting in your head right now, in any order.
            </div>
            <div>
              <strong style={{ color: 'var(--text)' }}>Why</strong> — unheld thoughts keep taking attention until they're written down.
            </div>
            <div>
              <strong style={{ color: 'var(--text)' }}>How</strong> — one or two minutes, plain sentences, no editing.
            </div>
          </div>
        )}

        <textarea
          value={journalDraft}
          onChange={(e) => setJournalDraft(e.target.value)}
          onBlur={() => {
            if (journalDraft.trim().length > 0) setJournalTouched(true);
            if (journalDraft.trim() !== ritual.journal_text) {
              morningRitualApi.setJournal(journalDraft).then(setRitual);
            }
          }}
          placeholder="What's on your mind?"
          style={{ width: '100%', minHeight: journalMinHeight, resize: 'vertical', fontSize: 14, padding: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>1–3 min • Write naturally</span>
          <button
            onClick={() => {
              setJournalDraft('');
              setJournalTouched(false);
              setSuggestOpen(false);
              morningRitualApi.setJournal('').then(setRitual);
            }}
            className="link"
            style={{ fontSize: 13 }}
          >
            Skip
          </button>
        </div>

        {journalTouched && journalDraft.trim().length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Does this need action today?</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => {
                  morningRitualApi.setJournalActionNeeded(true).then(setRitual);
                  setSuggestOpen(true);
                  morningRitualApi.suggestAction(journalDraft).then((r) => setSuggestDraft(r.suggestion));
                }}
              >
                Make it an action
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 12 }}
                onClick={() => {
                  setSuggestOpen(false);
                  morningRitualApi.setJournalActionNeeded(false).then(setRitual);
                }}
              >
                Release &amp; return
              </button>
            </div>

            {suggestOpen && (
              <div style={{ marginTop: 8, border: '1px solid var(--border)', borderLeft: `3px solid ${MODE_COLOR.fast}`, borderRadius: RADIUS.card, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                  Suggested next action
                </div>
                <input
                  value={suggestDraft}
                  onChange={(e) => setSuggestDraft(e.target.value)}
                  style={{ width: '100%', fontSize: 14, marginTop: 8 }}
                />
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      const v = suggestDraft.trim();
                      if (!v) return;
                      setFirstMoveDraft(v);
                      morningRitualApi.setFirstMove(v).then(setRitual);
                      setSuggestOpen(false);
                    }}
                  >
                    Use this
                  </button>
                </div>
              </div>
            )}

            {!suggestOpen && ritual.journal_released && (
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                You don't need to solve everything right now — this stays saved.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── MORNING PRIME ───────────────────────────────────────── */}
      <details
        ref={primeSectionRef}
        className="card-elevated"
        style={{ border: '1px solid var(--border)', borderRadius: RADIUS.card, marginBottom: 32, padding: 0, boxShadow: 'var(--shadow-sm)' }}
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open && !visualizeMarkedRef.current) {
            visualizeMarkedRef.current = true;
            morningRitualApi.markPrimeVisualization().then(setRitual);
          }
        }}
      >
        <summary style={{ padding: 12, cursor: 'pointer', listStyle: 'none', fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
          Morning prime · Meditate · Visualize · Read · Ground · Spiritual
        </summary>

        <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
          <PrimeItem border="var(--ba-idea)" name="Meditate">
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
              {ritual.prime_meditation ? 'Done' : medRunning ? `${medSecs}s remaining` : '90 seconds. Sit, eyes closed, let the timer keep time for you.'}
            </p>
            {!ritual.prime_meditation && (
              <button
                className="btn-ghost"
                style={{ fontSize: 12, marginTop: 8 }}
                onClick={() => {
                  if (medRunning) {
                    setMedRunning(false);
                    return;
                  }
                  setMedSecs(90);
                  setMedRunning(true);
                }}
              >
                {medRunning ? 'Stop' : 'Start'}
              </button>
            )}
          </PrimeItem>

          <PrimeItem border="var(--ba-decide)" name="Visualize">
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{visualizeText}</p>
          </PrimeItem>

          <PrimeItem border="var(--ba-upside)" name="Read">
            <p style={{ fontFamily: 'Georgia, "Noto Serif Bengali", serif', fontSize: 16, lineHeight: 1.6, margin: '0 0 8px' }}>
              {READING_LINES[readingIdx]}
            </p>
            <button
              className="link"
              style={{ fontSize: 12 }}
              onClick={() => {
                setReadingIdx((i) => (i + 1) % READING_LINES.length);
                if (!readingMarkedRef.current) {
                  readingMarkedRef.current = true;
                  morningRitualApi.markPrimeReading().then(setRitual);
                }
              }}
            >
              Next line
            </button>
          </PrimeItem>

          <PrimeItem border="var(--ba-do)" name="Ground">
            <input
              value={gratitudeDraft}
              onChange={(e) => setGratitudeDraft(e.target.value)}
              onBlur={() => {
                if (gratitudeDraft.trim() !== ritual.prime_gratitude) {
                  morningRitualApi.setPrimeGratitude(gratitudeDraft).then(setRitual);
                }
              }}
              placeholder="One thing you're grateful for"
              style={{ width: '100%', fontSize: 14 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {INTENTION_OPTIONS.map((v) => (
                <Pill
                  key={v}
                  value={v}
                  label={v}
                  active={ritual.prime_intention === v}
                  onClick={() => morningRitualApi.setPrimeIntention(ritual.prime_intention === v ? null : v).then(setRitual)}
                />
              ))}
            </div>
          </PrimeItem>

          <PrimeItem border="var(--ba-money)" name="Spiritual practice">
            <select
              value={ritual.prime_spiritual}
              onChange={(e) => morningRitualApi.setPrimeSpiritual(e.target.value as MorningSpiritual).then(setRitual)}
              style={{ width: '100%', fontSize: 14 }}
            >
              {SPIRITUAL_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v === 'OFF' ? 'Off' : v}
                </option>
              ))}
            </select>
          </PrimeItem>
        </div>
      </details>

      {/* ── START NOW ───────────────────────────────────────────── */}
      <div ref={startSectionRef}>
        {ritual.started_first_action_at === null ? (
          <div
            className="card-elevated"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${MODE_COLOR.fast}`, borderRadius: RADIUS.card, padding: 16, boxShadow: 'var(--shadow-sm)' }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-faint)' }}>Ready</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Today's outcome</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{outcomeText}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>First move</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{firstMoveText}</div>
              </div>
            </div>

            {pendingTasks.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
                  PENDING · EXECUTE
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pendingTasks.map((t) => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: RADIUS.pill,
                          background: t.strike ? ACCENT : URGENCY_DOT[t.urgency],
                          flex: 'none',
                        }}
                      />
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                dismissNudge();
                morningRitualApi.startNow().then(setRitual);
              }}
              style={{ marginTop: 16, width: '100%', padding: '12px 0', background: ACCENT, borderColor: ACCENT, color: 'var(--on-accent)', fontSize: 16, fontWeight: 600 }}
            >
              Start now →
            </button>
          </div>
        ) : (
          <div
            className="card-elevated"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 24, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <RitualRing progress={1} size={56} stroke={4} accent={ACCENT}>
                <Check size={24} color={ACCENT} />
              </RitualRing>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: ACCENT, marginBottom: 8 }}>IN MOTION</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Time to first action: {fmtKpi(ritual.kpi_seconds)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ritual complete — carry it into the day.</div>
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
        This page supports routine and planning. It is not medical or mental-health care. If sleep, mood, or
        energy problems keep affecting your daily life, talk to a qualified healthcare professional.
      </p>

      {onViewTrend && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={onViewTrend} className="btn-ghost" style={{ fontSize: 12 }}>
            View trends
          </button>
        </div>
      )}

      {/* Start is the one action this page exists for, and it sits at the
          very bottom — keep it reachable from anywhere while it is owed. */}
      {ritual.started_first_action_at === null && !startVisible && !nudgeShown && (
        <div
          style={{
            position: 'sticky',
            bottom: 8,
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            boxShadow: 'var(--shadow-sm)',
            zIndex: 5,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{L("Today's outcome", 'আজকের ফলাফল')}</div>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {outcomeText}
            </div>
          </div>
          <button
            onClick={() => {
              dismissNudge();
              morningRitualApi.startNow().then(setRitual);
            }}
            style={{ background: ACCENT, borderColor: ACCENT, color: 'var(--on-accent)', fontSize: 14, fontWeight: 600, padding: '8px 16px', flex: 'none' }}
          >
            {L('Start now →', 'এখন শুরু →')}
          </button>
        </div>
      )}

      {nudgeShown && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid ' + ACCENT,
            borderRadius: RADIUS.card,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 50,
            maxWidth: '90vw',
          }}
        >
          <span>You have enough clarity. Start the day.</span>
          <button
            onClick={() => {
              dismissNudge();
              scrollTo(startSectionRef);
            }}
            style={{ background: ACCENT, borderColor: ACCENT, color: 'var(--on-accent)', fontSize: 12, padding: '4px 12px', flex: 'none' }}
          >
            Start now
          </button>
        </div>
      )}
    </div>
  );
}
