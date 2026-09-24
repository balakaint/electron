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
import RitualRing from './RitualRing';
import breatheAudioUrl from '../assets/audio/breath.mp3';

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

function Pill<T extends string>({ value, label, active, onClick }: { value: T; label: string; active: boolean; onClick: () => void }) {
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
        borderRadius: 10,
        padding: '10px 12px',
        background: 'var(--surface)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
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

function ResetButton({ label, onClick, disabled, done }: { label: string; onClick: () => void; disabled?: boolean; done?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={done}
      className={done ? undefined : 'btn-ghost'}
      style={{
        fontSize: 12,
        padding: '5px 11px',
        flex: 'none',
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
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{name}</div>
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

  const [stretchSecs, setStretchSecs] = useState(BREAK_TIMER_SECS);
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

  const outcomeText = outcomeDraft.trim() || "Set today's outcome";
  const firstMoveText = firstMoveDraft.trim() || 'Set your first move';
  const visualizeText = `See yourself completing "${outcomeDraft.trim() || "today's outcome"}." Then see yourself taking the first physical step: ${firstMoveDraft.trim() || 'the first action'}.`;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 32, position: 'relative' }}>

      {/* ── SEE ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 4px' }}>Good morning</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '3px 9px',
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

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${ACCENT}`,
            borderRadius: RADIUS.card,
            padding: 16,
            marginTop: 14,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
            {ritual.carried_from_date ? `Carried from ${ritual.carried_from_date}` : 'Carried from yesterday'}
          </div>
          {ritual.carried_from_date ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              "{ritual.today_outcome || 'Outcome'}" — first move: {ritual.first_move || 'not set'}
            </div>
          ) : (
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 8 }}>
              Nothing carried over yet. Close tonight out on Night Closure and it will be waiting here.
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
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '2px solid var(--success)',
              borderRadius: RADIUS.card,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>
              Today
            </div>
            {editingOutcome ? (
              <input
                autoFocus
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                onBlur={() => {
                  setEditingOutcome(false);
                  morningRitualApi.setOutcome(outcomeDraft).then(setRitual);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ width: '100%', fontSize: 16, fontWeight: 600, marginTop: 6 }}
              />
            ) : (
              <div
                onClick={() => setEditingOutcome(true)}
                style={{ fontSize: 16, fontWeight: 600, marginTop: 6, cursor: 'text', color: outcomeDraft ? undefined : 'var(--text-faint)' }}
              >
                {outcomeText}
              </div>
            )}
          </div>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderTop: '2px solid var(--warning)',
              borderRadius: RADIUS.card,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', fontWeight: 600 }}>
              First move
            </div>
            {editingFirstMove ? (
              <input
                autoFocus
                value={firstMoveDraft}
                onChange={(e) => setFirstMoveDraft(e.target.value)}
                onBlur={() => {
                  setEditingFirstMove(false);
                  morningRitualApi.setFirstMove(firstMoveDraft).then(setRitual);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ width: '100%', fontSize: 16, fontWeight: 600, marginTop: 6 }}
              />
            ) : (
              <div
                onClick={() => setEditingFirstMove(true)}
                style={{ fontSize: 16, fontWeight: 600, marginTop: 6, cursor: 'text', color: firstMoveDraft ? undefined : 'var(--text-faint)' }}
              >
                {firstMoveText}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CHECK-IN + RESET ────────────────────────────────────── */}
      <div style={{ marginBottom: 32 }}>
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
                    style={{ fontSize: 12, padding: '4px 34px 4px 8px' }}
                  />
                  <button
                    onClick={() => setWakeDraft(nowHHMM())}
                    style={{
                      position: 'absolute',
                      right: 3,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 6px',
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
                  style={{ fontSize: 12, padding: '4px 10px' }}
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

        <MicroLabel style={{ marginTop: 18 }}>RESET</MicroLabel>
        <div ref={resetSectionRef} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ResetRow
            border="var(--ba-upside)"
            name="Water"
            sub={gentle ? "One glass. That's the whole task." : "A glass before coffee — you've gone all night without any."}
            right={
              <ResetButton
                label={ritual.reset_water ? 'Done ✓' : 'Done'}
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
            sub={ritual.reset_move ? 'Done' : stretchRunning ? `${stretchSecs}s remaining` : gentle ? '3 min — just enough to unstick' : '3 min — stretch, walk, whatever loosens you up'}
            right={
              <ResetButton
                label={ritual.reset_move ? 'Done' : stretchRunning ? 'Stop' : 'Start'}
                done={ritual.reset_move}
                disabled={ritual.reset_move}
                onClick={() => {
                  if (stretchRunning) {
                    setStretchRunning(false);
                    return;
                  }
                  setStretchSecs(BREAK_TIMER_SECS);
                  setStretchRunning(true);
                }}
              />
            }
          />
          {!gentle && (
            <ResetRow
              border="var(--ba-do)"
              name="Daylight"
              sub={ritual.reset_daylight ? 'Done' : sunRunning ? `${sunSecs}s remaining` : "Step outside or sit by a bright window. Don't look at the sun."}
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

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
            Worth trying, not proven
          </div>
          <ul style={{ margin: '8px 0 6px', paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Hold off on coffee for the first hour or so.</li>
            <li style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Keep the phone out of the first 30 minutes.</li>
            <li style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Cold water on the face if you're still foggy.</li>
          </ul>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Evidence for these three is thin. Keep whichever actually helps you, drop the rest.
          </div>
        </div>

        <button onClick={() => scrollTo(clearSectionRef)} className="link" style={{ fontSize: 13, marginTop: 12, display: 'block' }}>
          I'm ready →
        </button>
      </div>

      {/* ── CLEAR YOUR MIND ─────────────────────────────────────── */}
      <div ref={clearSectionRef} style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Clear Your Mind</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
          You don't need to write a journal entry. Just capture what's on your mind.
        </p>

        {!wwwHidden && (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', display: 'grid', gap: 3 }}>
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
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
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
              <div style={{ marginTop: 10, border: '1px solid var(--border)', borderLeft: `3px solid ${MODE_COLOR.fast}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
                  Suggested next action
                </div>
                <input
                  value={suggestDraft}
                  onChange={(e) => setSuggestDraft(e.target.value)}
                  style={{ width: '100%', fontSize: 14, marginTop: 8 }}
                />
                <div style={{ marginTop: 10 }}>
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
              <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                You don't need to solve everything right now — this stays saved.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── MORNING PRIME ───────────────────────────────────────── */}
      <details
        style={{ border: '1px solid var(--border)', borderRadius: RADIUS.card, marginBottom: 32, padding: 0 }}
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open && !visualizeMarkedRef.current) {
            visualizeMarkedRef.current = true;
            morningRitualApi.markPrimeVisualization().then(setRitual);
          }
        }}
      >
        <summary style={{ padding: 14, cursor: 'pointer', listStyle: 'none', fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
          Morning prime · Meditate · Visualize · Read · Ground · Spiritual
        </summary>

        <div style={{ padding: '0 14px 14px', display: 'grid', gap: 10 }}>
          <PrimeItem border="var(--ba-idea)" name="Meditate">
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>
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
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>{visualizeText}</p>
          </PrimeItem>

          <PrimeItem border="var(--ba-upside)" name="Read">
            <p style={{ fontFamily: 'Georgia, "Noto Serif Bengali", serif', fontSize: 15, lineHeight: 1.6, margin: '0 0 8px' }}>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
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
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: `3px solid ${MODE_COLOR.fast}`, borderRadius: RADIUS.card, padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-faint)' }}>Ready</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
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
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
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
              style={{ marginTop: 16, width: '100%', padding: '13px 0', background: ACCENT, borderColor: ACCENT, color: 'var(--on-accent)', fontSize: 15, fontWeight: 600 }}
            >
              Start now →
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 24, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <RitualRing progress={1} size={56} stroke={4} accent={ACCENT}>
                <span style={{ fontSize: 24, color: ACCENT }}>✓</span>
              </RitualRing>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: ACCENT, marginBottom: 8 }}>IN MOTION</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Time to first action: {fmtKpi(ritual.kpi_seconds)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ritual complete — carry it into the day.</div>
          </div>
        )}
      </div>

      <p style={{ marginTop: 28, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
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
