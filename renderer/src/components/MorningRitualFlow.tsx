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
import { Check, Moon, Sun } from 'lucide-react';
import RitualRing from './RitualRing';
import { useAutofocus } from '../hooks/useAutofocus';
import DoDontList from './DoDontList';
import breatheAudioUrl from '../assets/audio/breath.mp3';
import { useL } from '../i18n';
import { morningSteps } from '../ritualSteps';

// Morning Ritual. Laid out to Zahid's approved mockup (2026-09-25): a
// dark card with last night's outcome and first move (Edit in place),
// a boxed check-in with Sleep always shown, Reset as four tiles, a
// numbered Clear-your-mind card with its "action today?" question,
// Prime as four tiles over gratitude and intention, and a Ready bar
// pinned to the bottom until the day is started. Kept from before, by
// Zahid's call: the "Worth trying, not proven" list and DO / DON'T.
// Still wired to the real backend (engine/morning_ritual.py); the
// Breathe / Stretch / Sunlight / Meditate countdowns and the breath
// sound work as they did.
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

// Mockup (2026-09-25) building blocks: boxed segmented choices for the
// check-in, square tiles for Reset and Prime, and a numbered section
// head. All read colour from theme tokens.
function Seg({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 32,
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        borderRadius: RADIUS.control,
        border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
        background: active ? ACCENT : 'var(--surface)',
        color: active ? 'var(--on-accent)' : 'var(--text)',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      {label}
    </button>
  );
}

function SectionHead({ mark, done, title, note }: { mark: string; done?: boolean; title: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span
        style={{
          width: 24,
          height: 24,
          flex: 'none',
          boxSizing: 'border-box',
          borderRadius: RADIUS.pill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          background: done ? 'var(--success)' : 'var(--surface)',
          color: done ? 'var(--on-accent)' : ACCENT,
          border: `2px solid ${done ? 'var(--success)' : ACCENT}`,
        }}
      >
        {done ? <Check size={14} strokeWidth={3} /> : mark}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>{title}</span>
      {note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{note}</span>}
    </div>
  );
}

function Tile({
  name,
  sub,
  done,
  active,
  topColor,
  onClick,
  pulse,
}: {
  name: string;
  sub: string;
  done?: boolean;
  active?: boolean;
  topColor?: string;
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={done || active}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 2,
        textAlign: 'left',
        padding: 12,
        minWidth: 0,
        borderRadius: RADIUS.card,
        border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
        borderTop: topColor ? `3px solid ${topColor}` : undefined,
        background: done ? 'var(--surface-2)' : 'var(--surface)',
        color: 'var(--text)',
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {pulse && <span className="ritual-pulse" style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: ACCENT, flex: 'none' }} />}
        {name}
        {done && <Check size={14} color="var(--success)" strokeWidth={3} style={{ flex: 'none' }} />}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{sub}</span>
    </button>
  );
}

export default function MorningRitualFlow({ onViewTrend }: { onViewTrend?: () => void }) {
  const [ritual, setRitual] = useState<MorningRitual | null>(null);

  const [outcomeDraft, setOutcomeDraft] = useState('');
  const [firstMoveDraft, setFirstMoveDraft] = useState('');
  const [journalDraft, setJournalDraft] = useState('');
  const [journalTouched, setJournalTouched] = useState(false);
  const [gratitudeDraft, setGratitudeDraft] = useState('');
  const [wakeDraft, setWakeDraft] = useState('');
  const [suggestDraft, setSuggestDraft] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);


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
  const primeSectionRef = useRef<HTMLDivElement>(null);
  const L = useL();
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    morningRitualApi
      .trend()
      .then((t) => setStreak(t.streak))
      .catch(() => {});
  }, []);
  const [editingCarry, setEditingCarry] = useState(false);
  const carryInputRef = useAutofocus<HTMLInputElement>(editingCarry);
  const [primeOpen, setPrimeOpen] = useState<'meditate' | 'visualize' | 'read' | 'ground' | null>(null);
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
  const outcomeText = outcomeDraft.trim() || "Set today's outcome";
  const visualizeText = `See yourself completing "${outcomeDraft.trim() || "today's outcome"}." Then see yourself taking the first physical step: ${firstMoveDraft.trim() || 'the first action'}.`;

  const carried = !!ritual.carried_from_date;
  const onDark = 'var(--bg)';
  const onDarkMuted = 'color-mix(in srgb, var(--bg) 70%, var(--text))';
  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: RADIUS.card,
    padding: 16,
  };
  const resetCount = [ritual.reset_water, ritual.reset_breathe, ritual.reset_move, ...(gentle ? [] : [ritual.reset_daylight])].filter(Boolean).length;
  const resetTotal = gentle ? 3 : 4;
  const checkinDone = !!ritual.energy && !!ritual.mood;
  const mmss = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const start = () => {
    dismissNudge();
    morningRitualApi.startNow().then(setRitual);
  };
  const saveCarry = () => {
    setEditingCarry(false);
    if (outcomeDraft.trim() !== ritual.today_outcome) morningRitualApi.setOutcome(outcomeDraft).then(setRitual);
    if (firstMoveDraft.trim() !== ritual.first_move) morningRitualApi.setFirstMove(firstMoveDraft).then(setRitual);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingBottom: 16, position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            {ritual.wake_up_time ? ` · ${L('woke', 'উঠেছি')} ${ritual.wake_up_time}` : ''}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sun size={24} color={ACCENT} /> {L('Good morning', 'শুভ সকাল')}
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              padding: '2px 8px',
              borderRadius: RADIUS.pill,
              background: MODE_COLOR[mode],
              color: 'var(--on-accent)',
            }}
          >
            {mode}
          </span>
          {streak !== null && streak > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L(`${streak}-day streak`, `${streak} দিনের ধারা`)}</span>
          )}
        </div>
      </div>

      {/* Where the morning stands; each step jumps to its section. */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 4 }}>
        {steps.map((st) => (
          <button
            key={st.key}
            onClick={() => {
              const target = { checkin: checkinSectionRef, reset: resetSectionRef, mind: clearSectionRef, prime: primeSectionRef, ready: startSectionRef }[st.key];
              target?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="hover-tint"
            style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, padding: '4px 0', border: 'none', background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }}
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
            <span style={{ fontSize: 12, fontWeight: st.state === 'now' ? 700 : 400, color: st.state === 'next' ? 'var(--text-muted)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {L(st.en, st.bn)}
            </span>
          </button>
        ))}
      </div>

      {/* ── Last night's closure (dark card) ────────────────────── */}
      <div style={{ background: 'var(--text)', color: onDark, borderRadius: RADIUS.card, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Moon size={16} color="var(--warning)" style={{ flex: 'none', marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, color: onDarkMuted }}>
            {carried ? `${L('You wrote last night', 'গত রাতে লিখেছিলেন')} · ${L('Night Closure', 'নাইট ক্লোজার')} ${ritual.carried_from_date}` : L("Today's outcome", 'আজকের ফলাফল')}
          </span>
          {editingCarry ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                ref={carryInputRef}
                value={outcomeDraft}
                onChange={(e) => setOutcomeDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveCarry()}
                placeholder={L("Today's outcome", 'আজকের ফলাফল')}
                aria-label={L("Today's outcome", 'আজকের ফলাফল')}
                style={{ fontSize: 16, fontWeight: 700, padding: '4px 8px' }}
              />
              <input
                value={firstMoveDraft}
                onChange={(e) => setFirstMoveDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveCarry()}
                placeholder={L('First move', 'প্রথম পদক্ষেপ')}
                aria-label={L('First move', 'প্রথম পদক্ষেপ')}
                style={{ fontSize: 13, padding: '4px 8px' }}
              />
            </div>
          ) : (
            <>
              <span style={{ fontSize: 16, fontWeight: 700, color: outcomeDraft.trim() ? onDark : onDarkMuted }}>{outcomeText}</span>
              <span style={{ fontSize: 13, color: onDarkMuted }}>
                {L('First move', 'প্রথম পদক্ষেপ')}: {firstMoveDraft.trim() || L('not set', 'সেট করা নেই')}
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => (editingCarry ? saveCarry() : setEditingCarry(true))}
          style={{ flex: 'none', fontSize: 13, padding: '4px 12px', borderRadius: RADIUS.control, border: `1px solid ${onDarkMuted}`, background: 'transparent', color: onDark, cursor: 'pointer' }}
        >
          {editingCarry ? L('Save', 'সেভ') : L('Edit', 'বদলান')}
        </button>
      </div>

      {/* ── Check-in ─────────────────────────────────────────────── */}
      <div ref={checkinSectionRef} style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <SectionHead mark="1" done={checkinDone} title={L('CHECK-IN', 'চেক-ইন')} />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{L("sets today's mode", 'আজকের মোড ঠিক করে')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(4, minmax(0, 1fr))', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{L('Energy', 'শক্তি')}</span>
          {ENERGY_OPTIONS.map((o) => (
            <Seg key={o.value} label={o.label} active={ritual.energy === o.value} onClick={() => morningRitualApi.setCheckIn(o.value).then(setRitual)} />
          ))}
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{L('Mood', 'মেজাজ')}</span>
          {MOOD_OPTIONS.map((o) => (
            <Seg key={o.value} label={o.label} active={ritual.mood === o.value} onClick={() => morningRitualApi.setCheckIn(undefined, o.value).then(setRitual)} />
          ))}
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{L('Sleep', 'ঘুম')}</span>
          {SLEEP_OPTIONS.map((o) => (
            <Seg key={o.value} label={o.label} active={ritual.sleep_quality === o.value} onClick={() => morningRitualApi.setCheckIn(undefined, undefined, o.value).then(setRitual)} />
          ))}
          <span />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', width: 56, flex: 'none' }}>{L('Woke at', 'উঠেছি')}</span>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <input type="time" value={wakeDraft} onChange={(e) => setWakeDraft(e.target.value)} aria-label={L('Woke at', 'উঠেছি')} style={{ fontSize: 12, padding: '4px 32px 4px 8px' }} />
            <button
              onClick={() => setWakeDraft(nowHHMM())}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 12, fontWeight: 600, padding: '2px 8px', border: 'none', borderRadius: RADIUS.control, background: 'var(--accent-light)', color: ACCENT, cursor: 'pointer' }}
            >
              {L('Now', 'এখন')}
            </button>
          </div>
          <button
            onClick={() => morningRitualApi.setCheckIn(undefined, undefined, undefined, wakeDraft).then(setRitual)}
            className="btn-ghost"
            disabled={!wakeDraft}
            style={{ fontSize: 12, padding: '4px 8px' }}
          >
            {L('Set', 'সেট')}
          </button>
          {(ritual.mood === 'LOW' || ritual.mood === 'NEUTRAL') && (
            <button onClick={() => scrollTo(resetSectionRef)} className="link" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {L('Break the pattern ↓', 'প্যাটার্ন ভাঙুন ↓')}
            </button>
          )}
        </div>
      </div>

      {/* ── Reset ────────────────────────────────────────────────── */}
      <div ref={resetSectionRef}>
        <SectionHead mark="2" done={resetDone} title={L('RESET', 'রিসেট')} note={`${resetCount} ${L('of', 'এর')} ${resetTotal}`} />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${resetTotal}, minmax(0, 1fr))`, gap: 8 }}>
          <Tile
            name={L('Water', 'পানি')}
            sub={L('One glass', 'এক গ্লাস')}
            done={ritual.reset_water}
            onClick={() => morningRitualApi.setResetWater(!ritual.reset_water).then(setRitual)}
          />
          <Tile
            name={L('Breathe', 'শ্বাস')}
            sub={ritual.reset_breathe ? L('Done', 'শেষ') : breatheRunning ? `${breatheSecs}s · ${L('tap to stop', 'থামাতে চাপুন')}` : '60 s'}
            done={ritual.reset_breathe}
            active={breatheRunning}
            pulse={breatheRunning}
            onClick={() => {
              if (ritual.reset_breathe) return;
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
          <Tile
            name={L('Stretch', 'স্ট্রেচ')}
            sub={ritual.reset_move ? L('Done', 'শেষ') : stretchRunning ? `${mmss(stretchSecs)} · ${L('tap to stop', 'থামাতে চাপুন')}` : '2 min'}
            done={ritual.reset_move}
            active={stretchRunning}
            onClick={() => {
              if (ritual.reset_move) return;
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
          {!gentle && (
            <Tile
              name={L('Sunlight', 'রোদ')}
              sub={ritual.reset_daylight ? L('Done', 'শেষ') : sunRunning ? `${mmss(sunSecs)} · ${L('tap to stop', 'থামাতে চাপুন')}` : '3 min'}
              done={ritual.reset_daylight}
              active={sunRunning}
              onClick={() => {
                if (ritual.reset_daylight) return;
                if (sunRunning) {
                  setSunRunning(false);
                  return;
                }
                setSunSecs(BREAK_TIMER_SECS);
                setSunRunning(true);
              }}
            />
          )}
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>Worth trying, not proven</div>
          <ul style={{ margin: '8px 0', paddingLeft: 16, display: 'grid', gap: 4 }}>
            <li style={{ fontSize: 14, color: 'var(--text-muted)' }}>Hold off on coffee for the first hour or so.</li>
            <li style={{ fontSize: 14, color: 'var(--text-muted)' }}>Keep the phone out of the first 30 minutes.</li>
            <li style={{ fontSize: 14, color: 'var(--text-muted)' }}>Cold water on the face if you're still foggy.</li>
          </ul>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Evidence for these three is thin. Keep whichever actually helps you, drop the rest.</div>
        </div>
      </div>

      {/* ── Do's & Don'ts ────────────────────────────────────────── */}
      <DoDontList />

      {/* ── Clear your mind ─────────────────────────────────────── */}
      <div ref={clearSectionRef} style={{ ...card, border: `1px solid ${ACCENT}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <SectionHead mark="3" done={journalTouched && journalDraft.trim().length > 0} title={L('CLEAR YOUR MIND', 'মন হালকা করুন')} />
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{L('1–2 min · plain sentences', '১–২ মিনিট · সহজ বাক্যে')}</span>
        </div>
        <textarea
          value={journalDraft}
          onChange={(e) => setJournalDraft(e.target.value)}
          onBlur={() => {
            if (journalDraft.trim().length > 0) setJournalTouched(true);
            if (journalDraft.trim() !== ritual.journal_text) morningRitualApi.setJournal(journalDraft).then(setRitual);
          }}
          placeholder={L('Whatever is sitting in your head right now, in any order.', 'এই মুহূর্তে মাথায় যা ঘুরছে, যেকোনো ক্রমে লিখুন।')}
          aria-label={L('Clear your mind', 'মন হালকা করুন')}
          style={{ width: '100%', minHeight: journalMinHeight, resize: 'vertical', fontSize: 14, padding: 12, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{L('Does this need action today?', 'এর জন্য কি আজ কিছু করতে হবে?')}</span>
          <button
            className={ritual.journal_action_needed === true ? undefined : 'btn-ghost'}
            aria-pressed={ritual.journal_action_needed === true}
            disabled={!journalDraft.trim()}
            style={{ fontSize: 13, padding: '4px 12px' }}
            onClick={() => {
              morningRitualApi.setJournalActionNeeded(true).then(setRitual);
              setSuggestOpen(true);
              morningRitualApi.suggestAction(journalDraft).then((r) => setSuggestDraft(r.suggestion));
            }}
          >
            {L('Yes', 'হ্যাঁ')}
          </button>
          <button
            className={ritual.journal_action_needed === false ? undefined : 'btn-ghost'}
            aria-pressed={ritual.journal_action_needed === false}
            disabled={!journalDraft.trim()}
            style={{ fontSize: 13, padding: '4px 12px' }}
            onClick={() => {
              setSuggestOpen(false);
              morningRitualApi.setJournalActionNeeded(false).then(setRitual);
            }}
          >
            {L('No, just noting', 'না, শুধু লিখে রাখছি')}
          </button>
        </div>
        {suggestOpen && (
          <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', textTransform: 'uppercase' }}>
              {L('Suggested next action', 'পরের কাজের পরামর্শ')}
            </div>
            <input value={suggestDraft} onChange={(e) => setSuggestDraft(e.target.value)} style={{ width: '100%', fontSize: 14, marginTop: 8, boxSizing: 'border-box' }} />
            <button
              className="btn-ghost"
              style={{ fontSize: 12, marginTop: 8 }}
              onClick={() => {
                const v = suggestDraft.trim();
                if (!v) return;
                setFirstMoveDraft(v);
                morningRitualApi.setFirstMove(v).then(setRitual);
                setSuggestOpen(false);
              }}
            >
              {L('Use as first move', 'প্রথম পদক্ষেপ করুন')}
            </button>
          </div>
        )}
        {!suggestOpen && ritual.journal_released && (
          <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {L("You don't need to solve everything right now — this stays saved.", 'এখনই সব সমাধান করতে হবে না — এটা সেভ থাকল।')}
          </p>
        )}
      </div>

      {/* ── Prime ────────────────────────────────────────────────── */}
      <div ref={primeSectionRef}>
        <SectionHead
          mark="4"
          done={ritual.prime_meditation || ritual.prime_visualization || ritual.prime_reading || !!ritual.prime_gratitude.trim()}
          title={L('PRIME', 'প্রাইম')}
          note={L('pick any', 'যেকোনোটা')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <Tile
            name={L('Meditate', 'ধ্যান')}
            sub={ritual.prime_meditation ? L('Done', 'শেষ') : medRunning ? `${medSecs}s` : L('90 s timer', '৯০ সেকেন্ড')}
            done={ritual.prime_meditation}
            active={primeOpen === 'meditate'}
            topColor="var(--habit-mind)"
            onClick={() => setPrimeOpen(primeOpen === 'meditate' ? null : 'meditate')}
          />
          <Tile
            name={L('Visualize', 'কল্পনা')}
            sub={L('the day, done', 'দিনটা, শেষ অবস্থায়')}
            done={ritual.prime_visualization}
            active={primeOpen === 'visualize'}
            topColor="var(--success)"
            onClick={() => {
              setPrimeOpen(primeOpen === 'visualize' ? null : 'visualize');
              if (!visualizeMarkedRef.current) {
                visualizeMarkedRef.current = true;
                morningRitualApi.markPrimeVisualization().then(setRitual);
              }
            }}
          />
          <Tile
            name={L('Read', 'পড়া')}
            sub={L('one page', 'এক পাতা')}
            done={ritual.prime_reading}
            active={primeOpen === 'read'}
            topColor={ACCENT}
            onClick={() => setPrimeOpen(primeOpen === 'read' ? null : 'read')}
          />
          <Tile
            name={L('Ground', 'স্থির হওয়া')}
            sub={L('feet, breath', 'পা, শ্বাস')}
            active={primeOpen === 'ground'}
            topColor="var(--warning)"
            onClick={() => setPrimeOpen(primeOpen === 'ground' ? null : 'ground')}
          />
        </div>

        {primeOpen && (
          <div style={{ ...card, marginTop: 8, padding: 12 }}>
            {primeOpen === 'meditate' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, flex: 1 }}>
                  {ritual.prime_meditation ? L('Done', 'শেষ') : medRunning ? `${medSecs}s ${L('remaining', 'বাকি')}` : L('90 seconds. Sit, eyes closed, let the timer keep time for you.', '৯০ সেকেন্ড। চোখ বন্ধ করে বসুন, সময়ের হিসাব টাইমার রাখবে।')}
                </p>
                {!ritual.prime_meditation && (
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 12 }}
                    onClick={() => {
                      if (medRunning) {
                        setMedRunning(false);
                        return;
                      }
                      setMedSecs(90);
                      setMedRunning(true);
                    }}
                  >
                    {medRunning ? L('Stop', 'থামান') : L('Start', 'শুরু')}
                  </button>
                )}
              </div>
            )}
            {primeOpen === 'visualize' && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{visualizeText}</p>}
            {primeOpen === 'read' && (
              <div>
                <p style={{ fontFamily: 'Georgia, "Noto Serif Bengali", serif', fontSize: 16, lineHeight: 1.6, margin: '0 0 8px' }}>{READING_LINES[readingIdx]}</p>
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
                  {L('Next line', 'পরের লাইন')}
                </button>
              </div>
            )}
            {primeOpen === 'ground' && (
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
                {L('Feel both feet on the floor. Three slow breaths. Then write one thing you are grateful for below.', 'দুই পা মেঝেতে অনুভব করুন। তিনবার ধীরে শ্বাস নিন। তারপর নিচে একটা কৃতজ্ঞতার কথা লিখুন।')}
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={gratitudeDraft}
            onChange={(e) => setGratitudeDraft(e.target.value)}
            onBlur={() => {
              if (gratitudeDraft.trim() !== ritual.prime_gratitude) morningRitualApi.setPrimeGratitude(gratitudeDraft).then(setRitual);
            }}
            placeholder={L("One thing you're grateful for", 'একটা কৃতজ্ঞতার কথা')}
            aria-label={L("One thing you're grateful for", 'একটা কৃতজ্ঞতার কথা')}
            style={{ flex: '1 1 200px', fontSize: 14, padding: '8px 12px' }}
          />
          <div style={{ display: 'flex', padding: 2, gap: 2, borderRadius: RADIUS.control, background: 'var(--surface-2)' }}>
            {INTENTION_OPTIONS.map((v) => {
              const on = ritual.prime_intention === v;
              return (
                <button
                  key={v}
                  aria-pressed={on}
                  onClick={() => morningRitualApi.setPrimeIntention(on ? null : v).then(setRitual)}
                  style={{ fontSize: 13, padding: '4px 8px', border: 'none', borderRadius: RADIUS.control, background: on ? 'var(--surface)' : 'transparent', fontWeight: on ? 700 : 400, color: on ? 'var(--text)' : 'var(--text-muted)', cursor: 'pointer' }}
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L('Spiritual practice', 'আধ্যাত্মিক চর্চা')}</span>
          <select
            value={ritual.prime_spiritual}
            onChange={(e) => morningRitualApi.setPrimeSpiritual(e.target.value as MorningSpiritual).then(setRitual)}
            style={{ fontSize: 12 }}
          >
            {SPIRITUAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 'OFF' ? 'Off' : v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── In motion (after Start) ─────────────────────────────── */}
      <div ref={startSectionRef}>
        {ritual.started_first_action_at !== null && (
          <div className="card-elevated" style={{ ...card, padding: 24, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <RitualRing progress={1} size={56} stroke={4} accent={ACCENT}>
                <Check size={24} color={ACCENT} />
              </RitualRing>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: ACCENT, marginBottom: 8 }}>IN MOTION</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {L('Time to first action', 'প্রথম কাজ পর্যন্ত সময়')}: {fmtKpi(ritual.kpi_seconds)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{L('Ritual complete — carry it into the day.', 'রিচুয়াল শেষ — দিনে নিয়ে চলুন।')}</div>
          </div>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
        This page supports routine and planning. It is not medical or mental-health care. If sleep, mood, or energy problems keep affecting your daily life, talk to a qualified healthcare professional.
      </p>
      {onViewTrend && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={onViewTrend} className="btn-ghost" style={{ fontSize: 12 }}>
            {L('View trends', 'ট্রেন্ড দেখুন')}
          </button>
        </div>
      )}

      {/* ── Ready bar: always at the bottom until the day is started ─ */}
      {ritual.started_first_action_at === null && (
        <div
          style={{
            position: 'sticky',
            bottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            boxShadow: 'var(--shadow-sm)',
            zIndex: 5,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L("Ready · today's outcome", "তৈরি · আজকের ফলাফল")}</div>
            <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{outcomeText}</div>
            {pendingTasks.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {L('Waiting in EXECUTE', 'EXECUTE-এ অপেক্ষায়')}: {pendingTasks.map((t) => t.text).join(' · ')}
              </div>
            )}
          </div>
          <button onClick={start} style={{ background: ACCENT, borderColor: ACCENT, color: 'var(--on-accent)', fontSize: 16, fontWeight: 700, padding: '12px 16px', flex: 'none', borderRadius: RADIUS.card }}>
            {L('Start the day →', 'দিন শুরু করুন →')}
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
          <span>{L('You have enough clarity. Start the day.', 'যথেষ্ট পরিষ্কার। দিন শুরু করুন।')}</span>
          <button onClick={start} style={{ background: ACCENT, borderColor: ACCENT, color: 'var(--on-accent)', fontSize: 12, padding: '4px 12px', flex: 'none' }}>
            {L('Start now', 'এখন শুরু')}
          </button>
        </div>
      )}
    </div>
  );
}
