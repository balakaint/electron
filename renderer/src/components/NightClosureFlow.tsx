import { useEffect, useRef, useState } from 'react';
import { NightClosure, nightClosureApi } from '../services/api';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';
import breatheAudioUrl from '../assets/audio/breath.mp3';

// Night Closure — the evening counterpart to MorningRitualFlow.tsx,
// converted from Zahid's own HTML/JS mockup (night-closure.html,
// localStorage key `lifeos_night_closure`) to this app's real per-day
// persistence and component conventions (commit-on-blur text, immediate
// for the close-time input — same as MorningRitualFlow's Wake up
// field).
//
// The four top fields (Where I stopped / Unfinished / Tomorrow's
// Outcome / Tomorrow's First Move) are exactly what
// engine/morning_ritual.py reads back the next morning as "Carried
// From" — see that module's _apply_carry_forward.
//
// Deliberately its OWN fixed warm/dim/no-blue palette, not this app's
// six --theme tokens — Zahid's own instruction, since blue light
// suppresses melatonin and this screen exists to be looked at right
// before sleep. Scoped to this component only (plain style values, not
// global CSS vars), so it never touches the active app theme.
export const NC = {
  bg: '#17130f',
  surface: '#211a14',
  border: '#3a2d21',
  ink: '#ded0c0',
  inkMuted: '#a2917f',
  inkFaint: '#6e5f4f',
  ember: '#cc7a42',
  emberSoft: 'rgba(204,122,66,.14)',
};

const BREATHE_PHASES: { name: string; dur: number; scale: number }[] = [
  { name: 'Inhale', dur: 4, scale: 1 },
  { name: 'Hold', dur: 7, scale: 1 },
  { name: 'Exhale', dur: 8, scale: 0.6 },
];
const BREATHE_CYCLES = 4;

const SHUFFLE_WORDS = [
  'lantern', 'pebble', 'maple leaf', 'teacup', 'violin', 'meadow', 'compass', 'seashell',
  'candle', 'willow', 'harbor', 'blanket', 'lighthouse', 'acorn', 'kite', 'hammock', 'moss',
  'feather', 'canoe', 'orchard', 'ribbon', 'snowflake', 'porch swing', 'river stone',
  'paper boat', 'clover', 'birdhouse', 'wool sweater', 'apple crate', 'wind chime',
];
const SHUFFLE_COUNT = 10;
const SHUFFLE_INTERVAL_MS = 6000;

const PMR_GROUPS = ['Feet', 'Calves', 'Thighs', 'Hands & arms', 'Shoulders', 'Neck', 'Face'];
const PMR_TENSE_MS = 5000;
const PMR_RELEASE_MS = 3000;

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function shuffledPick<T>(arr: T[], n: number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

function Field({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder: string;
}) {
  return (
    <div style={{ marginBottom: SPACE.md }}>
      <label
        style={{
          display: 'block',
          fontSize: TYPE_SIZE.xs,
          color: NC.inkFaint,
          marginBottom: SPACE.xs,
          letterSpacing: TRACKING.label,
        }}
      >
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: NC.bg,
          border: `1px solid ${NC.border}`,
          borderRadius: RADIUS.control,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          fontSize: TYPE_SIZE.base,
          color: NC.ink,
        }}
      />
    </div>
  );
}

function ToolItem({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${NC.border}`, padding: `${SPACE.md}px 0` }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: TYPE_SIZE.sm,
          color: open ? NC.ink : NC.inkMuted,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        {title}
      </button>
      {open && <div style={{ marginTop: SPACE.md, textAlign: 'center', padding: `${SPACE.sm}px 0` }}>{children}</div>}
    </div>
  );
}

export default function NightClosureFlow() {
  const [nc, setNc] = useState<NightClosure | null>(null);
  const [whereStoppedDraft, setWhereStoppedDraft] = useState('');
  const [unfinishedDraft, setUnfinishedDraft] = useState('');
  const [tomorrowOutcomeDraft, setTomorrowOutcomeDraft] = useState('');
  const [tomorrowActionDraft, setTomorrowActionDraft] = useState('');
  const [blockerDraft, setBlockerDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [closeTimeDraft, setCloseTimeDraft] = useState(nowHHMM());
  const [savedNote, setSavedNote] = useState('');

  useEffect(() => {
    nightClosureApi.today().then((row) => {
      setNc(row);
      setWhereStoppedDraft(row.where_stopped);
      setUnfinishedDraft(row.unfinished);
      setTomorrowOutcomeDraft(row.tomorrow_outcome);
      setTomorrowActionDraft(row.tomorrow_first_action);
      setBlockerDraft(row.optional_blocker);
      setNoteDraft(row.optional_note);
      if (row.optional_blocker || row.optional_note) setShowMore(true);
      if (row.close_time) {
        setCloseTimeDraft(row.close_time);
      } else {
        // Auto-stamp a default the first time this is opened tonight —
        // still freely editable below (Zahid's own call: default now,
        // override allowed).
        const t = nowHHMM();
        setCloseTimeDraft(t);
        nightClosureApi.setCloseTime(t).then(setNc);
      }
    });
  }, []);

  // ── 4-7-8 Breathe ─────────────────────────────────────────────────
  const [breathePhase, setBreathePhase] = useState('Ready');
  const [breatheScale, setBreatheScale] = useState(0.6);
  const [breatheDur, setBreatheDur] = useState(0);
  const [breatheRunning, setBreatheRunning] = useState(false);
  const breatheTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breatheState = useRef({ cycle: 0, idx: 0 });
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

  const stepBreathe = () => {
    const s = breatheState.current;
    if (s.cycle >= BREATHE_CYCLES) {
      setBreathePhase('Done');
      setBreatheRunning(false);
      breatheAudio.current?.pause();
      if (breatheAudio.current) breatheAudio.current.currentTime = 0;
      return;
    }
    const p = BREATHE_PHASES[s.idx];
    setBreathePhase(`${p.name} · ${p.dur}s`);
    setBreatheDur(p.dur);
    setBreatheScale(p.scale);
    breatheTimeout.current = setTimeout(() => {
      s.idx++;
      if (s.idx >= BREATHE_PHASES.length) {
        s.idx = 0;
        s.cycle++;
      }
      stepBreathe();
    }, p.dur * 1000);
  };

  const toggleBreathe = () => {
    if (breatheRunning) {
      setBreatheRunning(false);
      if (breatheTimeout.current) clearTimeout(breatheTimeout.current);
      setBreathePhase('Paused');
      breatheAudio.current?.pause();
      return;
    }
    if (breathePhase === 'Done') {
      breatheState.current = { cycle: 0, idx: 0 };
    }
    setBreatheRunning(true);
    breatheAudio.current?.play().catch((e) => console.error('breathe audio play failed:', e));
    stepBreathe();
  };

  // ── Cognitive Shuffle ────────────────────────────────────────────
  const [shuffleWord, setShuffleWord] = useState('—');
  const [shuffleRunning, setShuffleRunning] = useState(false);
  const shuffleInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const shuffleState = useRef({ sequence: [] as string[], pos: 0 });

  const showNextShuffleWord = () => {
    const s = shuffleState.current;
    if (s.pos >= s.sequence.length) {
      setShuffleWord('— drifting —');
      setShuffleRunning(false);
      if (shuffleInterval.current) clearInterval(shuffleInterval.current);
      return;
    }
    setShuffleWord(s.sequence[s.pos]);
    s.pos++;
  };

  const toggleShuffle = () => {
    if (shuffleRunning) {
      setShuffleRunning(false);
      if (shuffleInterval.current) clearInterval(shuffleInterval.current);
      return;
    }
    shuffleState.current = { sequence: shuffledPick(SHUFFLE_WORDS, SHUFFLE_COUNT), pos: 0 };
    setShuffleRunning(true);
    showNextShuffleWord();
    shuffleInterval.current = setInterval(showNextShuffleWord, SHUFFLE_INTERVAL_MS);
  };

  // ── Muscle Release (PMR) ─────────────────────────────────────────
  const [pmrGroup, setPmrGroup] = useState('');
  const [pmrSub, setPmrSub] = useState('Ready');
  const [pmrRunning, setPmrRunning] = useState(false);
  const pmrTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pmrIdx = useRef(0);

  const stepPmr = () => {
    if (pmrIdx.current >= PMR_GROUPS.length) {
      setPmrGroup('');
      setPmrSub('Notice your whole body, relaxed.');
      setPmrRunning(false);
      return;
    }
    setPmrGroup(PMR_GROUPS[pmrIdx.current]);
    setPmrSub('Tense for 5s…');
    pmrTimeout.current = setTimeout(() => {
      setPmrSub('…and release.');
      pmrTimeout.current = setTimeout(() => {
        pmrIdx.current++;
        stepPmr();
      }, PMR_RELEASE_MS);
    }, PMR_TENSE_MS);
  };

  const togglePmr = () => {
    if (pmrRunning) {
      setPmrRunning(false);
      if (pmrTimeout.current) clearTimeout(pmrTimeout.current);
      setPmrSub('Paused');
      return;
    }
    if (pmrIdx.current >= PMR_GROUPS.length) pmrIdx.current = 0;
    setPmrRunning(true);
    stepPmr();
  };

  useEffect(
    () => () => {
      if (breatheTimeout.current) clearTimeout(breatheTimeout.current);
      if (shuffleInterval.current) clearInterval(shuffleInterval.current);
      if (pmrTimeout.current) clearTimeout(pmrTimeout.current);
      breatheAudio.current?.pause();
    },
    []
  );

  if (!nc) return <div style={{ color: NC.inkMuted }}>Loading…</div>;

  const closed = nc.closed_at !== null;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: SPACE.xxl, color: NC.ink }}>
      <div style={{ fontSize: TYPE_SIZE.sm, color: NC.inkMuted, marginBottom: SPACE.xs }}>
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      <h1 style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.medium, margin: `0 0 ${SPACE.md}px` }}>
        Close the Day
      </h1>

      <div
        style={{
          background: NC.surface,
          border: `1px solid ${NC.border}`,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
          marginBottom: SPACE.lg,
        }}
      >
        <Field
          label="Where I stopped"
          value={whereStoppedDraft}
          onChange={setWhereStoppedDraft}
          onCommit={() => nightClosureApi.setWhereStopped(whereStoppedDraft).then(setNc)}
          placeholder="e.g. Buyer outreach — 3 contacts completed"
        />
        <Field
          label="Unfinished"
          value={unfinishedDraft}
          onChange={setUnfinishedDraft}
          onCommit={() => nightClosureApi.setUnfinished(unfinishedDraft).then(setNc)}
          placeholder="What's left hanging"
        />
        <Field
          label="Tomorrow's Outcome"
          value={tomorrowOutcomeDraft}
          onChange={setTomorrowOutcomeDraft}
          onCommit={() => nightClosureApi.setTomorrowOutcome(tomorrowOutcomeDraft).then(setNc)}
          placeholder="One thing that would make tomorrow a win"
        />
        <Field
          label="Tomorrow's First Move"
          value={tomorrowActionDraft}
          onChange={setTomorrowActionDraft}
          onCommit={() => nightClosureApi.setTomorrowFirstAction(tomorrowActionDraft).then(setNc)}
          placeholder="The concrete first step"
        />

        <button
          onClick={() => setShowMore((v) => !v)}
          style={{
            fontSize: TYPE_SIZE.xs,
            color: NC.inkFaint,
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: SPACE.md,
            display: 'block',
            cursor: 'pointer',
          }}
        >
          {showMore ? '– Blocker / note' : '+ Blocker / note'}
        </button>
        {showMore && (
          <>
            <Field
              label="Blocker"
              value={blockerDraft}
              onChange={setBlockerDraft}
              onCommit={() => nightClosureApi.setBlocker(blockerDraft).then(setNc)}
              placeholder="Optional"
            />
            <Field
              label="Note"
              value={noteDraft}
              onChange={setNoteDraft}
              onCommit={() => nightClosureApi.setNote(noteDraft).then(setNc)}
              placeholder="Optional"
            />
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE_SIZE.xs, color: NC.inkMuted }}>Close time</span>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <input
              type="time"
              value={closeTimeDraft}
              onChange={(e) => setCloseTimeDraft(e.target.value)}
              style={{
                fontSize: TYPE_SIZE.xs,
                padding: `${SPACE.xs}px 34px ${SPACE.xs}px ${SPACE.sm}px`,
                background: NC.bg,
                border: `1px solid ${NC.border}`,
                borderRadius: RADIUS.control,
                color: NC.ink,
                colorScheme: 'dark',
              }}
            />
            <button
              onClick={() => setCloseTimeDraft(nowHHMM())}
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
                background: NC.emberSoft,
                color: NC.ember,
                cursor: 'pointer',
              }}
            >
              Now
            </button>
          </div>
          <button
            onClick={() => nightClosureApi.setCloseTime(closeTimeDraft).then(setNc)}
            disabled={!closeTimeDraft}
            style={{
              fontSize: TYPE_SIZE.xs,
              color: NC.inkMuted,
              background: 'none',
              border: `1px solid ${NC.border}`,
              borderRadius: RADIUS.control,
              padding: `${SPACE.xs}px ${SPACE.sm}px`,
              cursor: closeTimeDraft ? 'pointer' : 'default',
            }}
          >
            Set
          </button>
        </div>

        <button
          onClick={() => {
            nightClosureApi.closeDay().then(setNc);
            setSavedNote('Saved — Morning Activation will carry this forward.');
          }}
          style={{
            width: '100%',
            padding: `${SPACE.md + 1}px 0`,
            background: NC.ember,
            border: `1px solid ${NC.ember}`,
            borderRadius: RADIUS.control,
            color: '#20130a',
            fontSize: TYPE_SIZE.sm,
            fontWeight: TYPE_WEIGHT.bold,
            cursor: 'pointer',
          }}
        >
          {closed ? 'Closed ✓' : 'Close the day →'}
        </button>
        {savedNote && (
          <div style={{ fontSize: TYPE_SIZE.xs, color: NC.ember, marginTop: SPACE.sm, textAlign: 'center' }}>
            {savedNote}
          </div>
        )}
      </div>

      <details style={{ borderTop: `1px solid ${NC.border}`, borderBottom: `1px solid ${NC.border}` }}>
        <summary
          style={{
            padding: `${SPACE.md}px ${SPACE.hair}px`,
            cursor: 'pointer',
            listStyle: 'none',
            display: 'flex',
            alignItems: 'baseline',
            gap: SPACE.sm,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: NC.ember, fontSize: TYPE_SIZE.base }}>+</span>
          <b style={{ fontSize: TYPE_SIZE.sm }}>WIND DOWN</b>
          <span style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint }}>
            4-7-8 Breathe · Cognitive Shuffle · Muscle Release
          </span>
        </summary>

        <div style={{ padding: `${SPACE.xs}px ${SPACE.hair}px ${SPACE.lg}px` }}>
          <ToolItem title="4-7-8 Breathe">
            <div style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.medium, marginBottom: SPACE.md }}>
              {breathePhase}
            </div>
            <div
              style={{
                width: 70,
                height: 70,
                borderRadius: RADIUS.pill,
                border: `2px solid ${NC.ember}`,
                background: NC.emberSoft,
                margin: `0 auto ${SPACE.lg}px`,
                transform: `scale(${breatheScale})`,
                transition: breatheRunning ? `transform ${breatheDur}s ease-in-out` : 'none',
              }}
            />
            <button onClick={toggleBreathe} style={toolBtnStyle}>
              {breatheRunning ? 'Stop' : 'Start'}
            </button>
          </ToolItem>

          <ToolItem title="Cognitive Shuffle">
            <p style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint, margin: `0 0 ${SPACE.md}px` }}>
              Picture each word for a few seconds, then let it drift to the next.
            </p>
            <div
              style={{
                fontFamily: 'Georgia, "Noto Serif Bengali", serif',
                fontStyle: 'italic',
                fontSize: TYPE_SIZE.md,
                marginBottom: SPACE.lg,
                minHeight: '1.3em',
              }}
            >
              {shuffleWord}
            </div>
            <button onClick={toggleShuffle} style={toolBtnStyle}>
              {shuffleRunning ? 'Stop' : 'Start'}
            </button>
          </ToolItem>

          <ToolItem title="Muscle Release">
            <div style={{ fontSize: TYPE_SIZE.base, marginBottom: SPACE.md, minHeight: '2.6em' }}>
              {pmrGroup && <span style={{ fontWeight: TYPE_WEIGHT.medium, display: 'block', marginBottom: SPACE.xs }}>{pmrGroup}</span>}
              {pmrSub}
            </div>
            <button onClick={togglePmr} style={toolBtnStyle}>
              {pmrRunning ? 'Stop' : 'Start'}
            </button>
          </ToolItem>

          <p style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint, marginTop: SPACE.lg, lineHeight: 1.6 }}>
            Still awake after a while? Don't check the time or push for it — calm, quiet wakefulness usually gets
            you there faster than trying hard to sleep. If this is a regular struggle, it's worth mentioning to a
            doctor.
          </p>
        </div>
      </details>
    </div>
  );
}

const toolBtnStyle: React.CSSProperties = {
  padding: `${SPACE.sm}px ${SPACE.lg}px`,
  borderRadius: RADIUS.control,
  fontSize: TYPE_SIZE.sm,
  border: `1px solid ${NC.border}`,
  background: 'transparent',
  color: NC.inkMuted,
  cursor: 'pointer',
};
