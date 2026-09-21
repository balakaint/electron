import { useEffect, useRef, useState } from 'react';
import { Project, ProjectKey, ProjectOrderEntry, projectsApi } from '../services/api';
import { useL } from '../i18n';
import { accentText } from '../themes';
import { RADIUS } from '../spacing';

// DEEP WORK — the box that stands where STRIKE used to.
//
// The STRIKE card asked you to name three tasks before the day started,
// and Zahid's objection to it is the real one: the commitment step is
// bookkeeping you have to remember to do, and the day it describes is
// already visible somewhere else. What he actually works on is SIX
// PROJECTS, and the question he opens this screen with is "how much
// have I put into each of them today" — a question the app already has
// the answer to and was only drawing as six anonymous segments.
//
// So nothing here is committed by hand. The rows are the named projects,
// the numbers are the timers, and pressing ▶ is the whole interaction:
// the commitment IS the time you put in.
//
// No ceiling on the rows either (his call): the list is however many
// projects you have named, because a limit here would be a limit on your
// own project list rather than on today.
//
// A project OPEN below used to fold the other rows to a collapsed
// header (tried plain shrink+dim, then HourPlan's own ▸/▾ header
// language) before Zahid settled on this: when he is deep in one
// project he does not want the others on screen AT ALL, not even as a
// quiet row — "less distraction" meant literally less, not smaller
// (2026-09-20). They come back via the "← today's list" button in this
// card's own header — originally a link in TaskList.tsx below this
// card, moved here after a quick-review found it too easy to miss,
// separated from the change it undoes.

function fmtMins(secs: number): string {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function isRunning(p: Project): boolean {
  return p.running_since !== null;
}

export default function DeepWorkCard({
  onChanged,
  selectedKey,
  onSelect,
}: {
  onChanged: () => void;
  selectedKey: ProjectKey | null;
  onSelect: (key: ProjectKey | null) => void;
}) {
  const L = useL();
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  // Clicking "back to all 6" unmounts the button the user's focus was
  // on — browsers drop focus to <body> with nothing visible, so the
  // next Tab restarts from the top of the page instead of continuing
  // naturally (quick-review finding, 2026-09-20). This heading is a
  // stable landmark that survives every state DeepWorkCard renders, so
  // focus has somewhere real to land instead.
  const headingRef = useRef<HTMLSpanElement>(null);
  const backToAll = () => {
    onSelect(null);
    // The row about to disappear is what the browser is about to strip
    // focus from; queue the move for after that DOM change lands.
    requestAnimationFrame(() => headingRef.current?.focus());
  };
  // A running timer's seconds live on the server. Rather than counting
  // locally and drifting from the credited time (the mistake NOW's card
  // documents), the card re-asks — but only while something is actually
  // running, so an idle panel makes no requests at all.
  const running = useRef(false);

  const refresh = () =>
    projectsApi.order().then((o) => {
      setOrder(o);
      running.current = o.some((e) => e.project.is_named && isRunning(e.project));
    });

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (running.current) refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, []);

  // ▶ does both: starts the clock, and points the LIST below at what
  // the clock is for. Stopping does not clear the selection — you are
  // still looking at that project's work.
  const toggle = (key: ProjectKey) => {
    onSelect(key);
    projectsApi.toggleTimer(key).then(() => {
      refresh();
      onChanged();
    });
  };

  const named = order.filter((e) => e.project.is_named && (selectedKey === null || e.project.key === selectedKey));
  if (named.length === 0) return null;

  return (
    <div
      className="card-elevated"
      style={{
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: 8,
        marginBottom: 12,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, padding: '0 4px' }}>
        <span
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)' }}
        >
          {L('DEEP WORK', 'ডিপ ওয়ার্ক')}
        </span>
        {selectedKey !== null && (
          // Was a 12px .btn-ghost link in a different component
          // (TaskList.tsx), in a mostly blank stretch of screen below
          // this card — easy to miss as the one way back to the other 5
          // projects (quick-review finding, 2026-09-20). Moved into the
          // header of the card that did the narrowing, with the default
          // button's visible border/background instead of ghost, since
          // it is now the sole path back, not a quiet secondary action.
          <button
            onClick={backToAll}
            title="Show all projects again"
            style={{ marginLeft: 'auto', fontSize: 12, height: 22, padding: '0 8px' }}
          >
            ← {L("today's list", 'আজকের লিস্ট')}
          </button>
        )}
      </div>

      {named.map((e) => {
        const p = e.project;
        const target = p.target_minutes * 60;
        const frac = target > 0 ? Math.min(1, p.secs_today / target) : 0;
        const live = isRunning(p);
        const open = selectedKey === p.key;
        return (
          <div key={p.key}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px',
              minHeight: 32,
              borderRadius: RADIUS.control,
              overflow: 'hidden',
              // The selected project is the one the list below belongs
              // to, so the row has to say so — otherwise the list has a
              // heading and no visible source.
              boxShadow: open ? `inset 0 0 0 1px ${p.accent_color}` : undefined,
            }}
          >
            {/* The progress bar IS the row. A separate 56px track beside
                six long project names would take the width the names
                need at 545px, and it would say the same thing twice —
                the fill behind the row is the same fraction, read
                without looking anywhere else. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${frac * 100}%`,
                background: `color-mix(in srgb, ${p.accent_color} 14%, transparent)`,
                pointerEvents: 'none',
              }}
            />
            {/* The number is the badge from the project card and from the
                segment in the bar above — same number, same place in the
                order, so the eye can carry one identity across three
                surfaces instead of matching names. */}
            <span
              className="tabular"
              style={{
                position: 'relative',
                width: 18,
                textAlign: 'center',
                flex: 'none',
                fontSize: 12,
                fontWeight: 700,
                color: accentText(p.accent_color),
              }}
            >
              {e.number}
            </span>
            {/* Clicking the NAME opens the list without starting
                anything. Two intentions, two targets: "what is in this"
                and "I am working on this now". */}
            <button
              onClick={() => onSelect(open ? null : p.key)}
              aria-pressed={open}
              title={open ? 'Back to today’s list' : 'Show this project’s tasks below'}
              className="btn-ghost"
              style={{
                position: 'relative',
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
                fontSize: 14,
                fontWeight: live ? 600 : 400,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                padding: 0,
                height: 24,
              }}
            >
              {p.name}
            </button>
            <span
              className="tabular"
              style={{
                position: 'relative',
                flex: 'none',
                fontSize: 12,
                // Reached the day's target for this project: the number
                // says so in the one colour this app uses for "done".
                color: frac >= 1 ? 'var(--success)' : 'var(--text-muted)',
                fontWeight: frac >= 1 ? 600 : 400,
              }}
            >
              {fmtMins(p.secs_today)} / {p.target_minutes}m
            </span>
            <button
              onClick={() => toggle(p.key)}
              aria-pressed={live}
              title={live ? `Stop the timer on ${p.name}` : `Start deep work on ${p.name}`}
              className="btn-ghost"
              style={{
                position: 'relative',
                width: 24,
                height: 24,
                padding: 0,
                flex: 'none',
                color: live ? 'var(--danger)' : 'var(--accent)',
              }}
            >
              {live ? '⏸' : '▶'}
            </button>
          </div>
          </div>
        );
      })}
    </div>
  );
}
