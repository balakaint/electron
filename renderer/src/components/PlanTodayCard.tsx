import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { FocusTab, STRIKE_MAX, hoursApi, mindsetApi, morningRitualApi, tasksApi } from '../services/api';
import { useL } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Status {
  ritual: 'done' | 'started' | 'not';
  mindset: boolean;
  struck: number;
  hours: number;
}

async function load(): Promise<Status> {
  const day = todayIso();
  const [r, m, strike, plan] = await Promise.all([
    morningRitualApi.today(),
    mindsetApi.getMindset(day),
    tasksApi.listStrike(),
    hoursApi.get(day),
  ]);
  return {
    ritual: r.completed ? 'done' : r.started_at ? 'started' : 'not',
    mindset: m.mindset.trim().length > 0,
    struck: strike.length,
    hours: plan.total_planned,
  };
}

// PLAN TODAY — the four things PLAN asks of you each morning. Morning
// ritual took the slot Design today had until its box was removed
// (2026-09-25), as one
// checklist that knows which of them you have already done. Each step
// was already in the app, in four different places (two text boxes in
// the review card below, the three on EXECUTE › MIT, the hour plan on
// EXECUTE › HOURS), and nothing said whether today's planning was
// finished. This card reads those same four stores — it keeps no state
// of its own, so there is nothing here to fall out of step with them —
// and each unfinished step takes you to where it is done.
//
// Polled, not pushed: the four writers live in four components with no
// shared signal between them, and a 10-second re-read of four small
// local calls is cheaper than threading one through all of them.
export default function PlanTodayCard({ onGoExecute }: { onGoExecute: (tab: FocusTab) => void }) {
  const L = useL();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () =>
      load()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    run();
    const id = setInterval(run, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!status) return null;

  const focusBox = (id: string) => {
    // On the time-of-day PLAN the review sits folded; ask it to open
    // first, then find the box once it has rendered.
    window.dispatchEvent(new Event('plan-open-review'));
    setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
    }, 50);
  };

  const steps: { key: string; title: string; done: boolean; sub: string; go: () => void }[] = [
    {
      key: 'ritual',
      title: L('Morning ritual', 'মর্নিং রিচুয়াল'),
      done: status.ritual === 'done',
      sub:
        status.ritual === 'done'
          ? L('Done', 'শেষ হয়েছে')
          : status.ritual === 'started'
            ? L('In progress · Resume ›', 'চলছে · আবার শুরু ›')
            : L('Start it ›', 'শুরু করুন ›'),
      go: () => window.dispatchEvent(new Event('open-morning-ritual')),
    },
    {
      key: 'mindset',
      title: L('Mindset', 'মাইন্ডসেট'),
      done: status.mindset,
      sub: status.mindset ? L('Written', 'লেখা হয়েছে') : L('Write it below ›', 'নিচে লিখুন ›'),
      go: () => focusBox('plan-mindset'),
    },
    {
      key: 'mit',
      title: L("Today's three", 'আজকের তিনটি'),
      done: status.struck >= STRIKE_MAX,
      sub: L(`${status.struck} of ${STRIKE_MAX} chosen · MIT ›`, `${STRIKE_MAX}টির ${status.struck}টি · MIT ›`),
      go: () => onGoExecute('mit'),
    },
    {
      key: 'hours',
      title: L('Hours', 'ঘণ্টা'),
      done: status.hours > 0,
      sub:
        status.hours > 0
          ? L(`${status.hours} hours planned · HOURS ›`, `${status.hours} ঘণ্টা প্ল্যান · HOURS ›`)
          : L('Nothing planned · HOURS ›', 'কিছু প্ল্যান নেই · HOURS ›'),
      go: () => onGoExecute('hours'),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div
      className="card-elevated"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        marginBottom: SPACE.md,
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{L('Plan today', 'আজকের প্ল্যান')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {L(`${doneCount} of ${steps.length} ready`, `${steps.length}টির ${doneCount}টি তৈরি`)}
        </span>
        <span style={{ flex: 1 }} />
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          aria-label="Planning steps done"
          style={{ width: 96, height: 6, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}
        >
          <span style={{ display: 'block', height: '100%', width: `${(doneCount / steps.length) * 100}%`, background: 'var(--success)' }} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: SPACE.sm }}>
        {steps.map((s) => (
          <button
            key={s.key}
            onClick={s.go}
            className="hover-tint"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
              minWidth: 0,
              padding: SPACE.sm,
              borderRadius: RADIUS.card,
              // Unfinished steps get a dashed neutral edge, not the accent:
              // on warroom and journey --accent and --success are the same
              // colour, so an accent border beside a success tick made "to
              // do" and "done" look alike (and on energy a red border read
              // as an error). The tick is now the only coloured mark.
              border: `1px ${s.done ? 'solid' : 'dashed'} var(--border)`,
              background: s.done ? 'var(--surface-2, var(--surface))' : 'var(--surface)',
              textAlign: 'left',
              font: 'inherit',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 24,
                height: 24,
                flex: 'none',
                boxSizing: 'border-box',
                borderRadius: RADIUS.pill,
                border: `2px solid ${s.done ? 'var(--success)' : 'var(--border)'}`,
                background: s.done ? 'var(--success)' : 'transparent',
                color: 'var(--on-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {s.done && <Check size={14} strokeWidth={3} />}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{s.title}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: s.done ? 'var(--success)' : 'var(--text-muted)',
                  // Three to a row is narrow: let the hint wrap rather
                  // than cut off the "MIT ›" / "HOURS ›" it ends with.
                  lineHeight: 1.3,
                }}
              >
                {s.sub}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
