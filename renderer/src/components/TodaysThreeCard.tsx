import { Check, Pause, Play, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STRIKE_MAX, Task, tasksApi } from '../services/api';
import { useL } from '../i18n';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';

function fmtSecs(secs: number): string {
  const m = Math.floor(Math.max(0, secs) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

function fmtEst(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return mins % 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${Math.floor(mins / 60)}h`;
}

function isRunning(t: Task): boolean {
  return t.sessions.length > 0 && t.sessions[t.sessions.length - 1].end === null;
}

// TODAY'S THREE — the tasks struck for today, as three numbered slots.
//
// History: a STRIKE card used to hold these, and was removed (see the
// comment where DeepWorkCard now stands in TaskList) because it made
// the commitment a separate bookkeeping step. This card is NOT that one
// back. It adds no step: the rows' own "+ STRIKE" chips still commit,
// and this only SHOWS the result — which of the three is running,
// which are done, and how many slots are still open — above the list
// the chips live in, where it used to take reading every row's chip to
// know. Requested after the 2026-09-24 redesign mockup.
//
// Every action here is one the list below already offers on the same
// task (start/pause, done, first-of-three, un-strike), wired to the
// same handlers, so the two can never disagree.
export default function TodaysThreeCard({
  struck,
  nowId,
  onStart,
  onToggleDone,
  onSetFirst,
  onUnstrike,
}: {
  struck: Task[];
  nowId: number | null;
  onStart: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onSetFirst: (t: Task) => void;
  onUnstrike: (t: Task) => void;
}) {
  const L = useL();
  // Which of the three were picked last night (PLAN's Tomorrow's three).
  const [lastNight, setLastNight] = useState<number[]>([]);
  useEffect(() => {
    tasksApi.pickedLastNight().then(setLastNight).catch(() => setLastNight([]));
  }, []);
  // First of the three leads, then the order the list already has.
  const ordered = [...struck].sort((a, b) => Number(b.mit) - Number(a.mit));
  const done = ordered.filter((t) => t.done).length;
  const running = ordered.some(isRunning);
  const open = STRIKE_MAX - ordered.length;

  const status: string[] = [];
  if (done) status.push(L(`${done} done`, `${done}টি শেষ`));
  if (running) status.push(L('1 running', '১টি চলছে'));
  if (open > 0) status.push(L(`${open} open ${open === 1 ? 'slot' : 'slots'}`, `${open}টি খালি`));

  const iconBtn = {
    width: 32,
    height: 32,
    flex: 'none' as const,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

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
        <span style={{ fontSize: 13, fontWeight: 700 }}>{L("Today's three", 'আজকের তিনটি')}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {status.join(' · ') || L('Nothing chosen yet', 'এখনো কিছু বাছা হয়নি')}
        </span>
        <span style={{ flex: 1 }} />
        <span
          role="progressbar"
          aria-label="Today's three done"
          aria-valuemin={0}
          aria-valuemax={STRIKE_MAX}
          aria-valuenow={done}
          style={{ width: 64, height: 6, flex: 'none', borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}
        >
          <span style={{ display: 'block', height: '100%', width: `${(done / STRIKE_MAX) * 100}%`, background: 'var(--success)' }} />
        </span>
      </div>

      {Array.from({ length: STRIKE_MAX }, (_, i) => {
        const t = ordered[i];
        if (!t) {
          return (
            <div
              key={`empty-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: SPACE.md,
                minHeight: 48,
                padding: `${SPACE.sm}px ${SPACE.md}px`,
                boxSizing: 'border-box',
                borderRadius: RADIUS.card,
                border: '1px dashed var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 24,
                  height: 24,
                  flex: 'none',
                  borderRadius: RADIUS.pill,
                  background: 'var(--surface-2, var(--surface))',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13 }}>
                {L('Open slot — + STRIKE a task from the list below', 'খালি — নিচের তালিকা থেকে + STRIKE করুন')}
              </span>
            </div>
          );
        }

        const live = isRunning(t);
        const isNow = nowId === t.id;
        const meta: string[] = [];
        if (t.done) meta.push(L('Done', 'শেষ'));
        else if (live) meta.push(L('Running', 'চলছে'));
        else if (isNow) meta.push(L('In NOW', 'NOW-এ আছে'));
        if (t.secs > 0) meta.push(fmtSecs(t.secs));
        if (t.est > 0) meta.push(`~${fmtEst(t.est)}`);
        if (lastNight.includes(t.id)) meta.push(L('☾ picked last night', '☾ গত রাতে বাছা'));

        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: SPACE.sm,
              minHeight: 48,
              padding: `${SPACE.xs}px ${SPACE.sm}px ${SPACE.xs}px ${SPACE.md}px`,
              boxSizing: 'border-box',
              borderRadius: RADIUS.card,
              border: `1px solid ${live ? 'var(--accent)' : 'var(--border)'}`,
              background: live
                ? 'color-mix(in srgb, var(--accent) 7%, var(--surface))'
                : t.done
                  ? 'var(--surface-2, var(--surface))'
                  : 'var(--surface)',
            }}
          >
            {/* The number is also the done toggle: a slot is ticked where
                it is counted. */}
            <button
              onClick={() => onToggleDone(t)}
              aria-pressed={t.done}
              aria-label={t.done ? `Mark "${t.text}" not done` : `Mark "${t.text}" done`}
              title={t.done ? 'Mark not done' : 'Mark done'}
              style={{
                width: 24,
                height: 24,
                flex: 'none',
                padding: 0,
                borderRadius: RADIUS.pill,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                background: t.done ? 'var(--success)' : live ? 'var(--accent)' : 'var(--surface-2, var(--surface))',
                color: t.done ? 'var(--on-success)' : live ? 'var(--on-accent)' : 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {t.done ? <Check size={14} strokeWidth={3} /> : i + 1}
            </button>

            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: t.done ? 'var(--text-muted)' : 'var(--text)',
                  textDecoration: t.done ? 'line-through' : undefined,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.text}
              </span>
              {meta.length > 0 && (
                <span style={{ fontSize: 12, color: live ? 'var(--accent)' : 'var(--text-muted)', fontWeight: live ? 700 : 400 }}>
                  {meta.join(' · ')}
                </span>
              )}
            </span>

            <button
              onClick={() => onSetFirst(t)}
              aria-pressed={t.mit}
              aria-label={t.mit ? 'First of the three' : 'Make this the first of the three'}
              title={t.mit ? 'First of the three — NOW opens here' : 'Make this the first of the three'}
              className="btn-ghost"
              style={{ ...iconBtn, color: t.mit ? 'var(--warning)' : 'var(--text-faint)' }}
            >
              <Star size={16} fill={t.mit ? 'currentColor' : 'none'} />
            </button>
            {!t.done && (
              <button
                onClick={() => onStart(t)}
                aria-label={live ? `Pause "${t.text}"` : `Work on "${t.text}" now`}
                title={live ? 'Pause' : 'Work on this now'}
                className={live ? 'btn-primary' : 'btn-ghost'}
                style={iconBtn}
              >
                {live ? <Pause size={16} /> : <Play size={16} />}
              </button>
            )}
            <button
              onClick={() => onUnstrike(t)}
              aria-label={`Take "${t.text}" out of today's three`}
              title="Take out of today's three (it stays in the list)"
              className="btn-ghost"
              style={{ ...iconBtn, color: 'var(--text-muted)' }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
