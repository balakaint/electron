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

  const named = order.filter((e) => e.project.is_named);
  if (named.length === 0) return null;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: 8,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4, padding: '0 4px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)' }}>
          {L('DEEP WORK', 'ডিপ ওয়ার্ক')}
        </span>
      </div>

      {named.map((e) => {
        const p = e.project;
        const target = p.target_minutes * 60;
        const frac = target > 0 ? Math.min(1, p.secs_today / target) : 0;
        const live = isRunning(p);
        const open = selectedKey === p.key;
        // A project is open below: the other rows fold to the same
        // collapsed-header language HourPlan already uses for its
        // Morning/Work/Evening/Sleep blocks (▸/▾, coloured name, count
        // on the right) rather than a bespoke treatment — Zahid asked
        // for this specifically, after a first pass (plain shrink+dim)
        // didn't match the pattern he already knows from the HOURS tab
        // next door (2026-09-20). The dim (0.55, same value DayPhaseBars
        // uses) stays from that first pass. The ▶ only shows on the open
        // row — a collapsed row is "tap to look", not "tap to start",
        // matching HourPlan's own header click (toggles open, is not
        // itself an action).
        const collapsed = selectedKey !== null && !open;
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
              opacity: collapsed ? 0.55 : 1,
              cursor: collapsed ? 'pointer' : undefined,
              // The selected project is the one the list below belongs
              // to, so the row has to say so — otherwise the list has a
              // heading and no visible source.
              boxShadow: open ? `inset 0 0 0 1px ${p.accent_color}` : undefined,
            }}
            onClick={collapsed ? () => onSelect(p.key) : undefined}
            role={collapsed ? 'button' : undefined}
            tabIndex={collapsed ? 0 : undefined}
            onKeyDown={
              collapsed
                ? (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      onSelect(p.key);
                    }
                  }
                : undefined
            }
          >
            {/* The progress bar IS the row. A separate 56px track beside
                six long project names would take the width the names
                need at 545px, and it would say the same thing twice —
                the fill behind the row is the same fraction, read
                without looking anywhere else. Dropped entirely while
                collapsed — a fraction of a project you are not looking
                at is not the thing this row is for right now. */}
            {!collapsed && (
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
            )}
            {/* ▾/▸ — same glyphs and same meaning as HourPlan's own block
                header: which way this row opens, not a bullet. */}
            <span aria-hidden style={{ position: 'relative', color: p.accent_color, fontSize: 12, flex: 'none' }}>
              {open ? '▾' : '▸'}
            </span>
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
            {/* Open: clicking the name still just opens/closes — starting
                the timer is the ▶'s job alone, so "what is in this" and
                "I am working on this now" stay two targets. Collapsed:
                the whole row is already the click target (onClick
                above), so this is plain text, not a nested button. */}
            {collapsed ? (
              <span
                style={{
                  position: 'relative',
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: p.accent_color,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </span>
            ) : (
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
            )}
            {/* The count stays visible collapsed too — HourPlan's own
                header shows b.done/b.planned collapsed for the same
                reason: "where the day's work sits" is exactly what a
                collapsed header still needs to say. */}
            <span
              className="tabular"
              style={{
                position: 'relative',
                flex: 'none',
                fontSize: 12,
                // Reached the day's target for this project: the number
                // says so in the one colour this app uses for "done".
                color: frac >= 1 ? 'var(--success)' : collapsed ? p.accent_color : 'var(--text-muted)',
                fontWeight: frac >= 1 ? 600 : collapsed ? 700 : 400,
              }}
            >
              {fmtMins(p.secs_today)} / {p.target_minutes}m
            </span>
            {open && (
              <button
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggle(p.key);
                }}
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
            )}
          </div>
          </div>
        );
      })}
    </div>
  );
}
