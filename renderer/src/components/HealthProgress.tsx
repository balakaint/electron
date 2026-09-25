import { useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { HealthProgress as Progress, healthApi } from '../services/api';
import { useL, useLang } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// Health › Progress. Three questions, in the order people ask them:
// am I sticking to it (days on plan, workouts, calories), is my body
// changing (weight — optional, weekly is plenty), and where does it slip
// (consistency by plan week, plus one named pattern if there is one).
// Everything counts days BEFORE today: today is still going.

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
const input: React.CSSProperties = {
  height: 28,
  width: 72,
  fontSize: TYPE_SIZE.sm,
  border: '1px solid var(--border)',
  borderRadius: RADIUS.control,
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: `0 ${SPACE.sm}px`,
};
const muted: React.CSSProperties = { fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' };

const WD_EN = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const WD_BN = ['সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার'];

const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
const shortDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function Stat({ name, value, sub, frac }: { name: string; value: string; sub: string; frac: number | null }) {
  return (
    <div style={{ ...card, gap: SPACE.xs, padding: SPACE.md, minWidth: 0 }}>
      <span style={muted}>{name}</span>
      <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>{value}</span>
      <span style={muted}>{sub}</span>
      {frac !== null && (
        <div style={{ height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, frac * 100))}%`, height: '100%', background: 'var(--success)' }} />
        </div>
      )}
    </div>
  );
}

// Weight over time: one series, so no legend box — the card title names
// it. The goal, when set, is a dashed reference line labelled on the
// right. Each point carries a native tooltip with its date and value.
function WeightChart({ p }: { p: Progress }) {
  const L = useL();
  const pts = p.weights;
  const W = 560;
  const H = 150;
  const padL = 36;
  const padR = 56;
  const padT = 12;
  const padB = 28;
  const vals = pts.map((x) => x.weight_kg as number);
  if (p.goal_weight_kg) vals.push(p.goal_weight_kg);
  let lo = Math.floor(Math.min(...vals) - 0.5);
  let hi = Math.ceil(Math.max(...vals) + 0.5);
  if (hi - lo < 2) {
    lo -= 1;
    hi += 1;
  }
  const t0 = new Date(`${pts[0].day}T00:00:00`).getTime();
  const t1 = new Date(`${pts[pts.length - 1].day}T00:00:00`).getTime();
  const x = (d: string) =>
    pts.length === 1 ? padL + (W - padL - padR) / 2 : padL + ((new Date(`${d}T00:00:00`).getTime() - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
  const ticks = [lo, (lo + hi) / 2, hi];
  const path = pts.map((q, i) => `${i ? 'L' : 'M'}${x(q.day).toFixed(1)},${y(q.weight_kg as number).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={L('Weight over time', 'সময়ের সাথে ওজন')} style={{ display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
          <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
            {t.toFixed(t % 1 ? 1 : 0)}
          </text>
        </g>
      ))}
      {p.goal_weight_kg && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(p.goal_weight_kg)} y2={y(p.goal_weight_kg)} stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={W - padR + 6} y={y(p.goal_weight_kg) + 4} fontSize={11} fill="var(--text-muted)">
            {L(`goal ${p.goal_weight_kg}`, `লক্ষ্য ${p.goal_weight_kg}`)}
          </text>
        </g>
      )}
      {pts.length > 1 && <path d={path} fill="none" stroke="var(--success)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {pts.map((q, i) => (
        <g key={q.day}>
          <circle cx={x(q.day)} cy={y(q.weight_kg as number)} r={4} fill="var(--success)" stroke="var(--surface)" strokeWidth={2}>
            <title>{`${shortDate(q.day)} · ${q.weight_kg} kg`}</title>
          </circle>
          {/* Selective labels: first and latest value only. */}
          {(i === 0 || i === pts.length - 1) && (
            <text x={x(q.day)} y={y(q.weight_kg as number) - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
              {q.weight_kg}
            </text>
          )}
          {(i === 0 || i === pts.length - 1 || pts.length <= 6) && (
            <text
              x={x(q.day)}
              y={H - 4}
              textAnchor={pts.length > 1 && i === 0 ? 'start' : pts.length > 1 && i === pts.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill="var(--text-muted)"
            >
              {shortDate(q.day)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Bar({ value, color }: { value: number | null; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
      <div style={{ flex: 1, height: 8, borderRadius: RADIUS.control, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
        {value !== null && <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: RADIUS.control }} />}
      </div>
      <span style={{ width: 40, textAlign: 'right', fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold }}>{value === null ? '—' : `${value}%`}</span>
    </div>
  );
}

export default function HealthProgress({ onBack }: { onBack: () => void }) {
  const L = useL();
  const bn = useLang() === 'bn';
  const [p, setP] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [logging, setLogging] = useState(false);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [hip, setHip] = useState('');
  const [goal, setGoal] = useState('');

  useEffect(() => {
    healthApi
      .progress()
      .then((x) => {
        setP(x);
        setGoal(x.goal_weight_kg ? String(x.goal_weight_kg) : '');
      })
      .catch(() => setError(L("Couldn't load progress.", 'অগ্রগতি লোড হয়নি।')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    const n = (s: string) => (s.trim() ? Number(s) : undefined);
    const m = { weight_kg: n(weight), waist_cm: n(waist), hip_cm: n(hip) };
    if (Object.values(m).some((v) => v !== undefined && !Number.isFinite(v))) return;
    const g = goal.trim() ? Number(goal) : null;
    healthApi
      .logMeasure(m)
      .then((x) => (g !== (x.goal_weight_kg ?? null) && (g === null || Number.isFinite(g)) ? healthApi.setGoalWeight(g) : x))
      .then((x) => {
        setP(x);
        setError('');
        setLogging(false);
        setWeight('');
        setWaist('');
        setHip('');
      })
      .catch((e) => setError(String(e?.message ?? e)));
  };

  if (!p) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <button onClick={onBack} style={{ ...btn, alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} /> {L('Back to week', 'সপ্তাহে ফিরুন')}
        </button>
        <span style={muted}>{error || L('Loading…', 'লোড হচ্ছে…')}</span>
      </div>
    );
  }

  const dayOf = Math.min(Math.max(p.plan_day, 1), p.plan_days);
  const change = p.weight_change;
  const lastWeight = p.weights.length ? p.weights[p.weights.length - 1].weight_kg : null;
  const toGo = p.goal_weight_kg && lastWeight ? Math.round((lastWeight - p.goal_weight_kg) * 10) / 10 : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <button onClick={onBack} style={{ ...btn, alignSelf: 'flex-start' }}>
        <ArrowLeft size={14} /> {L('Back to week', 'সপ্তাহে ফিরুন')}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <span style={{ ...label, color: 'var(--success)' }}>{L('HEALTH', 'স্বাস্থ্য')}</span>
        <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>{L('Progress', 'অগ্রগতি')}</span>
        <span style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          {L(
            `Plan day ${dayOf} of ${p.plan_days} · ${shortDate(p.start_date)} – ${shortDate(p.end_date)}`,
            `প্ল্যানের ${p.plan_days} দিনের ${dayOf}তম দিন · ${shortDate(p.start_date)} – ${shortDate(p.end_date)}`
          )}
        </span>
      </div>

      {p.elapsed === 0 ? (
        <div style={{ ...card, gap: SPACE.xs }}>
          <span style={{ fontWeight: TYPE_WEIGHT.bold }}>{L('Nothing to count yet', 'এখনো গোনার কিছু নেই')}</span>
          <span style={muted}>
            {L(
              'Progress counts the days before today, so the numbers start tomorrow. Log a starting weight below if you like.',
              'অগ্রগতি আজকের আগের দিনগুলো গোনে, তাই সংখ্যা কাল থেকে শুরু হবে। চাইলে নিচে শুরুর ওজন লিখে রাখুন।'
            )}
          </span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: SPACE.md }}>
          <Stat
            name={L('Days on plan', 'প্ল্যানে থাকা দিন')}
            value={`${pct(p.on_plan, p.elapsed)}%`}
            sub={L(`${p.on_plan} of ${p.elapsed} days`, `${p.elapsed} দিনের ${p.on_plan} দিন`)}
            frac={p.on_plan / p.elapsed}
          />
          <Stat
            name={L('Workouts done', 'ব্যায়াম হয়েছে')}
            value={p.workouts_planned ? `${pct(p.workouts_done, p.workouts_planned)}%` : '—'}
            sub={L(`${p.workouts_done} of ${p.workouts_planned} planned`, `${p.workouts_planned}টার ${p.workouts_done}টা`)}
            frac={p.workouts_planned ? p.workouts_done / p.workouts_planned : null}
          />
          <Stat
            name={L('Avg calories', 'গড় ক্যালরি')}
            value={p.avg_kcal ? `≈${p.avg_kcal.toLocaleString()}` : '—'}
            sub={L(`target ${p.kcal_target.toLocaleString()}`, `লক্ষ্য ${p.kcal_target.toLocaleString()}`)}
            frac={null}
          />
        </div>
      )}

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span style={label}>{L('WEIGHT', 'ওজন')}</span>
          <span style={muted}>
            {L('weekly, optional', 'সপ্তাহে একবার, ঐচ্ছিক')}
            {change !== null && ` · ${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)} kg ${L('so far', 'এ পর্যন্ত')}`}
            {toGo !== null && toGo > 0 && ` · ${L(`${toGo} kg to goal`, `লক্ষ্যে ${toGo} কেজি বাকি`)}`}
          </span>
          <span style={{ flex: 1 }} />
          {!logging && (
            <button onClick={() => setLogging(true)} style={btn}>
              <Plus size={12} /> {L('Log this week', 'এই সপ্তাহ লিখুন')}
            </button>
          )}
        </div>
        {logging && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: SPACE.md }}>
            {(
              [
                [L('Weight (kg)', 'ওজন (কেজি)'), weight, setWeight, String(lastWeight ?? p.profile_weight_kg)],
                [L('Waist (cm)', 'কোমর (সেমি)'), waist, setWaist, p.waist_cm ? String(p.waist_cm) : ''],
                [L('Hip (cm)', 'হিপ (সেমি)'), hip, setHip, p.hip_cm ? String(p.hip_cm) : ''],
                [L('Goal (kg)', 'লক্ষ্য (কেজি)'), goal, setGoal, ''],
              ] as [string, string, (v: string) => void, string][]
            ).map(([name, v, set, ph]) => (
              <label key={name} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, ...muted }}>
                {name}
                <input value={v} onChange={(e) => set(e.target.value)} placeholder={ph} inputMode="decimal" style={input} />
              </label>
            ))}
            <button onClick={save} style={{ ...btn, background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)', fontWeight: TYPE_WEIGHT.bold }}>
              {L('Save', 'সেভ')}
            </button>
            <button onClick={() => setLogging(false)} style={btn}>
              {L('Cancel', 'বাতিল')}
            </button>
          </div>
        )}
        {error && <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--danger)' }}>{error}</span>}
        {p.weights.length ? (
          <WeightChart p={p} />
        ) : (
          <span style={muted}>
            {L(
              'No weigh-ins yet. Once a week, same time of day, is enough — daily numbers jump around.',
              'এখনো ওজন লেখা হয়নি। সপ্তাহে একবার, দিনের একই সময়ে, যথেষ্ট — রোজকার সংখ্যা ওঠানামা করে।'
            )}
          </span>
        )}
        {(p.waist_cm || p.hip_cm) && (
          <div style={{ display: 'flex', gap: SPACE.lg, fontSize: TYPE_SIZE.sm }}>
            {p.waist_cm && (
              <span>
                <span style={muted}>{L('Waist', 'কোমর')} </span>
                <b>{p.waist_cm} cm</b>
              </span>
            )}
            {p.hip_cm && (
              <span>
                <span style={muted}>{L('Hip', 'হিপ')} </span>
                <b>{p.hip_cm} cm</b>
              </span>
            )}
          </div>
        )}
      </div>

      {p.weeks.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap' }}>
            <span style={label}>{L('CONSISTENCY BY WEEK', 'সপ্তাহ ধরে ধারাবাহিকতা')}</span>
            <span style={{ flex: 1 }} />
            {/* Legend: two series, so identity is never colour alone. */}
            <span style={{ ...muted, display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
              <span style={{ width: 8, height: 8, borderRadius: RADIUS.control, background: 'var(--success)' }} />
              {L('Meals eaten', 'খাবার খাওয়া')}
            </span>
            <span style={{ ...muted, display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
              <span style={{ width: 8, height: 8, borderRadius: RADIUS.control, background: 'var(--accent)' }} />
              {L('Workouts done', 'ব্যায়াম হয়েছে')}
            </span>
          </div>
          {p.weeks.map((w) => (
            <div key={w.week} style={{ display: 'grid', gridTemplateColumns: '56px minmax(0, 1fr)', gap: SPACE.sm, alignItems: 'center' }}>
              <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold }}>
                W{w.week}
                {w.days < 7 && <span style={{ ...muted, fontWeight: TYPE_WEIGHT.normal }}> · {w.days}d</span>}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
                <div title={L('Meals eaten', 'খাবার খাওয়া')}>
                  <Bar value={w.meals_pct} color="var(--success)" />
                </div>
                <div title={L('Workouts done', 'ব্যায়াম হয়েছে')}>
                  <Bar value={w.workouts_pct} color="var(--accent)" />
                </div>
              </div>
            </div>
          ))}
          {(p.slip || (p.meals_pct !== null && p.meals_pct >= 75)) && (
            <div style={{ fontSize: TYPE_SIZE.sm, lineHeight: 1.5, background: 'var(--surface-2)', borderRadius: RADIUS.control, padding: SPACE.md }}>
              {p.slip &&
                L(
                  `Workouts slip on ${WD_EN[p.slip.weekday]} (missed ${p.slip.missed} of ${p.slip.of}). One change to try: move that day's workout to the morning, or make it shorter. `,
                  `${WD_BN[p.slip.weekday]} ব্যায়াম বাদ পড়ছে (${p.slip.of}টার ${p.slip.missed}টা)। একটা জিনিস চেষ্টা করুন: ওই দিনের ব্যায়াম সকালে সরান, বা ছোট করুন। `
                )}
              {p.meals_pct !== null && p.meals_pct >= 75 && L('Meals are steady.', 'খাবার ঠিকঠাক চলছে।')}
            </div>
          )}
        </div>
      )}
      <span style={muted}>
        {bn
          ? 'ক্যালরি আনুমানিক — প্ল্যানের খাবারের হিসাব থেকে, মাপা নয়।'
          : 'Calories are estimates from the planned meals you ticked, not measured.'}
      </span>
    </div>
  );
}
