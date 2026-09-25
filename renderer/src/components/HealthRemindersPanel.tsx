import { useState } from 'react';
import { ArrowLeft, Bell } from 'lucide-react';
import { HealthReminders, HealthState, healthApi } from '../services/api';
import { useL } from '../i18n';
import { notify } from './HealthReminderRunner';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// Health › Reminders settings. Every change saves straight away; the
// runner (HealthReminderRunner) picks it up on its next minute. Meal
// times set here are also the times the plan page shows.

const label: React.CSSProperties = { fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide };
const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  padding: SPACE.lg,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.md,
};
const btn: React.CSSProperties = {
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
const field: React.CSSProperties = {
  height: 28,
  fontSize: TYPE_SIZE.sm,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: `0 ${SPACE.sm}px`,
};
const muted: React.CSSProperties = { fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' };

function Toggle({ on, onClick, label: aria, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={aria}
      style={{
        width: 40,
        height: 22,
        flexShrink: 0,
        borderRadius: RADIUS.card,
        border: '1px solid var(--border)',
        background: on ? 'var(--accent)' : 'transparent',
        position: 'relative',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 1,
          left: on ? 19 : 1,
          width: 18,
          height: 18,
          borderRadius: RADIUS.pill,
          background: on ? 'var(--on-accent)' : 'var(--text-muted)',
          transition: 'left 0.12s',
        }}
      />
    </button>
  );
}

function Row({ title, sub, on, onToggle, disabled, children }: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm, opacity: disabled ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.medium }}>{title}</span>
          <span style={muted}>{sub}</span>
        </div>
        <Toggle on={on} onClick={onToggle} label={title} disabled={disabled} />
      </div>
      {on && children}
    </div>
  );
}

export default function HealthRemindersPanel({
  state,
  setState,
  onBack,
}: {
  state: HealthState;
  setState: (s: HealthState) => void;
  onBack: () => void;
}) {
  const L = useL();
  const r = state.reminders as HealthReminders;
  const [error, setError] = useState('');
  const [test, setTest] = useState('');
  const [times, setTimes] = useState<string[]>(r.meal_times);

  const save = (patch: Partial<HealthReminders>) =>
    healthApi
      .setReminders(patch)
      .then((s) => {
        setState(s);
        setError('');
        if (s.reminders) setTimes(s.reminders.meal_times);
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setTimes(r.meal_times);
      });

  const sendTest = () =>
    notify(L('🔔 Health reminders are on', '🔔 Health reminder চালু আছে'), L('This is how a reminder will look.', 'reminder দেখতে এমন হবে।'), 'health-test').then(
      (ok) =>
        setTest(
          ok
            ? L('Sent — check your notifications.', 'পাঠানো হয়েছে — notification দেখুন।')
            : L(
                'Your system blocked it. Allow notifications for Habit OS in the system settings.',
                'সিস্টেম আটকে দিয়েছে। সিস্টেম সেটিংসে Habit OS-এর notification চালু করুন।'
              )
        )
    );

  const mealNames = [L('Breakfast', 'সকালের নাস্তা'), L('Lunch', 'দুপুরের খাবার'), L('Snack', 'বিকেলের নাস্তা'), L('Dinner', 'রাতের খাবার')];
  const off = !r.enabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <button onClick={onBack} style={{ ...btn, alignSelf: 'flex-start' }}>
        <ArrowLeft size={14} /> {L('Back to week', 'সপ্তাহে ফিরুন')}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <span style={{ ...label, color: 'var(--success)' }}>{L('HEALTH', 'স্বাস্থ্য')}</span>
        <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>{L('Reminders', 'রিমাইন্ডার')}</span>
        <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {L(
            'A nudge only when something is still undone — a ticked meal or a finished workout stays quiet.',
            'শুধু কিছু বাকি থাকলেই মনে করাবে — খাবারে টিক বা ব্যায়াম শেষ হলে চুপ থাকবে।'
          )}
        </span>
      </div>

      <div style={card}>
        <Row
          title={L('Remind me', 'মনে করিয়ে দিন')}
          sub={L('Master switch for all Health reminders', 'সব Health reminder-এর মূল সুইচ')}
          on={r.enabled}
          onToggle={() => save({ enabled: !r.enabled })}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap' }}>
            <button onClick={sendTest} style={btn}>
              <Bell size={12} /> {L('Send a test', 'একটা test পাঠান')}
            </button>
            {test && <span style={muted}>{test}</span>}
          </div>
        </Row>
      </div>

      <div style={{ ...card, gap: SPACE.lg }}>
        <Row
          title={L('Meals', 'খাবার')}
          sub={L('At each meal time, for an hour, if it isn’t ticked', 'প্রতি খাবারের সময় থেকে এক ঘণ্টা, টিক না দেওয়া থাকলে')}
          on={r.meals}
          onToggle={() => save({ meals: !r.meals })}
          disabled={off}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: SPACE.sm }}>
            {mealNames.map((n, i) => (
              <label key={n} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, ...muted }}>
                {n}
                <input
                  type="time"
                  value={times[i]}
                  disabled={off}
                  onChange={(e) => setTimes(times.map((t, j) => (j === i ? e.target.value : t)))}
                  onBlur={() => times.join() !== r.meal_times.join() && save({ meal_times: times })}
                  style={{ ...field, minWidth: 0 }}
                />
              </label>
            ))}
          </div>
          <span style={muted}>{L('These are also the times shown on your plan.', 'প্ল্যানের পাতাতেও এই সময়গুলোই দেখাবে।')}</span>
        </Row>

        <Row
          title={L('Water', 'পানি')}
          sub={L('Only when you’re behind an even pace to the day’s glasses', 'শুধু দিনের গ্লাসের হিসাবে পিছিয়ে থাকলে')}
          on={r.water}
          onToggle={() => save({ water: !r.water })}
          disabled={off}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: SPACE.md, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, ...muted }}>
              {L('At most every', 'সর্বোচ্চ প্রতি')}
              <select value={r.water_every} disabled={off} onChange={(e) => save({ water_every: Number(e.target.value) })} style={field}>
                {[60, 90, 120, 180].map((m) => (
                  <option key={m} value={m}>
                    {m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, ...muted }}>
              {L('From', 'থেকে')}
              <input type="time" defaultValue={r.water_from} key={`f${r.water_from}`} disabled={off} onBlur={(e) => e.target.value !== r.water_from && save({ water_from: e.target.value })} style={field} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, ...muted }}>
              {L('Until', 'পর্যন্ত')}
              <input type="time" defaultValue={r.water_to} key={`t${r.water_to}`} disabled={off} onBlur={(e) => e.target.value !== r.water_to && save({ water_to: e.target.value })} style={field} />
            </label>
          </div>
        </Row>

        <Row
          title={L('Workout', 'ব্যায়াম')}
          sub={L('Once, if today’s workout isn’t done (never on a rest day)', 'একবার, আজকের ব্যায়াম না হলে (বিশ্রামের দিনে কখনো না)')}
          on={r.workout}
          onToggle={() => save({ workout: !r.workout })}
          disabled={off}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, ...muted }}>
            {L('At', 'সময়')}
            <input type="time" defaultValue={r.workout_time} key={`w${r.workout_time}`} disabled={off} onBlur={(e) => e.target.value !== r.workout_time && save({ workout_time: e.target.value })} style={field} />
          </label>
        </Row>
      </div>

      {error && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>{error}</span>}
      <span style={muted}>
        {L(
          'Reminders come only while Habit OS is open (it can be minimised). If none show up, check that your system allows notifications from Habit OS.',
          'Habit OS খোলা থাকলেই শুধু reminder আসবে (minimise করা থাকলেও চলবে)। না এলে দেখুন সিস্টেমে Habit OS-এর notification চালু আছে কিনা।'
        )}
      </span>
    </div>
  );
}
