import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { GoalOwnerMeta, PlanTask, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { useAutofocus } from '../hooks/useAutofocus';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';
import { useL } from '../i18n';

function mondayOf(d: Date): string {
  const copy = new Date(d);
  const offset = (d.getDay() + 6) % 7;
  copy.setDate(d.getDate() - offset);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`;
}

function weekRangeLabel(monday: string): string {
  const start = new Date(`${monday}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const day = (d: Date) => d.getDate();
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  return `${day(start)}–${day(end)} ${month(end)} ${end.getFullYear()}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Unlike Monthly/Yearly's grid, this carries no deadline dot — a Win's
// only date facet is `week_start_date` (the whole week, not a single
// day), so there's no per-day fact to mark here the way a Milestone's
// month or an Outcome's year has. Every cell is just clickable, plain.
function WeekStrip({ monday, accent, onSelectDate }: { monday: string; accent: string; onSelectDate: (iso: string) => void }) {
  const todayIso = isoDate(new Date());
  const start = new Date(`${monday}T00:00:00`);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <div style={{ display: 'flex', gap: SPACE.xs, marginBottom: SPACE.md }}>
      {days.map((d, i) => {
        const iso = isoDate(d);
        const isToday = iso === todayIso;
        return (
          <button
            key={iso}
            onClick={() => onSelectDate(iso)}
            title="Jump to DAILY for this date"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '4px 0',
              borderRadius: RADIUS.control,
              border: 'none',
              cursor: 'pointer',
              font: 'inherit',
              background: isToday ? accent : 'transparent',
              color: isToday ? 'var(--on-accent)' : 'var(--text-muted)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{WEEKDAY_LETTERS[i]}</span>
            <span style={{ fontSize: 12, lineHeight: 1.4 }}>{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}

interface OwnedWin {
  win: Win;
  owner: GoalOwnerMeta;
  tasks: PlanTask[];
}

// Returns EVERY Win this owner has for this week, not just the first —
// nothing in the schema stops a user creating two yearly goals for the
// same year (or two monthly/weekly goals for the same month/week), and
// Panel 2's composer has no uniqueness check either. An earlier `.find()`
// here silently hid every Win under any Outcome/Milestone past the
// first match — caught in code review as the same failure mode the
// Phase A migration's own dedupe was written to prevent, just moved to
// the read side and reachable the moment Panel 2 could create nodes.
async function findCurrentWins(owner: GoalOwnerMeta, monday: string): Promise<OwnedWin[]> {
  const today = new Date(`${monday}T00:00:00`);
  const outcomes = await planningApi.listOutcomes(owner.key);
  const yearOutcomes = outcomes.filter((o) => o.year === today.getFullYear());
  const milestoneLists = await Promise.all(yearOutcomes.map((o) => planningApi.listMilestones(o.id)));
  const monthMilestones = milestoneLists.flat().filter((m) => m.month === today.getMonth() + 1 && m.year === today.getFullYear());
  const winLists = await Promise.all(monthMilestones.map((m) => planningApi.listWins(m.id)));
  const weekWins = winLists.flat().filter((w) => w.week_start_date === monday);
  return Promise.all(
    weekWins.map(async (win) => ({ win, owner, tasks: await planningApi.listTasksForWin(win.id) })),
  );
}

export default function PlanningWeeklyLevel({
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
  const monday = mondayOf(new Date());
  const {
    data: rows,
    setData: setRows,
    loaded,
    loadError,
    refresh,
  } = useFetchState<OwnedWin[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentWins(o, monday))).then((rs) => rs.flat())
      : null,
    [owners, monday, refreshSignal],
    [],
  );

  const [carryOpenFor, setCarryOpenFor] = useState<number | null>(null);
  const [dayPickerFor, setDayPickerFor] = useState<number | null>(null);
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  // The 7 real dates of the win's own week — reused both for a task's
  // own "assign/move to a day" control and as Carry Forward's "pick a
  // date" option (the spec's own §5 note that a real date-picker was
  // deliberately deferred applies to an arbitrary-date picker; picking
  // among THIS week's 7 days is not that, and closes the "Schedule a
  // specific date" gap the mockup's own carry-forward menu names).
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${monday}T00:00:00`);
    d.setDate(d.getDate() + i);
    return { iso: isoDate(d), label: `${WEEKDAY_LETTERS[i]}${d.getDate()}` };
  });
  // One ref/effect at the top level, not inside the row .map() below —
  // only one Win's composer is ever open at a time, and a hook can't
  // live inside a loop whose iteration count changes as Wins are
  // added/removed. Reused across whichever row is currently composing.
  const newTaskRef = useAutofocus<HTMLInputElement>(addingFor !== null);

  // Refetches both the task list AND the win itself — `win.progress` is
  // resolved server-side (see engine.planning's win_progress), so a
  // task-only refetch leaves the progress bar/achieved-badge/header
  // count stale even though the checkbox and strikethrough update.
  // Caught live during Checkpoint 1 verification: toggling the one task
  // to done showed "1/1 supporting actions" but the bar stayed at 0%.
  const refreshWinAndTasks = (row: OwnedWin) =>
    Promise.all([planningApi.listWins(row.win.milestone_id), planningApi.listTasksForWin(row.win.id)]).then(
      ([wins, tasks]) => {
        const win = wins.find((w) => w.id === row.win.id) ?? row.win;
        setRows((rs) => rs.map((r) => (r.win.id === row.win.id ? { ...r, win, tasks } : r)));
        onChanged();
      },
    );

  const toggleTask = (row: OwnedWin, task: PlanTask) =>
    planningApi
      .editTask(task.id, { status: task.status === 'done' ? 'open' : 'done' })
      .then(() => refreshWinAndTasks(row));

  const carryForward = (row: OwnedWin, task: PlanTask, action: 'nextweek' | 'backlog' | 'drop') =>
    planningApi
      .carryForwardTask(task.id, action)
      .then(() => refreshWinAndTasks(row))
      .then(() => setCarryOpenFor(null));

  // Real scheduling, not the carry-forward endpoint's 'date' action —
  // that one is a deliberate alias to 'nextweek' server-side (see
  // engine/planning.py's own docstring on carry_forward_plan_task), so
  // routing through it here would silently not do what this button
  // says. `scheduleTask` is the actual, already-real endpoint for
  // setting an arbitrary scheduled_date + win_id.
  const scheduleTaskDay = (row: OwnedWin, task: PlanTask, iso: string | null) =>
    planningApi.scheduleTask(task.id, iso, row.win.id).then(() => {
      refreshWinAndTasks(row);
      setDayPickerFor(null);
      setCarryOpenFor(null);
    });

  const addTask = (row: OwnedWin) => {
    const title = newTaskText.trim();
    if (!title) return;
    planningApi.createTask(row.owner.key, title, row.win.id).then(() => {
      setNewTaskText('');
      refreshWinAndTasks(row);
    });
  };

  const totalWins = rows.length;
  const achievedWins = rows.filter((r) => r.win.progress === 100).length;

  // Time-vs-Progress-vs-Pace, locked at Week/Month level — see
  // PlanningMonthlyLevel.tsx's own comment on the same fix. `elapsedDays`
  // is 1-indexed and capped at 7 (today counts as a day in progress even
  // this early in it).
  const elapsedDays = Math.min(7, Math.max(1, Math.floor((Date.now() - new Date(`${monday}T00:00:00`).getTime()) / 86400000) + 1));
  const pace = { elapsedPct: Math.round((elapsedDays / 7) * 100), elapsedLabel: `${elapsedDays}/7 days` };

  return (
    <AccordionSection
      glyph={<CalendarDays size={16} />}
      label={L('WEEKLY', 'সাপ্তাহিক')}
      period={weekRangeLabel(monday)}
      done={achievedWins}
      total={loaded ? totalWins : null}
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
          <WeekStrip monday={monday} accent={accent} onSelectDate={onSelectDate} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              No Win set for this week yet — add one from the Goals panel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.win.id}
                  label={`WEEK WIN · ${row.owner.label}`}
                  accent={accent}
                  title={row.win.title}
                  criteria={row.win.criteria}
                  progress={row.win.progress}
                  fixed={row.win.fixed}
                  pace={pace}
                  detailsSummary={`${row.tasks.filter((t) => t.status === 'done').length} / ${row.tasks.length} supporting actions`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.tasks.map((t) => (
                      <li key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                          <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(row, t)} />
                          <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none', color: t.status === 'done' ? 'var(--text-faint)' : 'var(--text)' }}>
                            {t.title}
                          </span>
                          {/* The one control that makes this task actually
                              "the same object, multiple views" — without a
                              scheduled_date it never shows up in DAILY at
                              all (see Panel3.tsx's DailyTasksList), so it
                              only ever existed inside this Win's own card. */}
                          <button
                            onClick={(e) => { e.preventDefault(); setDayPickerFor((cur) => (cur === t.id ? null : t.id)); }}
                            title={t.scheduled_date ? 'Change which day this is scheduled for' : 'Schedule this task to a day'}
                            style={{
                              fontSize: TYPE_SIZE.xs,
                              background: t.scheduled_date ? 'var(--accent-light)' : 'transparent',
                              color: t.scheduled_date ? 'var(--accent)' : 'var(--text-faint)',
                              border: `1px solid ${t.scheduled_date ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: RADIUS.pill,
                              padding: `${SPACE.hair}px ${SPACE.sm}px`,
                              flex: 'none',
                            }}
                          >
                            {t.scheduled_date
                              ? new Date(`${t.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
                              : '+ day'}
                          </button>
                          {t.status !== 'done' && (
                            <button
                              onClick={() => setCarryOpenFor((cur) => (cur === t.id ? null : t.id))}
                              style={{ fontSize: TYPE_SIZE.xs, background: 'transparent', border: '1px solid var(--border)', borderRadius: RADIUS.pill, padding: `${SPACE.hair}px ${SPACE.sm}px` }}
                            >
                              Carry forward
                            </button>
                          )}
                        </label>
                        {dayPickerFor === t.id && (
                          <div style={{ display: 'flex', gap: SPACE.hair, paddingLeft: SPACE.xl, flexWrap: 'wrap' }}>
                            {weekDays.map((wd) => (
                              <button
                                key={wd.iso}
                                onClick={() => scheduleTaskDay(row, t, wd.iso)}
                                style={{
                                  fontSize: TYPE_SIZE.xs,
                                  padding: `${SPACE.hair}px ${SPACE.xs}px`,
                                  border: `1px solid ${wd.iso === t.scheduled_date ? 'var(--accent)' : 'var(--border)'}`,
                                  color: wd.iso === t.scheduled_date ? 'var(--accent)' : 'var(--text-muted)',
                                  borderRadius: RADIUS.control,
                                }}
                              >
                                {wd.label}
                              </button>
                            ))}
                            {t.scheduled_date && (
                              <button onClick={() => scheduleTaskDay(row, t, null)} style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>
                                Clear
                              </button>
                            )}
                          </div>
                        )}
                        {carryOpenFor === t.id && (
                          <div style={{ display: 'flex', gap: SPACE.xs, paddingLeft: SPACE.xl, flexWrap: 'wrap' }}>
                            <button onClick={() => carryForward(row, t, 'nextweek')} style={{ fontSize: TYPE_SIZE.xs }}>Next week</button>
                            <button onClick={() => { setCarryOpenFor(null); setDayPickerFor(t.id); }} style={{ fontSize: TYPE_SIZE.xs }}>Pick a date</button>
                            <button onClick={() => carryForward(row, t, 'backlog')} style={{ fontSize: TYPE_SIZE.xs }}>Backlog</button>
                            <button onClick={() => carryForward(row, t, 'drop')} style={{ fontSize: TYPE_SIZE.xs }}>Drop</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {addingFor === row.win.id ? (
                    <div style={{ display: 'flex', gap: SPACE.xs, marginTop: SPACE.xs }}>
                      <input
                        ref={newTaskRef}
                        aria-label="New task"
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') addTask(row);
                          if (e.key === 'Escape') { setAddingFor(null); setNewTaskText(''); }
                        }}
                        placeholder="Add task…"
                        style={{ flex: 1, fontSize: TYPE_SIZE.xs, padding: SPACE.xs }}
                      />
                      <button onClick={() => addTask(row)} title="Add task" aria-label="Submit new task">+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingFor(row.win.id); setNewTaskText(''); }}
                      title="Add a task"
                      aria-label="Add a supporting task to this Win"
                      style={{ fontSize: TYPE_SIZE.xs, background: 'transparent', border: '1px solid var(--border)', borderRadius: RADIUS.pill, padding: `${SPACE.hair}px ${SPACE.sm}px`, marginTop: SPACE.xs }}
                    >
                      + task
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
