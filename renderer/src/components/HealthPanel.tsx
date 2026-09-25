import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, BellOff, Check, Minus, Pencil, Plus, Settings2, ShoppingCart, TrendingUp } from 'lucide-react';
import {
  HealthActivity,
  HealthCell,
  HealthGoal,
  HealthProfileInput,
  HealthState,
  healthApi,
} from '../services/api';
import { useL, useLang } from '../i18n';
import HealthEditor from './HealthEditor';
import HealthProgress from './HealthProgress';
import HealthRemindersPanel from './HealthRemindersPanel';
import HealthShopping from './HealthShopping';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// Health — Panel 2 host, same docking as Morning Ritual / Night Closure
// (App.tsx owns whether it is mounted). Two screens: set-up (no profile
// yet, or ⚙) and the plan itself.
//
// The plan is four weeks but the page leads with ONE week: a month of
// meals at once is a wall, a week is doable. The month stays in view as
// a thin strip above it so consistency across the whole plan is never
// out of sight. The range switch widens the grid to 2, 3 or 4 weeks for
// anyone who wants the longer view.

const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_BN = ['সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি', 'রবি'];

const label: React.CSSProperties = {
  fontSize: TYPE_SIZE.xs,
  fontWeight: TYPE_WEIGHT.bold,
  letterSpacing: TRACKING.wide,
};
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  padding: SPACE.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.md,
};
const ghostBtn: React.CSSProperties = {
  height: 28,
  padding: `0 ${SPACE.md}px`,
  fontSize: TYPE_SIZE.xs,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: SPACE.xs,
  cursor: 'pointer',
};

function cellColor(c: HealthCell, today: string): string {
  if (c.future) return 'var(--surface-2)';
  if (c.on_plan) return 'var(--success)';
  if (c.day === today) return 'color-mix(in srgb, var(--success) 25%, var(--surface))';
  if (c.meals > 0 || c.moves_done > 0) return 'color-mix(in srgb, var(--success) 45%, var(--surface))';
  return 'color-mix(in srgb, var(--border) 50%, var(--surface))';
}

// ── Set-up ───────────────────────────────────────────────────────────

function Choice<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { v: T; title: string; sub?: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: SPACE.sm }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            onClick={() => onPick(o.v)}
            aria-pressed={on}
            style={{
              padding: `${SPACE.md}px ${SPACE.sm}px`,
              borderRadius: RADIUS.card,
              border: `${on ? 2 : 1}px solid ${on ? 'var(--success)' : 'var(--border)'}`,
              background: on ? 'color-mix(in srgb, var(--success) 10%, var(--surface))' : 'var(--surface)',
              color: 'var(--text)',
              display: 'flex',
              flexDirection: 'column',
              gap: SPACE.hair,
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold }}>{o.title}</span>
            {o.sub && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

function NumField({ name, unit, value, onChange }: { name: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
      {name}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          padding: `0 ${SPACE.md}px`,
          border: '1px solid var(--border)',
          borderRadius: RADIUS.control,
          background: 'var(--surface)',
        }}
      >
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            fontSize: TYPE_SIZE.base,
            fontWeight: TYPE_WEIGHT.medium,
            color: 'var(--text)',
            padding: 0,
          }}
        />
        <span style={{ color: 'var(--text-muted)' }}>{unit}</span>
      </span>
    </label>
  );
}

// Same formula as engine/health.py's targets(), so the preview matches
// what the plan will use. The server stays the source of truth.
function previewTargets(p: { age: number; sex: string; height: number; weight: number; goal: HealthGoal; activity: HealthActivity }) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const kcal = Math.max(p.sex === 'male' ? 1500 : 1200, bmr * { low: 1.2, moderate: 1.45, high: 1.7 }[p.activity] + { lose: -500, maintain: 0, gain: 300 }[p.goal]);
  const protein = p.weight * { lose: 1.4, maintain: 1.2, gain: 1.6 }[p.goal];
  return {
    kcal: Math.round(kcal / 10) * 10,
    protein: Math.round(protein / 5) * 5,
    glasses: Math.max(8, Math.round((p.weight * 35) / 250)),
  };
}

function Setup({ state, onDone, onCancel }: { state: HealthState; onDone: (s: HealthState) => void; onCancel?: () => void }) {
  const L = useL();
  const p = state.profile;
  const [age, setAge] = useState(String(p?.age ?? 30));
  const [sex, setSex] = useState<'male' | 'female'>(p?.sex ?? 'male');
  const [height, setHeight] = useState(String(p?.height_cm ?? 170));
  const [weight, setWeight] = useState(String(p?.weight_kg ?? 70));
  const [goal, setGoal] = useState<HealthGoal>(p?.goal ?? 'lose');
  const [activity, setActivity] = useState<HealthActivity>(p?.activity ?? 'low');
  const [place, setPlace] = useState<'home' | 'gym'>(p?.place ?? 'home');
  const [error, setError] = useState('');

  const n = { age: Number(age), height: Number(height), weight: Number(weight) };
  const valid = n.age >= 10 && n.age <= 100 && n.height >= 100 && n.height <= 250 && n.weight >= 25 && n.weight <= 300;
  const t = valid ? previewTargets({ age: n.age, sex, height: n.height, weight: n.weight, goal, activity }) : null;

  const save = () => {
    const input: HealthProfileInput = { age: n.age, sex, height_cm: n.height, weight_kg: n.weight, goal, activity, place };
    healthApi
      .setProfile(input)
      .then(onDone)
      .catch(() => setError(L('Could not save — check the numbers.', 'সেভ হয়নি — সংখ্যাগুলো দেখুন।')));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <span style={{ ...label, color: 'var(--success)' }}>{L('HEALTH', 'স্বাস্থ্য')}</span>
        <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>
          {p ? L('Your profile', 'আপনার প্রোফাইল') : L('Set up your plan', 'প্ল্যান তৈরি করুন')}
        </span>
        <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {L('Takes a minute. Change any of it later with ⚙.', 'এক মিনিট লাগবে। পরে ⚙ দিয়ে বদলানো যাবে।')}
        </span>
      </div>

      <div style={card}>
        <span style={label}>{L('ABOUT YOU', 'আপনার তথ্য')}</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SPACE.md }}>
          <NumField name={L('Age', 'বয়স')} unit={L('yrs', 'বছর')} value={age} onChange={setAge} />
          <NumField name={L('Height', 'উচ্চতা')} unit="cm" value={height} onChange={setHeight} />
          <NumField name={L('Weight', 'ওজন')} unit="kg" value={weight} onChange={setWeight} />
        </div>
        <Choice
          options={[
            { v: 'male', title: L('Male', 'পুরুষ') },
            { v: 'female', title: L('Female', 'নারী') },
          ]}
          value={sex}
          onPick={setSex}
        />
      </div>

      <div style={card}>
        <span style={label}>{L('GOAL', 'লক্ষ্য')}</span>
        <Choice
          options={[
            { v: 'lose', title: L('Lose', 'কমানো'), sub: L('~0.5 kg / week', '~০.৫ কেজি/সপ্তাহ') },
            { v: 'maintain', title: L('Maintain', 'ধরে রাখা'), sub: L('stay steady', 'একই রাখা') },
            { v: 'gain', title: L('Gain muscle', 'পেশি বাড়ানো'), sub: L('slow and lean', 'ধীরে') },
          ]}
          value={goal}
          onPick={setGoal}
        />
        <span style={label}>{L('ACTIVITY', 'কাজকর্ম')}</span>
        <Choice
          options={[
            { v: 'low', title: L('Low', 'কম'), sub: L('desk, little walking', 'বসে কাজ') },
            { v: 'moderate', title: L('Moderate', 'মাঝারি'), sub: L('on feet some', 'কিছু হাঁটা') },
            { v: 'high', title: L('High', 'বেশি'), sub: L('active job / sport', 'সক্রিয় কাজ') },
          ]}
          value={activity}
          onPick={setActivity}
        />
        <span style={label}>{L('WORKOUT', 'ব্যায়াম')}</span>
        <Choice
          options={[
            { v: 'home', title: L('At home', 'বাসায়'), sub: L('bodyweight + band', 'শরীরের ওজন + ব্যান্ড') },
            { v: 'gym', title: L('Gym', 'জিম'), sub: L('dumbbells', 'ডাম্বেল') },
          ]}
          value={place}
          onPick={setPlace}
        />
      </div>

      {t && (
        <div style={{ ...card, border: '2px solid var(--success)' }}>
          <span style={{ ...label, color: 'var(--success)' }}>{L('YOUR DAILY TARGETS', 'দৈনিক লক্ষ্য')}</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SPACE.md }}>
            {[
              [t.kcal.toLocaleString(), L('kcal a day', 'ক্যালরি/দিন')],
              [`${t.protein} g`, L('protein', 'প্রোটিন')],
              [`${t.glasses}`, L('glasses of water', 'গ্লাস পানি')],
            ].map(([v, s]) => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: TYPE_SIZE.xl, fontWeight: TYPE_WEIGHT.bold }}>{v}</span>
                <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{s}</span>
              </div>
            ))}
          </div>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {L(
              'Estimated with the Mifflin–St Jeor formula and your activity level. An estimate, not medical advice — adjust if you feel weak or hungry all day.',
              'Mifflin–St Jeor সূত্র আর আপনার কাজকর্ম থেকে আনুমানিক হিসাব। এটা চিকিৎসা-পরামর্শ নয় — সারাদিন দুর্বল বা ক্ষুধার্ত লাগলে বদলে নিন।'
            )}
          </span>
        </div>
      )}

      {error && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: SPACE.sm, justifyContent: 'flex-end' }}>
        {onCancel && (
          <button onClick={onCancel} style={ghostBtn}>
            {L('Cancel', 'বাতিল')}
          </button>
        )}
        <button
          onClick={save}
          disabled={!valid}
          style={{
            height: 36,
            padding: `0 ${SPACE.lg}px`,
            fontSize: TYPE_SIZE.sm,
            fontWeight: TYPE_WEIGHT.bold,
            border: '1px solid var(--success)',
            borderRadius: RADIUS.control,
            background: 'var(--success)',
            color: 'var(--on-accent)',
            cursor: valid ? 'pointer' : 'default',
            opacity: valid ? 1 : 0.5,
          }}
        >
          {p ? L('Save', 'সেভ') : L('Build my plan →', 'প্ল্যান বানান →')}
        </button>
      </div>
    </div>
  );
}

// ── Plan ─────────────────────────────────────────────────────────────

function Tick({ done, onClick, color, round, label: aria }: { done: boolean; onClick?: () => void; color: string; round?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={done}
      aria-label={aria}
      style={{
        width: round ? 24 : 20,
        height: round ? 24 : 20,
        flex: 'none',
        padding: 0,
        borderRadius: round ? RADIUS.pill : RADIUS.control,
        boxSizing: 'border-box',
        border: `2px solid ${done ? 'var(--success)' : color}`,
        background: done ? 'var(--success)' : 'var(--surface)',
        color: 'var(--on-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {done && <Check size={round ? 14 : 12} strokeWidth={3} />}
    </button>
  );
}

function Plan({
  state,
  setState,
  onEditProfile,
  onEditDay,
  onOpen,
}: {
  state: HealthState;
  setState: (s: HealthState) => void;
  onEditProfile: () => void;
  onEditDay: () => void;
  onOpen: (v: 'progress' | 'shopping' | 'reminders') => void;
}) {
  const L = useL();
  const [range, setRange] = useState(1);
  const WD = useLang() === 'bn' ? WEEKDAYS_BN : WEEKDAYS_EN;
  const { day, log, targets, week, month, today } = state as Required<HealthState>;
  const canLog = day.day <= today;
  const pick = (d: string) => healthApi.state(d).then(setState);

  const eaten = day.meals.filter((m) => log.meals.includes(m.slot));
  const kcal = eaten.reduce((n, m) => n + m.kcal, 0);
  const protein = eaten.reduce((n, m) => n + m.protein_g, 0);
  const nextMeal = day.day === today ? day.meals.find((m) => !log.meals.includes(m.slot)) : undefined;
  const moveTotal = day.workout.blocks.reduce((n, b) => n + b.moves.length, 0);
  const dayName = new Date(`${day.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

  const weeks = Array.from({ length: Math.min(range, Math.ceil(month.length / 7)) }, (_, w) => month.slice(w * 7, w * 7 + 7));
  const weekNames = [L('Foundation', 'ভিত্তি'), L('Build', 'গড়া'), L('Push', 'চাপ'), L('Lock in', 'স্থায়ী')];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: SPACE.md }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          <span style={{ ...label, color: 'var(--success)' }}>{L('HEALTH · 4-WEEK PLAN', 'স্বাস্থ্য · ৪ সপ্তাহের প্ল্যান')}</span>
          <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>
            {day.in_plan
              ? L(`Week ${day.week} of 4 — ${day.week_name}`, `সপ্তাহ ${day.week}/৪ — ${weekNames[day.week - 1]}`)
              : L('Outside the plan', 'প্ল্যানের বাইরে')}
          </span>
          <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
            {L(
              `${targets.kcal.toLocaleString()} kcal · ${targets.protein_g} g protein · ${targets.water_glasses} glasses of water a day`,
              `দিনে ${targets.kcal.toLocaleString()} ক্যালরি · ${targets.protein_g} গ্রাম প্রোটিন · ${targets.water_glasses} গ্লাস পানি`
            )}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)' }}>🔥 {state.streak}</span>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{L('day streak', 'দিনের ধারা')}</span>
        </div>
        <button
          onClick={() => onOpen('reminders')}
          aria-label={L('Reminders', 'রিমাইন্ডার')}
          title={state.reminders?.enabled ? L('Reminders on', 'রিমাইন্ডার চালু') : L('Reminders off', 'রিমাইন্ডার বন্ধ')}
          style={{ ...ghostBtn, width: 28, padding: 0, justifyContent: 'center', color: state.reminders?.enabled ? 'var(--success)' : 'var(--text-muted)' }}
        >
          {state.reminders?.enabled ? <Bell size={14} /> : <BellOff size={14} />}
        </button>
        <button onClick={onEditProfile} aria-label={L('Profile and goal', 'প্রোফাইল ও লক্ষ্য')} style={{ ...ghostBtn, width: 28, padding: 0, justifyContent: 'center' }}>
          <Settings2 size={14} />
        </button>
      </div>

      {/* The month, always in view. */}
      <div style={{ ...card, gap: SPACE.sm, padding: SPACE.md }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
          <span style={{ ...label, letterSpacing: TRACKING.label }}>{L('THE PLAN', 'প্ল্যান')}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)' }}>
            {state.month_elapsed
              ? L(
                  `${state.month_on_plan} of ${state.month_elapsed} days on plan`,
                  `${state.month_elapsed} দিনের ${state.month_on_plan} দিন প্ল্যানে`
                )
              : L('Day 1 — it starts today', 'প্রথম দিন — আজ শুরু')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${month.length}, minmax(0, 1fr))`, gap: SPACE.hair }}>
          {month.map((c) => (
            <button
              key={c.day}
              onClick={() => !c.future && pick(c.day)}
              title={c.day}
              style={{
                height: 16,
                padding: 0,
                border: 'none',
                borderRadius: SPACE.hair,
                background: cellColor(c, today),
                outline: c.day === day.day ? '1.5px solid var(--text)' : 'none',
                outlineOffset: 1,
                cursor: c.future ? 'default' : 'pointer',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {weekNames.map((w, i) => (
            <span key={w} style={{ fontWeight: i + 1 === day.week ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal, color: i + 1 === day.week ? 'var(--text)' : undefined }}>
              W{i + 1} {w}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: SPACE.sm }}>
        <button onClick={() => onOpen('progress')} style={ghostBtn}>
          <TrendingUp size={12} /> {L('Progress', 'অগ্রগতি')}
        </button>
        <button onClick={() => onOpen('shopping')} style={ghostBtn}>
          <ShoppingCart size={12} /> {L('Shopping list', 'বাজারের তালিকা')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label={L('Range', 'সময়কাল')} style={{ display: 'flex', padding: SPACE.hair, background: 'var(--surface-2)', borderRadius: RADIUS.card }}>
          {[
            [1, L('1 week', '১ সপ্তাহ')],
            [2, L('2 weeks', '২ সপ্তাহ')],
            [3, L('3 weeks', '৩ সপ্তাহ')],
            [4, L('Month', 'মাস')],
          ].map(([v, t]) => (
            <button
              key={v}
              role="tab"
              aria-selected={range === v}
              onClick={() => setRange(v as number)}
              style={{
                height: 28,
                padding: `0 ${SPACE.md}px`,
                fontSize: TYPE_SIZE.xs,
                fontWeight: range === v ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal,
                border: 'none',
                borderRadius: RADIUS.control,
                background: range === v ? 'var(--surface)' : 'transparent',
                color: range === v ? 'var(--text)' : 'var(--text-muted)',
                boxShadow: range === v ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {range > 1 && (
        <div style={{ ...card, padding: SPACE.md, gap: SPACE.sm }}>
          <div style={{ display: 'grid', gridTemplateColumns: '96px repeat(7, minmax(0, 1fr))', gap: SPACE.xs, fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
            <span />
            {WD.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          {weeks.map((row, w) => (
            <div key={w} style={{ display: 'grid', gridTemplateColumns: '96px repeat(7, minmax(0, 1fr))', gap: SPACE.xs, alignItems: 'center' }}>
              <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: w + 1 === day.week ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal }}>
                W{w + 1} {weekNames[w]}
              </span>
              {row.map((c) => (
                <button
                  key={c.day}
                  onClick={() => !c.future && pick(c.day)}
                  title={c.day}
                  style={{
                    height: 28,
                    padding: 0,
                    border: 'none',
                    borderRadius: RADIUS.control,
                    background: cellColor(c, today),
                    outline: c.day === day.day ? '1.5px solid var(--text)' : 'none',
                    outlineOffset: 1,
                    color: c.on_plan ? 'var(--on-accent)' : 'var(--text)',
                    fontSize: TYPE_SIZE.xs,
                    cursor: c.future ? 'default' : 'pointer',
                  }}
                >
                  {c.on_plan ? '✓' : ''}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: SPACE.xs }}>
        {week.map((c, i) => {
          const on = c.day === day.day;
          const isToday = c.day === today;
          return (
            <button
              key={c.day}
              onClick={() => pick(c.day)}
              aria-pressed={on}
              style={{
                padding: `${SPACE.sm}px 0`,
                borderRadius: RADIUS.card,
                border: on ? '2px solid var(--text)' : `1px solid ${isToday ? 'var(--success)' : 'var(--border)'}`,
                background: c.future ? 'transparent' : 'var(--surface)',
                color: 'var(--text)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: SPACE.xs,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: isToday ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal, color: isToday ? 'var(--success)' : 'var(--text-muted)' }}>
                {WD[i]}
              </span>
              <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold }}>{Number(c.day.slice(8))}</span>
              <span style={{ display: 'flex', gap: SPACE.hair }}>
                <span
                  style={{
                    width: 16,
                    height: 4,
                    borderRadius: RADIUS.pill,
                    background: c.meals >= 4 ? 'var(--warning)' : c.meals > 0 ? 'color-mix(in srgb, var(--warning) 45%, var(--surface))' : PROGRESS_TRACK_SOFT,
                  }}
                />
                <span
                  style={{
                    width: 8,
                    height: 4,
                    borderRadius: RADIUS.pill,
                    background: c.rest ? PROGRESS_TRACK_SOFT : c.workout_done ? 'var(--accent)' : PROGRESS_TRACK_SOFT,
                  }}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold }}>
            {day.day === today ? L('Today · ', 'আজ · ') : ''}
            {dayName}
          </span>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
            {day.workout.name}
            {day.workout.minutes ? ` · ${day.workout.minutes} min` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={onEditDay} style={ghostBtn}>
            <Pencil size={12} /> {L('Edit this day', 'এই দিন বদলান')}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: SPACE.md }}>
          {[
            [L('Calories', 'ক্যালরি'), `≈ ${kcal.toLocaleString()}`, targets.kcal.toLocaleString(), kcal / targets.kcal, 'var(--warning)'],
            [L('Protein', 'প্রোটিন'), `≈ ${protein} g`, `${targets.protein_g} g`, protein / targets.protein_g, 'var(--success)'],
          ].map(([n, v, t, p, c]) => (
            <div key={n as string} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
              <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{n}</span>
              <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold }}>
                {v}
                <span style={{ fontWeight: TYPE_WEIGHT.normal, color: 'var(--text-muted)' }}> / {t}</span>
              </span>
              <span style={{ height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.min(100, (p as number) * 100)}%`, background: c as string }} />
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', width: 48 }}>{L('Water', 'পানি')}</span>
          <div style={{ display: 'flex', gap: SPACE.xs, flex: 1, flexWrap: 'wrap' }}>
            {Array.from({ length: targets.water_glasses }, (_, g) => (
              <span
                key={g}
                style={{
                  width: 16,
                  height: 20,
                  boxSizing: 'border-box',
                  borderRadius: '2px 2px 6px 6px',
                  border: '1.5px solid var(--accent)',
                  background: g < log.water ? 'color-mix(in srgb, var(--accent) 45%, var(--surface))' : 'var(--surface)',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold }}>
            {log.water}/{targets.water_glasses}
          </span>
          <button
            onClick={() => healthApi.addWater(day.day, -1).then(setState)}
            disabled={!canLog || log.water === 0}
            aria-label={L('One glass less', 'এক গ্লাস কম')}
            style={{ ...ghostBtn, width: 28, padding: 0, justifyContent: 'center' }}
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => healthApi.addWater(day.day, 1).then(setState)}
            disabled={!canLog}
            style={{ ...ghostBtn, borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: TYPE_WEIGHT.bold }}
          >
            <Plus size={12} /> {L('Glass', 'গ্লাস')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={label}>{L('MEALS', 'খাবার')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {L(`${log.meals.length}/4 eaten · rough estimates`, `${log.meals.length}/৪ খাওয়া · আনুমানিক হিসাব`)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
        {day.meals.map((m) => {
          const done = log.meals.includes(m.slot);
          const next = nextMeal?.slot === m.slot;
          return (
            <div
              key={m.slot}
              style={{
                display: 'flex',
                gap: SPACE.md,
                alignItems: 'flex-start',
                padding: SPACE.md,
                borderRadius: RADIUS.card,
                background: next ? 'color-mix(in srgb, var(--warning) 6%, var(--surface))' : 'var(--surface)',
                border: next ? '1.5px solid var(--warning)' : '1px solid var(--border)',
              }}
            >
              <Tick
                done={done}
                round
                color="var(--warning)"
                label={done ? L('Mark not eaten', 'না খাওয়া') : L('Mark eaten', 'খাওয়া হয়েছে')}
                onClick={canLog ? () => healthApi.setMeal(day.day, m.slot, !done).then(setState) : undefined}
              />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
                  <span style={{ ...label, letterSpacing: TRACKING.label, color: 'var(--warning)' }}>{m.name.toUpperCase()}</span>
                  <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{m.time}</span>
                  {m.edited && (
                    <span title={L('Edited — Reset in the editor brings the default back', 'বদলানো — এডিটরে রিসেট করলে আগেরটা ফিরবে')} style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
                      ✎
                    </span>
                  )}
                  {next && (
                    <span
                      style={{
                        fontSize: TYPE_SIZE.xs,
                        fontWeight: TYPE_WEIGHT.bold,
                        color: 'var(--on-accent)',
                        background: 'var(--warning)',
                        padding: `0 ${SPACE.sm}px`,
                        borderRadius: RADIUS.pill,
                      }}
                    >
                      {L('NEXT', 'পরের')}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: TYPE_SIZE.base,
                    fontWeight: TYPE_WEIGHT.medium,
                    textDecoration: done ? 'line-through' : 'none',
                    color: done ? 'var(--text-muted)' : 'var(--text)',
                  }}
                >
                  {m.items}
                </span>
                <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
                  ≈ {m.kcal} kcal · {m.protein_g} g {L('protein', 'প্রোটিন')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={label}>{L('WORKOUT', 'ব্যায়াম')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {moveTotal ? `${log.moves.length}/${moveTotal} · ` : ''}
          {day.workout.name}
        </span>
      </div>
      {moveTotal === 0 ? (
        <div style={{ ...card, fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {L('Rest day. A 20-minute easy walk counts, nothing more.', 'বিশ্রামের দিন। ২০ মিনিট হালকা হাঁটাই যথেষ্ট।')}
        </div>
      ) : (
        <div style={{ ...card, padding: 0, gap: 0, overflow: 'hidden' }}>
          {day.workout.blocks.map((b, bi) => (
            <div
              key={b.name}
              style={{
                padding: `${SPACE.md}px ${SPACE.lg}px`,
                borderTop: bi ? '1px solid var(--surface-2)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: SPACE.sm,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
                <span style={{ ...label, letterSpacing: TRACKING.label, color: 'var(--accent)' }}>{b.name.toUpperCase()}</span>
                <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{b.minutes} min</span>
              </div>
              {b.moves.map(([name, dose, kit], mi) => {
                const key = `${bi}-${mi}`;
                const done = log.moves.includes(key);
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
                    <Tick
                      done={done}
                      color="var(--border)"
                      label={done ? L('Mark not done', 'অসম্পূর্ণ') : L('Mark done', 'সম্পূর্ণ')}
                      onClick={canLog ? () => healthApi.setMove(day.day, key, !done).then(setState) : undefined}
                    />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: TYPE_SIZE.sm,
                        fontWeight: TYPE_WEIGHT.medium,
                        textDecoration: done ? 'line-through' : 'none',
                        color: done ? 'var(--text-muted)' : 'var(--text)',
                      }}
                    >
                      {name}
                    </span>
                    <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dose}</span>
                    <span
                      style={{
                        fontSize: TYPE_SIZE.xs,
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: RADIUS.pill,
                        padding: `0 ${SPACE.sm}px`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {kit}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {L(
          'Targets and meal numbers are rough estimates, not medical advice. Check with a doctor before a big change in diet or exercise.',
          'লক্ষ্য আর খাবারের সংখ্যাগুলো আনুমানিক, চিকিৎসা-পরামর্শ নয়। খাবার বা ব্যায়ামে বড় পরিবর্তনের আগে ডাক্তারের সাথে কথা বলুন।'
        )}
      </span>
    </div>
  );
}

export default function HealthPanel({ onBack }: { onBack: () => void }) {
  const L = useL();
  const [state, setStateRaw] = useState<HealthState | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingDay, setEditingDay] = useState(false);
  const [view, setView] = useState<'plan' | 'progress' | 'shopping' | 'reminders'>('plan');
  // Every change here also tells the Discipline tab's Health card (which
  // stays mounted underneath) to re-read, so it never shows stale ticks.
  const setState = (s: HealthState) => {
    setStateRaw(s);
    window.dispatchEvent(new Event('health-changed'));
  };
  const [error, setError] = useState(false);

  useEffect(() => {
    healthApi
      .state()
      .then(setStateRaw)
      .catch(() => setError(true));
  }, []);

  return (
    <div style={{ padding: SPACE.xl, boxSizing: 'border-box', width: '100%' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
        <button onClick={onBack} style={{ ...ghostBtn, alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} /> {L('Back to Goals', 'লক্ষ্যে ফিরুন')}
        </button>
        {error && (
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>
            {L("Couldn't load the plan — check the app is connected.", 'প্ল্যান লোড হয়নি — অ্যাপ সংযুক্ত আছে কিনা দেখুন।')}
          </span>
        )}
        {!state && !error && <span>{L('Loading…', 'লোড হচ্ছে…')}</span>}
        {state &&
          (!state.profile || editing ? (
            <Setup
              state={state}
              onDone={(s) => {
                setState(s);
                setEditing(false);
              }}
              onCancel={state.profile ? () => setEditing(false) : undefined}
            />
          ) : (
            editingDay && state.day ? (
              <HealthEditor state={state as Required<HealthState>} setState={setState} onDone={() => setEditingDay(false)} />
            ) : view === 'progress' ? (
              <HealthProgress onBack={() => setView('plan')} />
            ) : view === 'shopping' ? (
              <HealthShopping onBack={() => setView('plan')} />
            ) : view === 'reminders' && state.reminders ? (
              <HealthRemindersPanel state={state} setState={setState} onBack={() => setView('plan')} />
            ) : (
              <Plan
                state={state}
                setState={setState}
                onEditProfile={() => setEditing(true)}
                onEditDay={() => setEditingDay(true)}
                onOpen={setView}
              />
            )
          ))}
      </div>
    </div>
  );
}
