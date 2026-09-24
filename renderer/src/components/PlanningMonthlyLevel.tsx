import { useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Win, planningApi } from '../services/api';
import PlanningPeriodHeader from './PlanningPeriodHeader';
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
const WEEKDAY_ABBR_BN = ['সো', 'ম', 'বু', 'বৃ', 'শু', 'শ', 'র'];

function DayCell({
  label,
  date,
  isToday,
  hasDeadline,
  taskCount = 0,
  dim,
  accent,
  onSelect,
}: {
  label: string;
  date?: number;
  isToday: boolean;
  hasDeadline: boolean;
  // Plan tasks scheduled on this day, from this month's Wins.
  taskCount?: number;
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
      <span style={{ display: 'flex', gap: 2 }}>
        <span
          style={{
            width: 4,
            height: 4,
            borderRadius: RADIUS.pill,
            background: hasDeadline ? accent : 'transparent',
          }}
        />
        {taskCount > 0 && (
          <span title={`${taskCount} scheduled`} style={{ width: 4, height: 4, borderRadius: RADIUS.pill, background: 'var(--text-muted)' }} />
        )}
      </span>
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

function MonthGrid({
  year,
  month,
  deadlines,
  taskCounts,
  accent,
  onSelectDate,
}: {
  year: number;
  month: number; // 0-indexed
  deadlines: Set<string>;
  taskCounts: Map<string, number>;
  accent: string;
  onSelectDate: (iso: string) => void;
}) {
  const L = useL();
  const todayIso = isoDate(new Date());
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
        {WEEKDAY_ABBR.map((w, wi) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
            {L(w, WEEKDAY_ABBR_BN[wi])}
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
              taskCount={c.inMonth ? taskCounts.get(c.iso) ?? 0 : 0}
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
  // Scheduled dates of the plan tasks under those wins, for the grid's
  // per-day marks. One call per Win, not one per day of the month.
  taskDates: string[];
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
    monthMilestones.map(async (milestone) => {
      const wins = await planningApi.listWins(milestone.id);
      const taskLists = await Promise.all(wins.map((w) => planningApi.listTasksForWin(w.id)));
      const taskDates = taskLists.flat().flatMap((t) => (t.scheduled_date ? [t.scheduled_date] : []));
      return { milestone, wins, taskDates, owner };
    }),
  );
}

export default function PlanningMonthlyLevel({
  owners,
  accent,
  onSelectDate,
  refreshSignal,
  onChanged,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  onSelectDate: (iso: string) => void;
  refreshSignal: number;
  onChanged: () => void;
}) {
  const L = useL();
  // Months away from this one; 0 is the current month.
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth() + offset, 1);
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
        ? planningApi.createWin(row.milestone.id, title, mondayOf(offset === 0 ? now : today))
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
  const taskCounts = new Map<string, number>();
  for (const iso of rows.flatMap((r) => r.taskDates)) taskCounts.set(iso, (taskCounts.get(iso) ?? 0) + 1);
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Time-vs-Progress-vs-Pace — locked at Week/Month level per the
  // interaction contract (elapsed-time % vs completed-work % vs a
  // derived pace chip). Caught in code review: PlanningProgressCard
  // already implemented the whole row, but neither caller passed it.
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  // Pace only means something for the month you are living in.
  const pace = offset === 0 ? { elapsedPct: Math.round((dayOfMonth / daysInMonth) * 100), elapsedLabel: L(`day ${dayOfMonth} of ${daysInMonth}`, `${daysInMonth} দিনের ${dayOfMonth}তম দিন`) } : undefined;
  const achieved = rows.filter((r) => r.milestone.progress === 100).length;

  return (
    <div>
      <PlanningPeriodHeader
        label={monthLabel}
        summary={loaded && rows.length > 0 ? L(`${achieved} of ${rows.length} milestones achieved`, `${rows.length}টির ${achieved}টি মাইলস্টোন অর্জিত`) : null}
        isCurrent={offset === 0}
        resetLabel={L('This month', 'এই মাস')}
        onStep={(dir) => setOffset((o) => o + dir)}
        onReset={() => setOffset(0)}
      />
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>{L('Loading…', 'লোড হচ্ছে…')}</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>{L("Couldn't load — check the app is connected.", 'লোড হয়নি — অ্যাপ সংযুক্ত আছে কিনা দেখুন।')}</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>{L('Retry', 'আবার চেষ্টা')}</button>
        </div>
      ) : (
        <>
          <MonthGrid year={year} month={month - 1} deadlines={deadlines} taskCounts={taskCounts} accent={accent} onSelectDate={onSelectDate} />
          <div style={{ display: 'flex', gap: SPACE.md, fontSize: 12, color: 'var(--text-muted)', marginTop: -SPACE.sm, marginBottom: SPACE.md }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
              <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: accent }} />
              {L("A week's Win starts", 'সপ্তাহের জয় শুরু')}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE.xs }}>
              <span style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: 'var(--text-muted)' }} />
              {L('Tasks scheduled', 'নির্ধারিত কাজ')}
            </span>
          </div>
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              {L('No Milestone set for this month yet — add one from the Goals panel.', 'এই মাসের কোনো মাইলস্টোন নেই — Goals প্যানেল থেকে যোগ করুন।')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.milestone.id}
                  label={`${L('MONTH MILESTONE', 'মাসিক মাইলস্টোন')} · ${row.owner.label}`}
                  accent={accent}
                  ownerColor={row.owner.color}
                  title={row.milestone.title}
                  progress={row.milestone.progress}
                  fixed={row.milestone.fixed}
                  pace={pace}
                  detailsSummary={L(`${row.wins.length} weekly win(s)`, `${row.wins.length}টি সাপ্তাহিক জয়`)}
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
                      {L('+ add', '+ যোগ')}
                    </button>
                  )}
                </PlanningProgressCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
