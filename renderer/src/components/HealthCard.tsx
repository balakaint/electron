import { useEffect, useState } from 'react';
import { HeartPulse } from 'lucide-react';
import { HealthState, healthApi } from '../services/api';
import { useL } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// The Discipline tab's Health card (took the place of the old "Exercise
// · Soon" placeholder). Today at a glance — meals, workout, water — and
// the plan's month as one thin strip, so the month's consistency is
// always in view while the page itself leads with the week.
function Meter({ label, value, of, pct, color }: { label: string; value: string; of: string; pct: number; color: string }) {
  return (
    <div
      style={{
        padding: SPACE.sm,
        borderRadius: RADIUS.control,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.xs,
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold, whiteSpace: 'nowrap' }}>
        {value}
        <span style={{ fontWeight: TYPE_WEIGHT.normal, color: 'var(--text-muted)', fontSize: TYPE_SIZE.xs }}>/{of}</span>
      </span>
      <span style={{ height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct * 100)}%`, background: color }} />
      </span>
    </div>
  );
}

export default function HealthCard({ onOpen }: { onOpen: () => void }) {
  const L = useL();
  const [s, setS] = useState<HealthState | null>(null);
  useEffect(() => {
    const load = () => healthApi.state().then(setS).catch(() => setS(null));
    load();
    window.addEventListener('health-changed', load);
    // Also once a minute, so the card rolls over to a new day by itself.
    const id = setInterval(load, 60_000);
    return () => {
      window.removeEventListener('health-changed', load);
      clearInterval(id);
    };
  }, []);

  const shell: React.CSSProperties = {
    border: '1px solid var(--success)',
    borderRadius: RADIUS.card,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    background: 'var(--surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: SPACE.md,
    boxShadow: 'var(--shadow-sm)',
  };
  const openBtn = (label: string) => (
    <button
      onClick={onOpen}
      style={{
        height: 32,
        padding: `0 ${SPACE.lg}px`,
        fontSize: TYPE_SIZE.xs,
        fontWeight: TYPE_WEIGHT.bold,
        borderRadius: RADIUS.control,
        border: '1px solid var(--success)',
        background: 'var(--success)',
        color: 'var(--on-accent)',
        cursor: 'pointer',
        flex: 'none',
      }}
    >
      {label}
    </button>
  );

  if (!s || !s.profile || !s.day || !s.log || !s.targets || !s.month) {
    return (
      <div style={shell}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
          <HeartPulse size={20} color="var(--success)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)' }}>{L('Health', 'স্বাস্থ্য')}</div>
            <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
              {L('A 4-week food and workout plan, a week at a time.', '৪ সপ্তাহের খাবার ও ব্যায়াম প্ল্যান, এক সপ্তাহ করে।')}
            </div>
          </div>
          {openBtn(L('Set up', 'শুরু করুন'))}
        </div>
      </div>
    );
  }

  const { day, log, targets, month } = s;
  const moves = day.workout.blocks.reduce((n, b) => n + b.moves.length, 0);
  const rest = moves === 0;
  const movesDone = day.workout.blocks.reduce((n, b, bi) => n + b.moves.filter(([name]) => log.moves.includes(`${bi}:${name}`)).length, 0);
  const nextMeal = day.meals.find((m) => !log.meals.includes(m.slot));
  const done = log.meals.length + (rest ? 0 : movesDone);
  const total = 4 + moves;
  const pct = total ? done / total : 0;

  return (
    <div style={shell}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <span
          style={{
            width: 44,
            height: 44,
            flex: 'none',
            borderRadius: RADIUS.pill,
            background: `conic-gradient(var(--success) ${pct * 360}deg, ${PROGRESS_TRACK_SOFT} 0)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: RADIUS.pill,
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
              color: 'var(--success)',
            }}
          >
            {Math.round(pct * 100)}%
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)' }}>
            {L('Health', 'স্বাস্থ্য')}{' '}
            <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.normal, color: 'var(--text-muted)' }}>
              {day.in_plan
                ? L(`· Week ${day.week} of 4 · ${day.week_name}`, `· সপ্তাহ ${day.week}/৪ · ${day.week_name}`)
                : L('· plan finished', '· প্ল্যান শেষ')}
            </span>
          </span>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nextMeal
              ? L(`Next: ${nextMeal.name} at ${nextMeal.time}`, `পরের: ${nextMeal.name} ${nextMeal.time}`)
              : L('All meals done', 'সব খাবার শেষ')}
            {' · '}
            {day.workout.name}
          </span>
        </div>
        {openBtn(L('Open', 'খুলুন'))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SPACE.sm }}>
        <Meter label={L('Meals', 'খাবার')} value={String(log.meals.length)} of="4" pct={log.meals.length / 4} color="var(--warning)" />
        <Meter
          label={L('Workout', 'ব্যায়াম')}
          value={rest ? L('Rest', 'বিশ্রাম') : String(movesDone)}
          of={rest ? '—' : String(moves)}
          pct={rest ? 1 : movesDone / moves}
          color="var(--accent)"
        />
        <Meter
          label={L('Water', 'পানি')}
          value={String(log.water)}
          of={String(targets.water_glasses)}
          pct={log.water / targets.water_glasses}
          color="var(--accent)"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{L('Plan', 'প্ল্যান')}</span>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${month.length}, minmax(0, 1fr))`, gap: SPACE.hair }}>
          {month.map((c) => (
            <span
              key={c.day}
              title={c.day}
              style={{
                height: 12,
                borderRadius: SPACE.hair,
                background: c.future
                  ? 'var(--surface-2)'
                  : c.on_plan
                    ? 'var(--success)'
                    : c.day === s.today
                      ? 'color-mix(in srgb, var(--success) 25%, var(--surface))'
                      : 'color-mix(in srgb, var(--border) 50%, var(--surface))',
                outline: c.day === s.today ? '1.5px solid var(--text)' : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)', whiteSpace: 'nowrap' }}>
          {s.month_elapsed
            ? L(`${s.month_on_plan}/${s.month_elapsed} days`, `${s.month_on_plan}/${s.month_elapsed} দিন`)
            : L('Day 1', 'প্রথম দিন')}
        </span>
      </div>
    </div>
  );
}
