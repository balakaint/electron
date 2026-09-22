import { useEffect, useState, type ReactNode } from 'react';
import { Check, Circle } from 'lucide-react';
import { Goal, GoalHorizon, GoalOwnerKey, goalsApi } from '../services/api';
import AccordionSection from './AccordionSection';
import { RADIUS, SPACE } from '../spacing';

// A compact, read-mostly view onto the SAME Goal data Panel 2
// (GoalsPanel) owns and edits in full — the shared body for EXECUTE's
// WEEKLY/MONTHLY/YEARLY levels. One parameterized component rather than
// three near-duplicates, since all three are structurally identical: a
// list of that horizon's goals for the active owner, a checkbox, an
// accent rail. Editing a goal's note/deadline/checklist stays in Panel 2
// — this is a glance, not a second editor (toggling done is the only
// write this component makes).
//
// ⚠ `horizon` here must be the STORED key, not the label shown in Panel
// 2 — GoalsPanel.tsx's own HORIZONS array deliberately crosses them
// (stored "yearly" displays as "WEEKLY GOAL", etc). The caller is
// responsible for passing the horizon that matches what the user
// already understands as "weekly" from Panel 2, not the literal string
// "weekly" — see Panel3.tsx's own comment where this is wired up.
function weekRangeLabel(today = new Date()): string {
  const mondayOffset = (today.getDay() + 6) % 7; // days since Monday, Sun=0 wrapped to 6
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const day = (d: Date) => d.getDate();
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const year = sunday.getFullYear();
  return monday.getMonth() === sunday.getMonth()
    ? `${day(monday)}–${day(sunday)} ${month(sunday)} ${year}`
    : `${day(monday)} ${month(monday)} – ${day(sunday)} ${month(sunday)} ${year}`;
}

function monthLabel(today = new Date()): string {
  return today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function yearLabel(today = new Date()): string {
  return String(today.getFullYear());
}

// ── Calendar views for WEEKLY/MONTHLY (2026-09-22) ─────────────────────
// Mark days that carry a goal DEADLINE from the list already loaded
// below — not a daily-activity heatmap. That was the explicit choice
// over a real activity calendar: this component already has the goal
// list in hand, so marking deadlines costs no new backend call and ties
// the calendar directly to the content the user is looking at, where an
// hour-plan-completion heatmap would need a new date-range endpoint for
// a feature that's meant to be an at-a-glance orientation strip, not a
// second dashboard.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const offset = (d.getDay() + 6) % 7; // days since Monday
  copy.setDate(d.getDate() - offset);
  return copy;
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_ABBR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// A day cell shared by both the 7-day strip and the month grid — same
// today-highlight and deadline-dot idiom in both places, so WEEKLY and
// MONTHLY read as one system rather than two separately-designed
// calendars (the same reasoning AccordionSection unifies all four
// levels for).
function DayCell({
  label,
  date,
  isToday,
  hasDeadline,
  dim,
  accent,
  onSelect,
}: {
  label: string;
  date: number;
  isToday: boolean;
  hasDeadline: boolean;
  dim: boolean;
  accent: string;
  onSelect?: () => void;
}) {
  const content = (
    <>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{label}</span>
      )}
      <span style={{ fontSize: 12, lineHeight: 1.4 }}>{date}</span>
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: RADIUS.pill,
          background: hasDeadline ? (isToday ? 'var(--on-accent)' : accent) : 'transparent',
        }}
      />
    </>
  );
  const sharedStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 0',
    borderRadius: RADIUS.control,
    background: isToday ? accent : 'transparent',
    color: isToday ? 'var(--on-accent)' : dim ? 'var(--text-faint)' : 'var(--text-muted)',
    opacity: dim ? 0.5 : 1,
  };
  if (!onSelect) {
    return <div style={sharedStyle}>{content}</div>;
  }
  return (
    <button
      onClick={onSelect}
      title="Jump to this deadline below"
      style={{ ...sharedStyle, border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      {content}
    </button>
  );
}

function WeekStrip({ deadlines, accent, onSelectDeadline }: { deadlines: Set<string>; accent: string; onSelectDeadline: (iso: string) => void }) {
  const today = new Date();
  const todayIso = isoDate(today);
  const monday = startOfWeek(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  return (
    <div style={{ display: 'flex', gap: SPACE.xs, marginBottom: SPACE.md }}>
      {days.map((d, i) => {
        const iso = isoDate(d);
        const hasDeadline = deadlines.has(iso);
        return (
          <DayCell
            key={iso}
            label={WEEKDAY_LETTERS[i]}
            date={d.getDate()}
            isToday={iso === todayIso}
            hasDeadline={hasDeadline}
            dim={false}
            accent={accent}
            onSelect={hasDeadline ? () => onSelectDeadline(iso) : undefined}
          />
        );
      })}
    </div>
  );
}

function MonthGrid({ deadlines, accent, onSelectDeadline }: { deadlines: Set<string>; accent: string; onSelectDeadline: (iso: string) => void }) {
  const today = new Date();
  const todayIso = isoDate(today);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  // Leading/trailing days from neighboring months fill the grid rather
  // than leaving blank cells — dimmed, not clickable even if they carry
  // a deadline (that deadline belongs to a goal not in THIS month's
  // list, so there's nothing below to jump to).
  const cells: { date: number; iso: string; inMonth: boolean }[] = [];
  for (let i = startOffset; i > 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i + 1);
    cells.push({ date: d.getDate(), iso: isoDate(d), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: d, iso: isoDate(new Date(year, month, d)), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, cells.length - startOffset - daysInMonth + 1);
    cells.push({ date: d.getDate(), iso: isoDate(d), inMonth: false });
  }

  return (
    <div style={{ marginBottom: SPACE.md }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {WEEKDAY_ABBR.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((c) => {
          const hasDeadline = c.inMonth && deadlines.has(c.iso);
          return (
            <DayCell
              key={c.iso}
              label=""
              date={c.date}
              isToday={c.inMonth && c.iso === todayIso}
              hasDeadline={hasDeadline}
              dim={!c.inMonth}
              accent={accent}
              onSelect={hasDeadline ? () => onSelectDeadline(c.iso) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function GoalHorizonSection({
  horizon,
  ownerKey,
  accent,
  glyph,
  label,
  noun,
  periodKind,
  expanded,
  onToggle,
  onOpenGoal,
}: {
  horizon: GoalHorizon;
  ownerKey: GoalOwnerKey;
  accent: string;
  glyph: ReactNode;
  label: string;
  // "priorities" / "goals" / "milestones" — only used in the empty-state
  // copy, so each level still reads as its own thing at a glance.
  noun: string;
  periodKind: 'week' | 'month' | 'year';
  expanded: boolean;
  onToggle: () => void;
  // Fired (alongside the local flash) when a calendar day with a
  // deadline dot is clicked — Panel3 wires this to actually open that
  // goal in Panel 2, not just highlight it in this already-visible list.
  onOpenGoal: (goalId: number) => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  // Distinct from "genuinely zero goals" — without this, a slow or
  // failed fetch rendered identically to a confirmed-empty horizon,
  // telling the user "you have nothing here" when the truth was "still
  // loading" or "couldn't reach the app" (ui-ux-audit, 2026-09-22; same
  // class of bug GoalsPanel.tsx's own loadError already fixed for this
  // exact Goal data — this component just hadn't inherited it).
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Briefly highlights the goal row a calendar day-dot was clicked for
  // — the click needs to actually DO something, not just decorate the
  // header, since every goal is already visible in this un-scrolled list.
  const [flashDeadline, setFlashDeadline] = useState<string | null>(null);

  const refresh = () => {
    setLoadError(false);
    goalsApi
      .list(ownerKey, horizon)
      .then((gs) => {
        setGoals(gs);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  };

  useEffect(() => {
    setLoaded(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, horizon]);

  const done = goals.filter((g) => g.done).length;
  const period = periodKind === 'week' ? weekRangeLabel() : periodKind === 'month' ? monthLabel() : yearLabel();
  const deadlines = new Set(goals.map((g) => g.deadline).filter(Boolean));

  const toggleGoal = (id: number) =>
    goalsApi.toggle(id).then((updated) => setGoals((gs) => gs.map((g) => (g.id === updated.id ? updated : g))));

  const selectDeadline = (iso: string) => {
    setFlashDeadline(iso);
    setTimeout(() => setFlashDeadline((cur) => (cur === iso ? null : cur)), 1500);
    // Same-deadline collisions resolve to the first match, same
    // limitation the flash itself already has — good enough for "which
    // goal is that", not a guarantee of uniqueness.
    const match = goals.find((g) => g.deadline === iso);
    if (match) onOpenGoal(match.id);
  };

  return (
    <AccordionSection
      glyph={glyph}
      label={label}
      period={period}
      done={done}
      total={loaded ? goals.length : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.sm,
            fontSize: 12,
            color: 'var(--danger)',
            padding: `${SPACE.sm}px 0`,
          }}
        >
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12, flex: 'none' }} onClick={refresh}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {periodKind === 'week' && <WeekStrip deadlines={deadlines} accent={accent} onSelectDeadline={selectDeadline} />}
          {periodKind === 'month' && <MonthGrid deadlines={deadlines} accent={accent} onSelectDeadline={selectDeadline} />}
          {goals.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              Nothing here yet — add a {noun} in the Goals panel.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {goals.map((g) => (
                <li
                  key={g.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: SPACE.sm,
                    padding: `${SPACE.xs}px ${SPACE.xs}px`,
                    borderRadius: RADIUS.control,
                    background: g.deadline && g.deadline === flashDeadline ? `color-mix(in srgb, ${accent} 16%, transparent)` : 'transparent',
                    transition: 'background 200ms ease-out',
                  }}
                >
                  <span style={{ width: 3, alignSelf: 'stretch', minHeight: 16, background: g.done ? 'var(--border)' : accent }} />
                  <button
                    onClick={() => toggleGoal(g.id)}
                    title={g.done ? 'Mark not done' : 'Mark done'}
                    aria-label={g.done ? 'Mark not done' : 'Mark done'}
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      flex: 'none',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: g.done ? 'var(--success)' : 'var(--text-faint)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {g.done ? <Check size={15} /> : <Circle size={15} />}
                  </button>
                  <span
                    title={g.text}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textDecoration: g.done ? 'line-through' : 'none',
                      color: g.done ? 'var(--text-faint)' : 'var(--text)',
                    }}
                  >
                    {g.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AccordionSection>
  );
}
