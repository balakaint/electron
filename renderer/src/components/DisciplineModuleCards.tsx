import { useEffect, useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import {
  MorningRitual,
  NightClosure,
  NightClosureNight,
  Settings,
  morningRitualApi,
  nightClosureApi,
  settingsApi,
} from '../services/api';
import { useL } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { Step, isEvening, minutesUntil, morningSteps, nightSteps, nightWritten } from '../ritualSteps';
import RitualRing from './RitualRing';

// The card row for the 3 guided Discipline modules (Zahid's 2026-09-14
// brainstorm), embedded in the Discipline tab (PlanReview.tsx ->
// DisciplineTab).
//
// Zahid's own framing for putting these here: the old flat Money/Health/
// Relation/Mind checklist "mainly regular chek kora hoy na" (isn't
// actually checked regularly) — so it and the whole separate Life
// Execution Board it powered were removed outright (his own call, after
// confirming that would also delete today's Win/Reflection notes, which
// had no other home). These 3 cards are what replaced it in the same
// spot.
//
// Redesign (2026-09-15, Zahid: "world class design ... 10 on 10"): the
// original v1 drew all 3 cards at equal visual weight — same size, same
// border style, differing only by accent hue — which meant the one
// REAL, clickable module (Morning Ritual) competed for attention with
// two inert placeholders. This pass makes that hierarchy explicit: the
// active module gets a tinted card, a ring-shaped progress/streak
// indicator, and a filled primary button; the "Coming soon" modules are
// pulled down to a single quiet row each.
//
// Second pass, same day (Zahid: "theam er sathe miss match"): v1 of this
// redesign gave Morning Ritual a FIXED amber accent regardless of the
// active app theme — on Energy theme (red accent) that amber card read
// as visually unrelated to the rest of the app, not as "this app's own
// module." Fixed by dropping the fixed per-module hex entirely and
// using the theme's own `--accent`/`--accent-light`/`--on-accent`
// tokens (already defined per-theme in themes.ts, and already the
// contrast-correct pair for text-on-fill in every theme) — so this card
// now matches whichever theme is active, the same as every other accent
// element in the app, instead of carrying its own fixed identity color.
// Rebuilt 2026-09-15 for the "Morning Activation" continuous-page
// rebuild (see MorningRitualFlow.tsx) — there is no `step` field to
// count against 7 anymore, so status/progress are read off which
// sections have actually been touched instead of a step index.
//
// Used to also render full-size (compact=false) for MorningRitualPanel's
// own 3-card 'home' screen — that screen was removed (2026-09-18, Zahid:
// "eta kaj e ashbe na") once the Discipline tab's Resume/History buttons
// started deep-linking straight past it, leaving this the only caller.
// The full-size styling went with it rather than staying as a dead
// branch no one could reach.
const PROGRESS_FIELDS: (keyof MorningRitual)[] = [
  'today_outcome',
  'first_move',
  'energy',
  'mood',
  'reset_breathe',
  'reset_move',
  'reset_daylight',
  'journal_text',
];

export function statusLine(r: MorningRitual): string {
  if (r.completed) return 'Completed today';
  if (r.started_at === null) return 'Not started today';
  const modeLabel = r.energy ? { gentle: 'Gentle start', standard: 'Standard start', fast: 'Fast start' }[r.morning_mode] : null;
  return modeLabel ?? 'In progress';
}

function ringProgress(r: MorningRitual | null): number {
  if (!r || r.started_at === null) return 0;
  if (r.completed) return 1;
  const done = PROGRESS_FIELDS.filter((f) => !!r[f]).length;
  // Capped below 1 — only Start Now (r.completed) means "done".
  return Math.min(0.9, done / PROGRESS_FIELDS.length);
}

function RingGlyph({ r }: { r: MorningRitual | null }) {
  if (r?.completed) return <Check size={14} />;
  return <Sun size={14} />;
}

// A row of step segments with their names under them — the same
// progress language as PLAN's day strip and the flows' own headers.
function StepBar({ steps, color }: { steps: Step[]; color: string }) {
  const L = useL();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: SPACE.xs }}>
      {steps.map((s) => (
        <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, minWidth: 0 }}>
          <span
            style={{
              height: 4,
              borderRadius: RADIUS.pill,
              background:
                s.state === 'done' ? color : s.state === 'now' ? `color-mix(in srgb, ${color} 45%, var(--surface))` : PROGRESS_TRACK_SOFT,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: s.state === 'now' ? 700 : 400,
              color: s.state === 'next' ? 'var(--text-muted)' : 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {L(s.en, s.bn)}
          </span>
        </div>
      ))}
    </div>
  );
}

function fmtMins(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function MorningCard({
  today,
  streak,
  onStart,
  onHistory,
}: {
  today: MorningRitual | null;
  streak: number;
  onStart: () => void;
  onHistory: () => void;
}) {
  const L = useL();
  const steps = today ? morningSteps(today) : null;
  const done = steps ? steps.filter((s) => s.state === 'done').length : 0;
  const next = steps?.find((s) => s.state === 'now');
  // A finished ritual keeps only its header row: the bar and the carried
  // outcome are for the morning you are still in.
  const carried = today && !today.completed && today.today_outcome.trim() !== '' ? today : null;

  return (
    <div
      className="card-elevated"
      style={{
        background: 'var(--accent-light)',
        border: '1px solid var(--accent)',
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        marginBottom: SPACE.md,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <RitualRing progress={ringProgress(today)} size={40} stroke={3} accent="var(--accent)">
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            <RingGlyph r={today} />
          </span>
        </RitualRing>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{L('Morning Ritual', 'মর্নিং রিচুয়াল')}</span>
            {streak > 0 && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--on-accent)',
                  background: 'var(--accent)',
                  borderRadius: RADIUS.pill,
                  padding: `0 ${SPACE.sm}px`,
                }}
              >
                {L(`${streak}d streak`, `${streak} দিন টানা`)}
              </span>
            )}
          </div>
          {today && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: SPACE.xs }}>
              {statusLine(today)}
              {today.wake_up_time ? L(` · woke ${today.wake_up_time}`, ` · ${today.wake_up_time}-এ উঠেছেন`) : ''}
              {next && !today.completed ? L(` · next: ${next.en}`, ` · এরপর: ${next.bn}`) : ''}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, flex: 'none' }}>
          <button
            onClick={onStart}
            disabled={!today}
            style={{
              background: 'var(--accent)',
              borderColor: 'var(--accent)',
              color: 'var(--on-accent)',
              fontSize: 12,
              fontWeight: 600,
              padding: `${SPACE.sm}px ${SPACE.lg}px`,
            }}
          >
            {today?.completed ? L('Review', 'দেখুন') : today?.started_at ? L('Resume', 'চালিয়ে যান') : L('Start', 'শুরু')}
          </button>
          <button onClick={onHistory} className="btn-ghost" style={{ fontSize: 12 }}>
            {L('History', 'ইতিহাস')}
          </button>
        </div>
      </div>

      {steps && !today?.completed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <StepBar steps={steps} color="var(--accent)" />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flex: 'none' }}>
            {done}/{steps.length}
          </span>
        </div>
      )}

      {/* What last night's closure handed to this morning — the one line
          that ties the two rituals together. */}
      {carried && (
        <div
          style={{
            display: 'flex',
            gap: SPACE.sm,
            padding: SPACE.sm,
            borderRadius: RADIUS.control,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ color: 'var(--text-muted)', display: 'flex', paddingTop: SPACE.hair }}>
            <Moon size={14} />
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: SPACE.hair, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {carried.carried_from_date ? L("From last night's closure", 'কাল রাতের ক্লোজার থেকে') : L("Today's outcome", 'আজকের লক্ষ্য')}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{carried.today_outcome}</span>
            {carried.first_move.trim() !== '' && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {L('First move: ', 'প্রথম কাজ: ')}
                {carried.first_move}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function NightDots({ nights }: { nights: NightClosureNight[] }) {
  const L = useL();
  const closed = nights.filter((n) => n.closed).length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
      <div role="img" aria-label={`Closed ${closed} of the last ${nights.length} nights`} style={{ display: 'flex', gap: SPACE.xs }}>
        {nights.map((n, i) => {
          const tonight = i === nights.length - 1;
          return (
            <span
              key={n.day}
              title={`${new Date(`${n.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}: ${n.closed ? 'closed' : tonight ? 'tonight' : 'not closed'}`}
              style={{
                width: 12,
                height: 12,
                borderRadius: RADIUS.pill,
                boxSizing: 'border-box',
                border: `2px solid ${n.closed ? 'var(--accent)' : tonight ? 'var(--text-muted)' : 'var(--border)'}`,
                background: n.closed ? 'var(--accent)' : 'transparent',
              }}
            />
          );
        })}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L(`${closed} of last ${nights.length} nights`, `গত ${nights.length} রাতের ${closed}টি`)}</span>
    </div>
  );
}

function NightCard({
  tonight,
  nights,
  sleepIn,
  evening,
  opensAt,
  onOpen,
}: {
  tonight: NightClosure | null;
  nights: NightClosureNight[];
  sleepIn: number | null;
  evening: boolean;
  opensAt: string;
  onOpen: () => void;
}) {
  const L = useL();
  const closed = !!tonight?.closed_at;
  const written = tonight ? nightWritten(tonight) : 0;
  const steps = tonight ? nightSteps(tonight) : null;
  const lastNight = nights.length >= 2 ? nights[nights.length - 2] : null;

  // Outside the evening this is one quiet line: last night's result and
  // when tonight's opens. The full card belongs to the hours it is for.
  if (!evening && !closed) {
    return (
      <div
        className="card-elevated"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.md,
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          padding: SPACE.md,
          marginBottom: SPACE.sm,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <span style={{ color: 'var(--text-muted)', flex: 'none', display: 'flex' }}>
          <Moon size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{L('Night Closure', 'নাইট ক্লোজার')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: SPACE.hair }}>
            {lastNight
              ? lastNight.closed
                ? L('Closed last night', 'কাল রাতে বন্ধ হয়েছে')
                : L('Not closed last night', 'কাল রাতে বন্ধ হয়নি')
              : ''}
            {L(` · opens ${opensAt}`, ` · ${opensAt}-এ খুলবে`)}
          </div>
        </div>
        <button onClick={onOpen} className="btn-ghost" style={{ fontSize: 12, fontWeight: 600, flex: 'none' }}>
          {L('Open', 'খুলুন')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="card-elevated"
      style={{
        border: `1px solid ${closed ? 'var(--border)' : 'var(--accent)'}`,
        background: closed ? 'var(--surface)' : 'var(--accent-light)',
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        marginBottom: SPACE.md,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ color: 'var(--accent)', display: 'flex' }}>{closed ? <Check size={16} /> : <Moon size={16} />}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: closed ? 'var(--text)' : 'var(--accent)' }}>{L('Night Closure', 'নাইট ক্লোজার')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {closed ? L('· closed tonight', '· আজ রাতে বন্ধ') : L(`· ${written} of 4 written`, `· ৪টির ${written}টি লেখা`)}
        </span>
        <span style={{ flex: 1 }} />
        {!closed && sleepIn !== null && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--on-accent)',
              background: 'var(--accent)',
              padding: `0 ${SPACE.sm}px`,
              borderRadius: RADIUS.pill,
              whiteSpace: 'nowrap',
            }}
          >
            {L(`Sleep in ${fmtMins(sleepIn)}`, `ঘুম ${fmtMins(sleepIn)} পরে`)}
          </span>
        )}
      </div>

      {steps && !closed && <StepBar steps={steps} color="var(--accent)" />}

      {tonight && (tonight.where_stopped || tonight.tomorrow_outcome) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: SPACE.sm }}>
          {[
            [L('TODAY', 'আজ'), tonight.where_stopped, L('Where you stopped — not written', 'কোথায় থেমেছেন — লেখা হয়নি')],
            [L('TOMORROW', 'কাল'), tonight.tomorrow_outcome, L('Outcome not set', 'লক্ষ্য ঠিক হয়নি')],
          ].map(([label, text, empty]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: SPACE.hair,
                minWidth: 0,
                padding: SPACE.sm,
                borderRadius: RADIUS.control,
                background: 'var(--surface)',
                border: `1px ${text ? 'solid' : 'dashed'} var(--border)`,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)' }}>{label}</span>
              <span
                style={{
                  fontSize: 12,
                  color: text ? 'var(--text)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {text || empty}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        {nights.length > 0 && <NightDots nights={nights} />}
        <span style={{ flex: 1 }} />
        <button
          onClick={onOpen}
          style={{
            background: closed ? 'transparent' : 'var(--accent)',
            borderColor: 'var(--accent)',
            color: closed ? 'var(--accent)' : 'var(--on-accent)',
            fontSize: 12,
            fontWeight: 600,
            padding: `${SPACE.sm}px ${SPACE.lg}px`,
            flex: 'none',
          }}
        >
          {closed ? L('Review', 'দেখুন') : written > 0 ? L('Continue ›', 'চালিয়ে যান ›') : L('Open ›', 'খুলুন ›')}
        </button>
      </div>
    </div>
  );
}

function hourLabel(h: number): string {
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function DisciplineModuleCards({
  onStart,
  onHistory,
  onOpenNightClosure,
}: {
  onStart: () => void;
  onHistory: () => void;
  onOpenNightClosure: () => void;
}) {
  const [today, setToday] = useState<MorningRitual | null>(null);
  const [streak, setStreak] = useState(0);
  const [tonight, setTonight] = useState<NightClosure | null>(null);
  const [nights, setNights] = useState<NightClosureNight[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    morningRitualApi.today().then(setToday);
    morningRitualApi.trend().then((t) => setStreak(t.streak));
    nightClosureApi.today().then(setTonight);
    nightClosureApi.recent(7).then(setNights).catch(() => setNights([]));
    settingsApi.get().then(setSettings);
  }, []);

  // A minute is fine-grained enough for "sleep in 40m" and for the card
  // order to change at the evening boundary.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Evening (evening start until morning start) leads with Night
  // Closure; the rest of the day with Morning Ritual. Without settings
  // yet, the order it has always had.
  const evening = settings ? isEvening(now.getHours(), settings.phase_evening_start, settings.phase_morning_start) : false;
  const sleepIn = settings && evening ? minutesUntil(now, settings.phase_sleep_start) : null;

  const morning = <MorningCard today={today} streak={streak} onStart={onStart} onHistory={onHistory} />;
  const night = (
    <NightCard
      tonight={tonight}
      nights={nights}
      sleepIn={sleepIn}
      evening={evening}
      opensAt={hourLabel(settings?.phase_evening_start ?? 19)}
      onOpen={onOpenNightClosure}
    />
  );

  return (
    <div>
      {evening ? night : morning}
      {evening ? morning : night}

      {[{ label: 'Exercise', icon: '◆', desc: "Today's set, logged and tracked." }].map((m) => (
        <div
          key={m.label}
          className="card-elevated"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            padding: 8,
            marginBottom: 8,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ fontSize: 16, color: 'var(--text-faint)', flex: 'none' }}>{m.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{m.label}</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-faint)',
              border: '1px solid var(--border)',
              borderRadius: RADIUS.pill,
              padding: '0 8px',
              flex: 'none',
            }}
          >
            Soon
          </span>
        </div>
      ))}
    </div>
  );
}
