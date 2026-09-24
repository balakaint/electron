import { useEffect, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, Moon, Pause, Play } from 'lucide-react';
import {
  HealthState,
  HourPlan,
  MorningRitual,
  NightClosure,
  ProjectOrderEntry,
  Settings,
  STRIKE_MAX,
  Task,
  healthApi,
  hoursApi,
  morningRitualApi,
  nightClosureApi,
  projectsApi,
  tasksApi,
} from '../services/api';
import { useL } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';
import { nightWritten } from '../ritualSteps';

// PLAN by time of day (2026-09-25, from the "Panel 3 · PLAN" final
// mockups). Morning leads with setting the day up, work hours with the
// thing being worked on, evening with how the day went and tomorrow's
// three. The pieces here are new; the existing cards (clock, NOW, Plan
// today, Deep Work, the review) are reused by Panel3 around them.

export type PlanPhase = 'morning' | 'work' | 'evening';

// Morning from the morning start until work starts, work until the
// evening starts, and evening from then through the night until the
// next morning — the night is still "closing the day".
export function planPhase(now: Date, s: Settings): PlanPhase {
  const h = now.getHours() + now.getMinutes() / 60;
  const inRange = (a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
  if (inRange(s.phase_morning_start, s.phase_work_start)) return 'morning';
  if (inRange(s.phase_work_start, s.phase_evening_start)) return 'work';
  return 'evening';
}

const PHASE_COLOR: Record<PlanPhase, string> = {
  morning: 'var(--phase-morning)',
  work: 'var(--phase-work)',
  evening: 'var(--phase-evening)',
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hm(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  padding: SPACE.md,
  marginBottom: SPACE.md,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.sm,
  boxShadow: 'var(--shadow-sm)',
};
const label: React.CSSProperties = { fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide };

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <span style={{ display: 'block', alignSelf: 'stretch', height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}

// A card that folds to one line. `openEvent` lets another card ask it to
// open (Plan today's "write it below" jumps into the folded review).
export function Folded({
  title,
  summary,
  openEvent,
  children,
}: {
  title: string;
  summary: string;
  openEvent?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!openEvent) return undefined;
    const h = () => setOpen(true);
    window.addEventListener(openEvent, h);
    return () => window.removeEventListener(openEvent, h);
  }, [openEvent]);
  return (
    <div style={{ marginBottom: open ? 0 : SPACE.sm }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          marginBottom: open ? SPACE.sm : 0,
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          background: 'var(--surface)',
          color: 'var(--text)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold }}>{title}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {summary}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && children}
    </div>
  );
}

// ── Morning ──────────────────────────────────────────────────────────

// What last night's closure handed to this morning.
export function CarriedCard() {
  const L = useL();
  const [r, setR] = useState<MorningRitual | null>(null);
  useEffect(() => {
    morningRitualApi.today().then(setR).catch(() => setR(null));
  }, []);
  if (!r || !r.carried_from_date || !(r.today_outcome || r.first_move)) return null;
  return (
    <div style={{ ...card, flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md }}>
      <Moon size={16} color="var(--text-muted)" style={{ flex: 'none', marginTop: SPACE.hair }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.hair, minWidth: 0 }}>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{L("From last night's closure", 'গত রাতের ক্লোজার থেকে')}</span>
        <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold }}>{r.today_outcome || '—'}</span>
        {r.first_move && (
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
            {L('First move', 'প্রথম পদক্ষেপ')}: {r.first_move}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Work ─────────────────────────────────────────────────────────────

function running(t: Task): boolean {
  return t.sessions.length > 0 && t.sessions[t.sessions.length - 1].end === null;
}

// Today's three as a compact list with a start/stop per task.
export function WorkThree({ refreshSignal, onChanged }: { refreshSignal: number; onChanged: () => void }) {
  const L = useL();
  const [tasks, setTasks] = useState<Task[]>([]);
  const load = () => tasksApi.listStrike().then(setTasks).catch(() => setTasks([]));
  useEffect(() => {
    load();
  }, [refreshSignal]);
  const done = tasks.filter((t) => t.done).length;
  const act = (p: Promise<unknown>) => p.then(load).then(onChanged);
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={label}>{L("TODAY'S THREE", 'আজকের তিনটি')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {tasks.length ? L(`${done} of ${tasks.length} done`, `${tasks.length}টির ${done}টি শেষ`) : L('none chosen yet', 'এখনো বাছা হয়নি')}
        </span>
      </div>
      {tasks.map((t) => {
        const run = running(t);
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <button
              onClick={() => act(tasksApi.toggleDone(t.id))}
              aria-pressed={t.done}
              aria-label={t.done ? L('Mark not done', 'অসম্পূর্ণ') : L('Mark done', 'সম্পূর্ণ')}
              style={{
                width: 20,
                height: 20,
                flex: 'none',
                padding: 0,
                borderRadius: RADIUS.control,
                boxSizing: 'border-box',
                border: `2px solid ${t.done ? 'var(--success)' : 'var(--border)'}`,
                background: t.done ? 'var(--success)' : 'var(--surface)',
                color: 'var(--on-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {t.done && <Check size={12} strokeWidth={3} />}
            </button>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: TYPE_SIZE.sm,
                  fontWeight: TYPE_WEIGHT.medium,
                  textDecoration: t.done ? 'line-through' : 'none',
                  color: t.done ? 'var(--text-muted)' : 'var(--text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.text}
              </span>
              <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
                {t.project ? `${t.project} · ` : ''}
                {hm(t.secs)}
                {t.est ? ` / ${t.est}m` : ''}
              </span>
            </span>
            {!t.done && (
              <button
                onClick={() => act(tasksApi.toggleTimer(t.id))}
                aria-label={run ? L('Stop', 'থামুন') : L('Start', 'শুরু')}
                style={{
                  width: 28,
                  height: 28,
                  flex: 'none',
                  padding: 0,
                  borderRadius: RADIUS.pill,
                  border: '1.5px solid var(--accent)',
                  background: run ? 'var(--accent)' : 'var(--surface)',
                  color: run ? 'var(--on-accent)' : 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {run ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useProjects(signal: number) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  useEffect(() => {
    projectsApi.order().then(setOrder).catch(() => setOrder([]));
  }, [signal]);
  const named = order.filter((e) => e.project.name.trim());
  const secs = named.reduce((n, e) => n + e.project.secs_today, 0);
  const target = named.reduce((n, e) => n + e.project.target_minutes * 60, 0);
  return { secs, target };
}

export function DeepWorkToday({ refreshSignal }: { refreshSignal: number }) {
  const L = useL();
  const { secs, target } = useProjects(refreshSignal);
  return (
    <div style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
        <span style={label}>{L('DEEP WORK TODAY', 'আজকের ডিপ ওয়ার্ক')}</span>
        <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold }}>
          {hm(secs)} <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.normal, color: 'var(--text-muted)' }}>{L('of', '/')} {hm(target)}</span>
        </span>
      </div>
      <div style={{ width: 150 }}>
        <Bar pct={target ? (secs / target) * 100 : 0} color="var(--accent)" />
      </div>
    </div>
  );
}

// The rest of today's hour plan from the current hour on.
export function UpNext() {
  const L = useL();
  const [plan, setPlan] = useState<HourPlan | null>(null);
  useEffect(() => {
    hoursApi.get(todayIso()).then(setPlan).catch(() => setPlan(null));
  }, []);
  if (!plan) return null;
  const nowH = new Date().getHours();
  const later = plan.blocks
    .flatMap((b) => b.hours.map((h) => ({ ...h, block: b.key })))
    .filter((h) => h.text.trim() && !h.done && h.hour > nowH)
    .sort((a, b) => a.hour - b.hour)
    .slice(0, 4);
  if (!later.length) return null;
  const fmt = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={label}>{L('UP NEXT TODAY', 'আজ পরের কাজ')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>{L('from your Hours plan', 'আপনার Hours প্ল্যান থেকে')}</span>
      </div>
      {later.map((h) => (
        <div key={h.hour} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          <span style={{ width: 48, fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: `var(--phase-${h.block === 'sleep' ? 'sleep' : h.block})` }}>
            {fmt(h.hour)}
          </span>
          <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Evening ──────────────────────────────────────────────────────────

export function HowTodayWent({ refreshSignal, onOpenNightClosure }: { refreshSignal: number; onOpenNightClosure: () => void }) {
  const L = useL();
  const [three, setThree] = useState<Task[]>([]);
  const [plan, setPlan] = useState<HourPlan | null>(null);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [nc, setNc] = useState<NightClosure | null>(null);
  const { secs, target } = useProjects(refreshSignal);
  useEffect(() => {
    tasksApi.listStrike().then(setThree).catch(() => setThree([]));
    hoursApi.get(todayIso()).then(setPlan).catch(() => setPlan(null));
    healthApi.state().then(setHealth).catch(() => setHealth(null));
    nightClosureApi.today().then(setNc).catch(() => setNc(null));
  }, [refreshSignal]);

  const threeDone = three.filter((t) => t.done).length;
  const metrics: { name: string; value: string; pct: number; color: string }[] = [
    { name: L("Today's three", 'আজকের তিনটি'), value: `${threeDone}/${STRIKE_MAX}`, pct: (threeDone / STRIKE_MAX) * 100, color: 'var(--warning)' },
    {
      name: L('Hours', 'ঘণ্টা'),
      value: plan ? `${plan.total_done}/${plan.total_planned}` : '—',
      pct: plan && plan.total_planned ? (plan.total_done / plan.total_planned) * 100 : 0,
      color: 'var(--phase-work)',
    },
    { name: L('Deep work', 'ডিপ ওয়ার্ক'), value: hm(secs), pct: target ? (secs / target) * 100 : 0, color: 'var(--accent)' },
  ];
  if (health?.profile && health.log) {
    metrics.push({
      name: L('Health', 'স্বাস্থ্য'),
      value: `${health.log.meals.length}/4`,
      pct: (health.log.meals.length / 4) * 100,
      color: 'var(--success)',
    });
  }
  // One number for the day: the average of what was measured.
  const overall = Math.round(metrics.reduce((n, m) => n + Math.min(100, m.pct), 0) / metrics.length);
  const closed = nc?.closed_at != null;
  const written = nc ? nightWritten(nc) : 0;

  return (
    <div style={{ ...card, border: `2px solid ${PHASE_COLOR.evening}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <span
          style={{
            width: 48,
            height: 48,
            flex: 'none',
            borderRadius: RADIUS.pill,
            background: `conic-gradient(${PHASE_COLOR.evening} ${overall * 3.6}deg, ${PROGRESS_TRACK_SOFT} 0)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: RADIUS.pill,
              background: 'var(--surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
              color: PHASE_COLOR.evening,
            }}
          >
            {overall}%
          </span>
        </span>
        <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold }}>{L('How today went', 'আজ কেমন গেল')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))`, gap: SPACE.sm }}>
        {metrics.map((m) => (
          <div key={m.name} style={{ padding: SPACE.sm, borderRadius: RADIUS.control, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: SPACE.xs, minWidth: 0 }}>
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
            <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold, color: m.color }}>{m.value}</span>
            <Bar pct={m.pct} color={m.color} />
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.md,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          borderRadius: RADIUS.card,
          background: `color-mix(in srgb, ${PHASE_COLOR.evening} 8%, var(--surface))`,
        }}
      >
        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold }}>{L('Night Closure', 'নাইট ক্লোজার')}</span>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
            {closed ? L('Closed tonight', 'আজ রাতে বন্ধ হয়েছে') : L(`${written} of 4 written`, `৪টির ${written}টি লেখা`)}
          </span>
        </span>
        <button
          onClick={onOpenNightClosure}
          style={{
            height: 32,
            padding: `0 ${SPACE.md}px`,
            fontSize: TYPE_SIZE.xs,
            fontWeight: TYPE_WEIGHT.bold,
            borderRadius: RADIUS.control,
            border: `1px solid ${PHASE_COLOR.evening}`,
            background: closed ? 'var(--surface)' : PHASE_COLOR.evening,
            color: closed ? PHASE_COLOR.evening : 'var(--on-accent)',
            cursor: 'pointer',
          }}
        >
          {closed ? L('Review', 'দেখুন') : L('Close the day →', 'দিন বন্ধ করুন →')}
        </button>
      </div>
    </div>
  );
}

export function ThisWeek({ refreshSignal }: { refreshSignal: number }) {
  const L = useL();
  const [days, setDays] = useState<{ day: string; done: number; total: number; future: boolean }[]>([]);
  useEffect(() => {
    tasksApi.threeWeek().then(setDays).catch(() => setDays([]));
  }, [refreshSignal]);
  if (!days.length) return null;
  const today = todayIso();
  const full = days.filter((d) => !d.future && d.total >= STRIKE_MAX && d.done >= d.total).length;
  const past = days.filter((d) => !d.future && (d.total > 0 || d.day === today)).length;
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={label}>{L('THIS WEEK', 'এই সপ্তাহ')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', flex: 1 }}>{L('days all three got done', 'যেদিন তিনটিই শেষ')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)' }}>
          {full}/{past}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: SPACE.xs }}>
        {days.map((d) => {
          const all = d.total >= STRIKE_MAX && d.done >= d.total;
          const some = d.done > 0;
          // No record (history starts the first night this ran) reads as
          // blank, not as a missed day.
          const bg = d.future || (d.total === 0 && d.day !== today)
            ? 'var(--surface-2)'
            : all
              ? 'var(--success)'
              : some
                ? 'color-mix(in srgb, var(--success) 40%, var(--surface))'
                : 'color-mix(in srgb, var(--border) 50%, var(--surface))';
          return (
            <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE.xs }}>
              <span
                title={`${d.done}/${d.total}`}
                style={{
                  alignSelf: 'stretch',
                  height: 24,
                  borderRadius: RADIUS.control,
                  background: bg,
                  outline: d.day === today ? '1.5px solid var(--text)' : 'none',
                  outlineOffset: 1,
                  color: 'var(--on-accent)',
                  fontSize: TYPE_SIZE.xs,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {all ? '✓' : ''}
              </span>
              <span style={{ fontSize: TYPE_SIZE.xs, color: d.day === today ? 'var(--text)' : 'var(--text-muted)', fontWeight: d.day === today ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal }}>
                {new Date(`${d.day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Pick up to three of today's open Focus tasks for tomorrow; at the day
// rollover the engine makes them tomorrow's strike list.
export function TomorrowThree() {
  const L = useL();
  const [open, setOpen] = useState<Task[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [struckIds, setStruckIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    Promise.all([tasksApi.list('focus'), tasksApi.getTomorrowThree(), tasksApi.listStrike()])
      .then(([all, tomorrow, struck]) => {
        setStruckIds(new Set(struck.map((t) => t.id)));
        // Unfinished strike tasks first — they are the likeliest carry-over.
        const s = new Set(struck.map((t) => t.id));
        setOpen(all.filter((t) => !t.done).sort((a, b) => Number(s.has(b.id)) - Number(s.has(a.id))).slice(0, 8));
        setPicked(tomorrow.map((t) => t.id));
      })
      .catch(() => setOpen([]));
  }, []);
  const toggle = (id: number) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= STRIKE_MAX ? picked : [...picked, id];
    if (next === picked) return;
    setPicked(next);
    tasksApi.setTomorrowThree(next).catch(() => setPicked(picked));
  };
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <span style={label}>{L("TOMORROW'S THREE", 'আগামীকালের তিনটি')}</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {L(`${picked.length} of ${STRIKE_MAX} picked · become tomorrow's three`, `${STRIKE_MAX}টির ${picked.length}টি বাছা · কাল সকালে আজকের তিনটি হবে`)}
        </span>
      </div>
      {open.length === 0 && (
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {L('No open tasks — add some in EXECUTE › TASK LIST.', 'কোনো খোলা কাজ নেই — EXECUTE › TASK LIST-এ যোগ করুন।')}
        </span>
      )}
      {open.map((t) => {
        const on = picked.includes(t.id);
        const full = !on && picked.length >= STRIKE_MAX;
        return (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            disabled={full}
            aria-pressed={on}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
              padding: `${SPACE.xs}px 0`,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              textAlign: 'left',
              cursor: full ? 'default' : 'pointer',
              opacity: full ? 0.5 : 1,
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                flex: 'none',
                boxSizing: 'border-box',
                borderRadius: RADIUS.control,
                border: `2px solid ${on ? 'var(--success)' : 'var(--border)'}`,
                background: on ? 'var(--success)' : 'var(--surface)',
                color: 'var(--on-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on && <Check size={12} strokeWidth={3} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.text}</span>
              <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
                {struckIds.has(t.id) ? L('carried over · not done today', 'আজ শেষ হয়নি') : t.project ?? L('task list', 'টাস্ক লিস্ট')}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { PHASE_COLOR };
