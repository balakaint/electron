import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { NightClosure, nightClosureApi, Settings, settingsApi } from '../services/api';
import { useL } from '../i18n';
import { minutesUntil, nightSteps, nightWritten, Step } from '../ritualSteps';
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
// Fixed dark "ember" palette — always dark regardless of the active app
// theme, so it sits outside palette.test.ts's per-theme AAA sweep. Both
// `border` and `inkFaint` failed AA/UI-boundary contrast on `surface`
// (audit fix, 2026-09-21: border measured 1.29:1 against the 3:1 UI
// floor, inkFaint 2.79:1 against the 4.5:1 text floor, and inkFaint is
// real body/caption text at several sites, not decorative) — both
// lightened along the same hue/saturation until they cleared their
// floor with a small margin (same "walk in steps, stop at the first
// value that clears the bar" approach readableInk() uses elsewhere).
export const NC = {
  bg: '#17130f',
  surface: '#211a14',
  border: '#85674c',
  ink: '#ded0c0',
  inkMuted: '#a2917f',
  inkFaint: '#9b8874',
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
  last,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  placeholder: string;
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 0 : SPACE.md }}>
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
  const L = useL();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    settingsApi.get().then(setSettings).catch(() => setSettings(null));
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

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

  if (!nc) return <div style={{ color: NC.inkMuted }}>{L('Loading…', 'লোড হচ্ছে…')}</div>;

  const closed = nc.closed_at !== null;
  const steps = nightSteps(nc);
  const left = 4 - nightWritten(nc);
  const sleepHour = settings?.phase_sleep_start ?? null;
  const sleepIn = sleepHour === null ? null : minutesUntil(now, sleepHour);
  const sleepLabel =
    sleepHour === null
      ? ''
      : new Date(2000, 0, 1, sleepHour).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: SPACE.xxl, color: NC.ink }}>
      <div style={{ fontSize: TYPE_SIZE.sm, color: NC.inkMuted, marginBottom: SPACE.xs }}>
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap', marginBottom: SPACE.md }}>
        <h2 style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.medium, margin: 0, flex: 1 }}>
          {L('Close the day', 'দিন বন্ধ করুন')}
        </h2>
        {/* The one number this screen is racing: how long until the
            sleep phase the user set in Settings. Shown only inside six
            hours, where it is a deadline rather than trivia. */}
        {sleepIn !== null && (
          <span
            style={{
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
              letterSpacing: TRACKING.label,
              color: NC.ember,
              background: NC.emberSoft,
              border: `1px solid ${NC.border}`,
              borderRadius: RADIUS.pill,
              padding: `${SPACE.hair}px ${SPACE.sm}px`,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {L(`SLEEP ${sleepLabel} · ${fmtMins(sleepIn)} left`, `ঘুম ${sleepLabel} · ${fmtMins(sleepIn)} বাকি`)}
          </span>
        )}
      </div>

      <NcStepBar steps={steps} />

      <Section title={L('TODAY', 'আজ')} hint={L('Put it down so it stops following you.', 'লিখে রাখুন, যাতে মাথায় না ঘোরে।')}>
        <Field
          label={L('Where I stopped', 'কোথায় থামলাম')}
          value={whereStoppedDraft}
          onChange={setWhereStoppedDraft}
          onCommit={() => nightClosureApi.setWhereStopped(whereStoppedDraft).then(setNc)}
          placeholder={L('e.g. Buyer outreach — 3 contacts completed', 'যেমন: বায়ার আউটরিচ — ৩টা যোগাযোগ শেষ')}
        />
        <Field
          label={L('Unfinished', 'অসমাপ্ত')}
          value={unfinishedDraft}
          onChange={setUnfinishedDraft}
          onCommit={() => nightClosureApi.setUnfinished(unfinishedDraft).then(setNc)}
          placeholder={L("What's left hanging", 'যা ঝুলে রইল')}
          last
        />
      </Section>

      <Section
        title={L('TOMORROW', 'আগামীকাল')}
        badge={L('Shows in Morning Ritual', 'মর্নিং রিচুয়ালে দেখাবে')}
        hint={L('Decide now, so the morning starts with no decisions.', 'এখনই ঠিক করুন, যাতে সকালে ভাবতে না হয়।')}
      >
        <Field
          label={L("Tomorrow's outcome", 'কালকের ফলাফল')}
          value={tomorrowOutcomeDraft}
          onChange={setTomorrowOutcomeDraft}
          onCommit={() => nightClosureApi.setTomorrowOutcome(tomorrowOutcomeDraft).then(setNc)}
          placeholder={L('One thing that would make tomorrow a win', 'একটা জিনিস যা কালকে সফল করবে')}
        />
        <Field
          label={L("Tomorrow's first move", 'কালকের প্রথম পদক্ষেপ')}
          value={tomorrowActionDraft}
          onChange={setTomorrowActionDraft}
          onCommit={() => nightClosureApi.setTomorrowFirstAction(tomorrowActionDraft).then(setNc)}
          placeholder={L('The concrete first step', 'নির্দিষ্ট প্রথম ধাপ')}
          last
        />
      </Section>

      <button
        onClick={() => setShowMore((v) => !v)}
        style={{
          fontSize: TYPE_SIZE.xs,
          color: NC.inkMuted,
          background: 'none',
          border: 'none',
          padding: 0,
          margin: `0 0 ${SPACE.md}px`,
          display: 'block',
          cursor: 'pointer',
        }}
      >
        {showMore ? L('– Blocker or note', '– বাধা বা নোট') : L('+ Blocker or note (optional)', '+ বাধা বা নোট (ঐচ্ছিক)')}
      </button>
      {showMore && (
        <Section title={L('EXTRA', 'অতিরিক্ত')}>
          <Field
            label={L('Blocker', 'বাধা')}
            value={blockerDraft}
            onChange={setBlockerDraft}
            onCommit={() => nightClosureApi.setBlocker(blockerDraft).then(setNc)}
            placeholder={L('Optional', 'ঐচ্ছিক')}
          />
          <Field
            label={L('Note', 'নোট')}
            value={noteDraft}
            onChange={setNoteDraft}
            onCommit={() => nightClosureApi.setNote(noteDraft).then(setNc)}
            placeholder={L('Optional', 'ঐচ্ছিক')}
            last
          />
        </Section>
      )}

      <div
        style={{
          background: NC.surface,
          border: `1px solid ${closed ? NC.border : NC.ember}`,
          borderRadius: RADIUS.card,
          padding: SPACE.lg,
          marginBottom: SPACE.xl,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE_SIZE.xs, color: NC.inkMuted }}>{L('Close time', 'বন্ধের সময়')}</span>
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
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                border: 'none',
                borderRadius: RADIUS.control,
                background: NC.emberSoft,
                color: NC.ember,
                cursor: 'pointer',
              }}
            >
              {L('Now', 'এখন')}
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
            {L('Set', 'সেট')}
          </button>
          <span style={{ flex: 1 }} />
          {/* Closing is never blocked on empty fields — a half-written
              night still beats an unclosed one — but say what is left. */}
          {!closed && left > 0 && (
            <span style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint }}>
              {L(
                `${left} field${left === 1 ? '' : 's'} left — you can close anyway`,
                `${left}টা ঘর বাকি — তবুও বন্ধ করা যায়`
              )}
            </span>
          )}
        </div>

        <button
          onClick={() => {
            nightClosureApi.closeDay().then(setNc);
            setSavedNote(L('Saved — Morning Ritual will carry this forward.', 'সেভ হয়েছে — মর্নিং রিচুয়াল এটা সকালে দেখাবে।'));
          }}
          style={{
            width: '100%',
            padding: `${SPACE.md}px 0`,
            background: closed ? 'transparent' : NC.ember,
            border: `1px solid ${NC.ember}`,
            borderRadius: RADIUS.control,
            color: closed ? NC.ember : '#20130a',
            fontSize: TYPE_SIZE.sm,
            fontWeight: TYPE_WEIGHT.bold,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACE.xs,
          }}
        >
          {closed ? (
            <>
              <Check size={14} /> {L('Closed — close again to update', 'বন্ধ হয়েছে — আপডেট করতে আবার বন্ধ করুন')}
            </>
          ) : (
            L('Close the day →', 'দিন বন্ধ করুন →')
          )}
        </button>
        {savedNote && (
          <div style={{ fontSize: TYPE_SIZE.xs, color: NC.ember, marginTop: SPACE.sm, textAlign: 'center' }}>
            {savedNote}
          </div>
        )}
      </div>

      {/* Wind down: three short tools side by side instead of three
          collapsed rows inside a collapsed section — each one is a single
          Start button away, which is the point at this hour. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, marginBottom: SPACE.sm, flexWrap: 'wrap' }}>
        <b style={{ fontSize: TYPE_SIZE.sm, letterSpacing: TRACKING.wide }}>{L('WIND DOWN', 'শান্ত হওয়া')}</b>
        <span style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint }}>{L('Optional · pick one', 'ঐচ্ছিক · যেকোনো একটা')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: SPACE.sm }}>
        <ToolCard
          title={L('4-7-8 Breathe', '৪-৭-৮ শ্বাস')}
          sub={L('4 rounds · ~1 min', '৪ রাউন্ড · ~১ মিনিট')}
          running={breatheRunning}
          onToggle={toggleBreathe}
          startLabel={L('Start', 'শুরু')}
          stopLabel={L('Stop', 'থামুন')}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: RADIUS.pill,
              border: `2px solid ${NC.ember}`,
              background: NC.emberSoft,
              margin: `0 auto ${SPACE.sm}px`,
              transform: `scale(${breatheScale})`,
              transition: breatheRunning ? `transform ${breatheDur}s ease-in-out` : 'none',
            }}
          />
          <div style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium }}>{breathePhase}</div>
        </ToolCard>

        <ToolCard
          title={L('Cognitive Shuffle', 'কগনিটিভ শাফল')}
          sub={L('10 words · 1 min', '১০টা শব্দ · ১ মিনিট')}
          running={shuffleRunning}
          onToggle={toggleShuffle}
          startLabel={L('Start', 'শুরু')}
          stopLabel={L('Stop', 'থামুন')}
        >
          <div
            style={{
              fontFamily: 'Georgia, "Noto Serif Bengali", serif',
              fontStyle: 'italic',
              fontSize: TYPE_SIZE.md,
              minHeight: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {shuffleWord}
          </div>
          <div style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint }}>{L('Picture each word, let it drift.', 'প্রতিটা শব্দ কল্পনা করুন, ভেসে যেতে দিন।')}</div>
        </ToolCard>

        <ToolCard
          title={L('Muscle Release', 'পেশি শিথিল')}
          sub={L('7 groups · ~1 min', '৭টা অংশ · ~১ মিনিট')}
          running={pmrRunning}
          onToggle={togglePmr}
          startLabel={L('Start', 'শুরু')}
          stopLabel={L('Stop', 'থামুন')}
        >
          <div style={{ minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: SPACE.xs }}>
            {pmrGroup && <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.medium }}>{pmrGroup}</span>}
            <span style={{ fontSize: TYPE_SIZE.sm, color: NC.inkMuted }}>{pmrSub}</span>
          </div>
        </ToolCard>
      </div>

      <p style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint, marginTop: SPACE.lg, lineHeight: 1.6 }}>
        {L(
          "Still awake after a while? Don't check the time or push for it — calm, quiet wakefulness usually gets you there faster than trying hard to sleep. If this is a regular struggle, it's worth mentioning to a doctor.",
          'অনেকক্ষণ পরেও ঘুম আসছে না? সময় দেখবেন না, জোর করবেন না — শান্তভাবে জেগে থাকলে সাধারণত জোর করে ঘুমানোর চেয়ে তাড়াতাড়ি ঘুম আসে। এটা নিয়মিত সমস্যা হলে ডাক্তারকে জানানো ভালো।'
        )}
      </p>
    </div>
  );
}

function fmtMins(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

// The three night steps in the ember palette (the Discipline card draws
// the same steps in theme colours).
function NcStepBar({ steps }: { steps: Step[] }) {
  const L = useL();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        gap: SPACE.sm,
        marginBottom: SPACE.lg,
      }}
    >
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, minWidth: 0 }}>
          <span
            style={{
              height: 4,
              borderRadius: RADIUS.pill,
              background: s.state === 'done' ? NC.ember : s.state === 'now' ? NC.inkMuted : NC.border,
              opacity: s.state === 'next' ? 0.5 : 1,
            }}
          />
          <span
            style={{
              fontSize: TYPE_SIZE.xs,
              fontWeight: s.state === 'now' ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal,
              color: s.state === 'done' ? NC.ember : s.state === 'now' ? NC.ink : NC.inkFaint,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {s.state === 'done' ? '✓ ' : `${i + 1}. `}
            {L(s.en, s.bn)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  badge,
  hint,
  children,
}: {
  title: string;
  badge?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: NC.surface,
        border: `1px solid ${NC.border}`,
        borderRadius: RADIUS.card,
        padding: SPACE.lg,
        marginBottom: SPACE.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: hint ? SPACE.xs : SPACE.md, flexWrap: 'wrap' }}>
        <b style={{ fontSize: TYPE_SIZE.xs, letterSpacing: TRACKING.wide, color: NC.ember }}>{title}</b>
        {badge && (
          <span
            style={{
              fontSize: TYPE_SIZE.xs,
              color: NC.inkMuted,
              border: `1px solid ${NC.border}`,
              borderRadius: RADIUS.pill,
              padding: `0 ${SPACE.sm}px`,
            }}
          >
            ☀ {badge}
          </span>
        )}
      </div>
      {hint && <div style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint, marginBottom: SPACE.md }}>{hint}</div>}
      {children}
    </div>
  );
}

function ToolCard({
  title,
  sub,
  running,
  onToggle,
  startLabel,
  stopLabel,
  children,
}: {
  title: string;
  sub: string;
  running: boolean;
  onToggle: () => void;
  startLabel: string;
  stopLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: NC.surface,
        border: `1px solid ${running ? NC.ember : NC.border}`,
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
        textAlign: 'center',
      }}
    >
      <div>
        <div style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold }}>{title}</div>
        <div style={{ fontSize: TYPE_SIZE.xs, color: NC.inkFaint }}>{sub}</div>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      <button
        onClick={onToggle}
        style={{
          padding: `${SPACE.xs}px ${SPACE.md}px`,
          borderRadius: RADIUS.control,
          fontSize: TYPE_SIZE.sm,
          border: `1px solid ${running ? NC.ember : NC.border}`,
          background: running ? NC.emberSoft : 'transparent',
          color: running ? NC.ember : NC.inkMuted,
          cursor: 'pointer',
        }}
      >
        {running ? stopLabel : startLabel}
      </button>
    </div>
  );
}
