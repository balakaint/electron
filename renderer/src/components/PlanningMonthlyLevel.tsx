import { useState } from 'react';
import { CalendarRange, Check, Circle } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { useAutofocus } from '../hooks/useAutofocus';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';
import { useL } from '../i18n';

// Ported verbatim from GoalHorizonSection.tsx (superseded by the
// Planning*Level components) — these are pure calendar-grid primitives
// keyed by a generic `deadlines: Set<string>`, no Goal-specific logic.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mondayOf(d: Date): string {
  const copy = new Date(d);
  const offset = (d.getDay() + 6) % 7;
  copy.setDate(d.getDate() - offset);
  return isoDate(copy);
}

// The type-picker composer, one level up from Weekly's — see
// PlanningWeeklyLevel.tsx's own NEW_NODE_TYPES comment for the full
// "type picker, from any level" contract (handoff doc §4.1). This
// card is a Milestone, so its own finest-grain creatable type is Win
// (a Task always needs a specific Win parent, which doesn't exist yet
// at this card's scope), plus reaching sideways/up to a sibling
// Milestone or a standalone Outcome — mirrors Weekly's Win/Milestone/
// Outcome reach exactly, shifted one level (ui-ux-audit, 2026-09-24:
// Monthly/Yearly had no inline creation at all before this).
type NewNodeType = 'win' | 'milestone' | 'outcome';
const NEW_NODE_TYPES: { key: NewNodeType; label: string }[] = [
  { key: 'win', label: 'Win' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'outcome', label: 'Outcome' },
];

const WEEKDAY_ABBR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
  date?: number;
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
      {date !== undefined && <span style={{ fontSize: 12, lineHeight: 1.4 }}>{date}</span>}
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: RADIUS.pill,
          background: hasDeadline ? accent : 'transparent',
        }}
      />
    </>
  );
  // Today used to be a solid accent fill with on-accent text — heavier
  // than the mockup's own restraint (its .cal-grid span.today /
  // .m-cell.current both do use a solid fill, actually, so this is a
  // deliberate softening PAST the mockup, not a mirror of it — matches
  // Zahid's own "not washed out, but not heavier than it needs to be"
  // steer from the visual-direction brief). `background` is left
  // `undefined` (never `'transparent'`) for the non-today case
  // specifically so .hover-outline's :hover rule below isn't shadowed
  // by a same-specificity inline declaration — see index.css's own
  // comment on this exact failure mode.
  const sharedStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 0',
    borderRadius: RADIUS.control,
    // Tinted via color-mix, not the generic --accent-light token — this
    // level's own colour (--goal-monthly here) has no pre-mixed light
    // variant of its own to reuse.
    background: isToday ? `color-mix(in srgb, ${accent} 16%, transparent)` : undefined,
    color: isToday ? accent : dim ? 'var(--text-faint)' : 'var(--text-muted)',
    opacity: dim ? 0.5 : 1,
  };
  if (!onSelect) {
    return <div style={sharedStyle}>{content}</div>;
  }
  return (
    <button
      onClick={onSelect}
      title="Jump to DAILY for this date"
      className="hover-outline"
      style={{ ...sharedStyle, border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      {content}
    </button>
  );
}

function MonthGrid({ deadlines, accent, onSelectDate }: { deadlines: Set<string>; accent: string; onSelectDate: (iso: string) => void }) {
  const today = new Date();
  const todayIso = isoDate(today);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

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
              // Every in-month day jumps to DAILY, not just ones that
              // already carry a Win deadline — gating on hasDeadline left
              // the entire calendar inert for any owner with no Win this
              // month yet (confirmed live: a real account with zero
              // Milestones this month had no clickable cell anywhere).
              // Matches WeekStrip's own always-clickable convention.
              // Out-of-month cells stay inert — they belong to whichever
              // adjacent month isn't the one this grid is showing.
              onSelect={c.inMonth ? () => onSelectDate(c.iso) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

interface OwnedMilestone {
  milestone: Milestone;
  wins: Win[];
  owner: GoalOwnerMeta;
}

// Returns EVERY Milestone this owner has for this month — see
// PlanningWeeklyLevel.tsx's own comment on findCurrentWins for why a
// single `.find()` silently hid real data the moment more than one
// Outcome/Milestone could exist for the same period (caught in code
// review).
async function findCurrentMilestones(owner: GoalOwnerMeta, year: number, month: number): Promise<OwnedMilestone[]> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const yearOutcomes = outcomes.filter((o) => o.year === year);
  const milestoneLists = await Promise.all(yearOutcomes.map((o) => planningApi.listMilestones(o.id)));
  const monthMilestones = milestoneLists.flat().filter((m) => m.month === month && m.year === year);
  return Promise.all(
    monthMilestones.map(async (milestone) => ({ milestone, wins: await planningApi.listWins(milestone.id), owner })),
  );
}

export default function PlanningMonthlyLevel({
  owners,
  accent,
  expanded,
  onToggle,
  onSelectDate,
  refreshSignal,
  onChanged,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
  onSelectDate: (iso: string) => void;
  refreshSignal: number;
  onChanged: () => void;
}) {
  const L = useL();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedMilestone[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentMilestones(o, year, month))).then((rs) => rs.flat())
      : null,
    [owners, year, month, refreshSignal],
    [],
  );

  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [addingType, setAddingType] = useState<NewNodeType>('win');
  const newTitleRef = useAutofocus<HTMLInputElement>(addingFor !== null);

  const addNode = (row: OwnedMilestone) => {
    const title = newTitle.trim();
    if (!title) return;
    const create =
      addingType === 'win'
        ? planningApi.createWin(row.milestone.id, title, mondayOf(today))
        : addingType === 'milestone'
          ? planningApi.createMilestone(row.milestone.outcome_id, title, month, year)
          : planningApi.createOutcome(row.owner.key, title, year);
    create.then(() => {
      setNewTitle('');
      setAddingType('win');
      refresh();
      onChanged();
    });
  };

  const deadlines = new Set(rows.flatMap((r) => r.wins.map((w) => w.week_start_date)));
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Time-vs-Progress-vs-Pace — locked at Week/Month level per the
  // interaction contract (elapsed-time % vs completed-work % vs a
  // derived pace chip). Caught in code review: PlanningProgressCard
  // already implemented the whole row, but neither caller passed it.
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const pace = { elapsedPct: Math.round((dayOfMonth / daysInMonth) * 100), elapsedLabel: `day ${dayOfMonth} of ${daysInMonth}` };

  return (
    <AccordionSection
      glyph={<CalendarRange size={16} />}
      label={L('MONTHLY', 'মাসিক')}
      period={monthLabel}
      done={rows.filter((r) => r.milestone.progress === 100).length}
      total={loaded ? rows.length : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : (
        <>
          <MonthGrid deadlines={deadlines} accent={accent} onSelectDate={onSelectDate} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              No Milestone set for this month yet — add one from the Goals panel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.milestone.id}
                  label={`MONTH MILESTONE · ${row.owner.label}`}
                  accent={accent}
                  title={row.milestone.title}
                  progress={row.milestone.progress}
                  fixed={row.milestone.fixed}
                  pace={pace}
                  detailsSummary={`${row.wins.length} weekly win(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.wins.map((w) => (
                      <li key={w.id} style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, fontSize: 12, padding: `${SPACE.xs}px 0` }}>
                        {w.progress === 100 ? <Check size={12} color="var(--success)" /> : <Circle size={12} color="var(--text-faint)" />}
                        <span>{w.title} — {w.progress}%</span>
                      </li>
                    ))}
                  </ul>
                  {addingFor === row.milestone.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, marginTop: SPACE.xs }}>
                      <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
                        {NEW_NODE_TYPES.map((t) => {
                          const on = addingType === t.key;
                          return (
                            <button
                              key={t.key}
                              onClick={() => setAddingType(t.key)}
                              title={`Add a ${t.label.toLowerCase()}`}
                              style={{
                                fontSize: TYPE_SIZE.sm,
                                padding: `${SPACE.hair}px ${SPACE.sm}px`,
                                borderRadius: RADIUS.pill,
                                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                background: on ? 'var(--accent-light)' : 'transparent',
                                color: on ? 'var(--accent)' : 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: SPACE.xs }}>
                        <input
                          ref={newTitleRef}
                          aria-label={`New ${addingType}`}
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNode(row);
                            if (e.key === 'Escape') { setAddingFor(null); setNewTitle(''); setAddingType('win'); }
                          }}
                          placeholder={addingType === 'win' ? 'New Win title…' : addingType === 'milestone' ? 'New Milestone title…' : 'New Outcome title…'}
                          style={{ flex: 1, fontSize: TYPE_SIZE.xs, padding: SPACE.xs }}
                        />
                        <button onClick={() => addNode(row)} title="Add" aria-label="Submit">+</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingFor(row.milestone.id); setNewTitle(''); setAddingType('win'); }}
                      title="Add a Win, or reach sideways/up to a Milestone/Outcome"
                      aria-label="Add to this Milestone or a level above it"
                      className="hover-accent"
                      style={{
                        fontSize: TYPE_SIZE.sm,
                        background: 'transparent',
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderRadius: RADIUS.pill,
                        padding: `${SPACE.hair}px ${SPACE.sm}px`,
                        marginTop: SPACE.xs,
                      }}
                    >
                      + add
                    </button>
                  )}
                </PlanningProgressCard>
              ))}
            </div>
          )}
        </>
      )}
    </AccordionSection>
  );
}
