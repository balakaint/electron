import { useState } from 'react';
import { GoalOwnerMeta, PlanTask, Win, planningApi } from '../services/api';
import PlanningPeriodHeader from './PlanningPeriodHeader';
import PlanningProgressCard from './PlanningProgressCard';
import MiniCalendarPicker from './MiniCalendarPicker';
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
  // A week that crosses a month names both months ("28 Sep – 4 Oct"):
  // "28–4 Oct" reads as a range running backwards.
  if (start.getMonth() !== end.getMonth()) {
    return `${day(start)} ${month(start)} – ${day(end)} ${month(end)} ${end.getFullYear()}`;
  }
  return `${day(start)}–${day(end)} ${month(end)} ${end.getFullYear()}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_LETTERS_BN = ['সো', 'ম', 'বু', 'বৃ', 'শু', 'শ', 'র'];

// Unlike Monthly/Yearly's grid, this carries no deadline dot — a Win's
// only date facet is `week_start_date` (the whole week, not a single
// day), so there's no per-day fact to mark here the way a Milestone's
// month or an Outcome's year has. Every cell is just clickable, plain.
function WeekStrip({
  monday,
  accent,
  counts,
  onSelectDate,
}: {
  monday: string;
  accent: string;
  // Tasks scheduled on each day (ISO date -> count), from the Wins below.
  counts: Map<string, number>;
  onSelectDate: (iso: string) => void;
}) {
  const L = useL();
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
            className="hover-tint"
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
              // `undefined`, never `'transparent'`, in the non-today
              // case — an inline background (even 'transparent') shadows
              // .hover-tint's :hover rule in index.css. Tinted via
              // color-mix rather than the generic --accent-light token,
              // since `accent` here is the LEVEL's own colour
              // (--goal-yearly for Weekly), not the theme's accent —
              // --accent-light has no per-level equivalent to reuse.
              background: isToday ? `color-mix(in srgb, ${accent} 16%, transparent)` : undefined,
              color: isToday ? accent : 'var(--text-muted)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{L(WEEKDAY_LETTERS[i], WEEKDAY_LETTERS_BN[i])}</span>
            <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: isToday ? accent : 'var(--text)' }}>{d.getDate()}</span>
            <span style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-muted)' }}>
              {counts.get(iso) ? L(`${counts.get(iso)} ${counts.get(iso) === 1 ? 'task' : 'tasks'}`, `${counts.get(iso)}টি কাজ`) : '—'}
            </span>
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
  // The Win's own Milestone's Outcome — not on Win itself (only
  // milestone_id is). Needed so the composer's Milestone/Outcome type
  // chips (see NewNodeType below) know what to attach a new Milestone
  // to without a second round-trip at click time.
  outcomeId: number | null;
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
    weekWins.map(async (win) => {
      const milestone = monthMilestones.find((m) => m.id === win.milestone_id);
      return { win, owner, outcomeId: milestone?.outcome_id ?? null, tasks: await planningApi.listTasksForWin(win.id) };
    }),
  );
}

// The "type picker, from any level" interaction — see the mockup's own
// per-level composer (a row of Task/Outcome/Milestone chips next to its
// "+ ADD" form) and the handoff doc's §4.1. Reuses the exact same
// createOutcome/createMilestone/createWin/createTask calls GoalsPanel
// already makes — this only adds a second, EXECUTE-surface entry point
// to them, not a new creation path. 'win' isn't in the mockup's own chip
// set (it IS the level being composed on there); it's included here
// since this composer lives inside a specific Win's own card, one level
// below where the mockup's chip row sits.
type NewNodeType = 'task' | 'win' | 'milestone' | 'outcome';
const NEW_NODE_TYPES: { key: NewNodeType; label: string }[] = [
  { key: 'task', label: 'Task' },
  { key: 'win', label: 'Win' },
  { key: 'milestone', label: 'Milestone' },
  { key: 'outcome', label: 'Outcome' },
];

export default function PlanningWeeklyLevel({
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
  // Weeks away from this one; 0 is the current week.
  const [offset, setOffset] = useState(0);
  const monday = (() => {
    const d = new Date(`${mondayOf(new Date())}T00:00:00`);
    d.setDate(d.getDate() + offset * 7);
    return isoDate(d);
  })();
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
  // "Any date…" — a real calendar-grid popup, separate from the 7
  // weekday buttons above it (dayPickerFor). The handoff doc's own §5
  // flagged a real arbitrary-date picker as deliberately out of scope
  // for Phase A; Zahid asked for it directly in a later session, so
  // it's real now, not just a documented gap. `calendarMonth` is the
  // month/year the popup is currently BROWSING, independent of the
  // task's own scheduled_date — initialised on open, not derived from
  // `monday`, since the whole point is reaching a month other than the
  // current week's.
  const [anyDateFor, setAnyDateFor] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [addingType, setAddingType] = useState<NewNodeType>('task');
  // The 7 real dates of the win's own week — reused both for a task's
  // own "assign/move to a day" control and as Carry Forward's "pick a
  // date" option. `anyDateFor`'s calendar popup, right below, covers
  // anything past this week.
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

  // Opens the real any-date calendar directly, not the 7-day strip —
  // "Pick a date" used to reopen dayPickerFor (only this week's 7
  // days), which meant the one button explicitly promising arbitrary-
  // date choice couldn't reach any date outside the current week
  // (ui-ux-audit, 2026-09-24: this exact mismatch is what made "how do
  // I get to Oct 21" unfindable live). Shared by both the standalone
  // "Any date…" pill and Carry Forward's "Pick a date" so the two never
  // drift apart again.
  const openAnyDatePicker = (task: PlanTask) => {
    const base = task.scheduled_date ? new Date(`${task.scheduled_date}T00:00:00`) : new Date();
    setCalendarMonth({ year: base.getFullYear(), month: base.getMonth() + 1 });
    setAnyDateFor(task.id);
  };

  // Branches on the type chip, not just the title — this is the "type
  // picker, from any level" contract (handoff doc §4.1): the same
  // composer that adds a supporting Task can instead reach up and add a
  // Win/Milestone/Outcome, exactly the calls GoalsPanel's own per-level
  // "+" already makes, just reachable from EXECUTE now too. A new Win
  // attaches to THIS win's own milestone; a new Milestone to that
  // milestone's outcome; a new Outcome is standalone. `refresh()` (not
  // just `refreshWinAndTasks`) because a new Win can add a whole new
  // card to `rows`, which a single-row patch can't produce.
  const addNode = (row: OwnedWin) => {
    const title = newTaskText.trim();
    if (!title) return;
    if (addingType === 'milestone' && row.outcomeId == null) return;
    // The viewed week's month and year, not today's: adding a Milestone
    // from next month's week belongs to next month.
    const today = new Date(`${monday}T00:00:00`);
    const create =
      addingType === 'win'
        ? planningApi.createWin(row.win.milestone_id, title, monday)
        : addingType === 'milestone'
          ? planningApi.createMilestone(row.outcomeId as number, title, today.getMonth() + 1, today.getFullYear())
          : addingType === 'outcome'
            ? planningApi.createOutcome(row.owner.key, title, today.getFullYear())
            : planningApi.createTask(row.owner.key, title, row.win.id);
    create.then(() => {
      setNewTaskText('');
      setAddingType('task');
      refresh();
      onChanged();
    });
  };

  const totalWins = rows.length;
  const achievedWins = rows.filter((r) => r.win.progress === 100).length;

  // Time-vs-Progress-vs-Pace, locked at Week/Month level — see
  // PlanningMonthlyLevel.tsx's own comment on the same fix. `elapsedDays`
  // is 1-indexed and capped at 7 (today counts as a day in progress even
  // this early in it).
  const elapsedDays = Math.min(7, Math.max(1, Math.floor((Date.now() - new Date(`${monday}T00:00:00`).getTime()) / 86400000) + 1));
  const pace = offset === 0 ? { elapsedPct: Math.round((elapsedDays / 7) * 100), elapsedLabel: L(`${elapsedDays}/7 days`, `৭ দিনের ${elapsedDays} দিন`) } : undefined;
  const dayCounts = new Map<string, number>();
  for (const r of rows) for (const t of r.tasks) if (t.scheduled_date) dayCounts.set(t.scheduled_date, (dayCounts.get(t.scheduled_date) ?? 0) + 1);

  return (
    <div>
      <PlanningPeriodHeader
        label={weekRangeLabel(monday)}
        summary={loaded && totalWins > 0 ? L(`${achievedWins} of ${totalWins} wins achieved`, `${totalWins}টির ${achievedWins}টি জয় অর্জিত`) : null}
        isCurrent={offset === 0}
        resetLabel={L('This week', 'এই সপ্তাহ')}
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
          <WeekStrip monday={monday} accent={accent} counts={dayCounts} onSelectDate={onSelectDate} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              {L('No Win set for this week yet — add one from the Goals panel.', 'এই সপ্তাহের কোনো জয় (Win) নেই — Goals প্যানেল থেকে যোগ করুন।')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.win.id}
                  label={`${L('WEEK WIN', 'সাপ্তাহিক জয়')} · ${row.owner.label}`}
                  accent={accent}
                  ownerColor={row.owner.color}
                  defaultOpen
                  title={row.win.title}
                  criteria={row.win.criteria}
                  progress={row.win.progress}
                  fixed={row.win.fixed}
                  pace={pace}
                  detailsSummary={L(
                    `${row.tasks.filter((t) => t.status === 'done').length} / ${row.tasks.length} supporting actions`,
                    `${row.tasks.length}টির ${row.tasks.filter((t) => t.status === 'done').length}টি সহায়ক কাজ শেষ`,
                  )}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.tasks.map((t) => (
                      <li key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
                          <input type="checkbox" className="checkbox-custom" checked={t.status === 'done'} onChange={() => toggleTask(row, t)} />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              textDecoration: t.status === 'done' ? 'line-through' : 'none',
                              color: t.status === 'done' ? 'var(--text-faint)' : 'var(--text)',
                            }}
                          >
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
                            className="hover-accent"
                            style={{
                              fontSize: TYPE_SIZE.xs,
                              // `undefined`, never `'transparent'`/`var(--border)`,
                              // when unscheduled — an inline value here
                              // (background OR the border shorthand) shadows
                              // .hover-accent's rest/:hover rules in index.css.
                              background: t.scheduled_date ? 'var(--accent-light)' : undefined,
                              color: t.scheduled_date ? 'var(--accent)' : 'var(--text-faint)',
                              borderWidth: 1,
                              borderStyle: 'solid',
                              borderColor: t.scheduled_date ? 'var(--accent)' : undefined,
                              borderRadius: RADIUS.pill,
                              padding: `${SPACE.hair}px ${SPACE.sm}px`,
                              flex: 'none',
                            }}
                          >
                            {t.scheduled_date
                              ? new Date(`${t.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
                              : L('+ day', '+ দিন')}
                          </button>
                          {t.status !== 'done' && (
                            <button
                              onClick={() => setCarryOpenFor((cur) => (cur === t.id ? null : t.id))}
                              style={{ fontSize: TYPE_SIZE.xs, borderRadius: RADIUS.pill, padding: `${SPACE.hair}px ${SPACE.sm}px` }}
                            >
                              {L('Carry forward', 'পরে সরাও')}
                            </button>
                          )}
                        </label>
                        {dayPickerFor === t.id && (
                          <div style={{ display: 'flex', gap: SPACE.xs, paddingLeft: SPACE.xl, flexWrap: 'wrap' }}>
                            {weekDays.map((wd) => (
                              <button
                                key={wd.iso}
                                onClick={() => scheduleTaskDay(row, t, wd.iso)}
                                className="hover-accent"
                                style={{
                                  fontSize: TYPE_SIZE.sm,
                                  padding: `${SPACE.hair}px ${SPACE.xs}px`,
                                  borderWidth: 1,
                                  borderStyle: 'solid',
                                  borderColor: wd.iso === t.scheduled_date ? 'var(--accent)' : undefined,
                                  color: wd.iso === t.scheduled_date ? 'var(--accent)' : 'var(--text-muted)',
                                  borderRadius: RADIUS.control,
                                }}
                              >
                                {wd.label}
                              </button>
                            ))}
                            <button
                              onClick={() => openAnyDatePicker(t)}
                              className="hover-accent"
                              style={{
                                fontSize: TYPE_SIZE.sm,
                                padding: `${SPACE.hair}px ${SPACE.xs}px`,
                                borderWidth: 1,
                                borderStyle: 'dashed',
                                borderRadius: RADIUS.control,
                              }}
                            >
                              {L('Any date…', 'যেকোনো তারিখ…')}
                            </button>
                            {t.scheduled_date && (
                              <button onClick={() => scheduleTaskDay(row, t, null)} style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>
                                {L('Clear', 'মুছুন')}
                              </button>
                            )}
                          </div>
                        )}
                        {anyDateFor === t.id && (
                          <div style={{ paddingLeft: SPACE.xl }}>
                            <MiniCalendarPicker
                              year={calendarMonth.year}
                              month={calendarMonth.month}
                              selected={t.scheduled_date}
                              accent={accent}
                              onNavMonth={(dir) =>
                                setCalendarMonth((cur) => {
                                  const d = new Date(cur.year, cur.month - 1 + dir, 1);
                                  return { year: d.getFullYear(), month: d.getMonth() + 1 };
                                })
                              }
                              onSelectDate={(iso) => {
                                scheduleTaskDay(row, t, iso);
                                setAnyDateFor(null);
                              }}
                            />
                          </div>
                        )}
                        {carryOpenFor === t.id && (
                          <div style={{ display: 'flex', gap: SPACE.xs, paddingLeft: SPACE.xl, flexWrap: 'wrap' }}>
                            <button onClick={() => carryForward(row, t, 'nextweek')} style={{ fontSize: TYPE_SIZE.xs }}>{L('Next week', 'পরের সপ্তাহ')}</button>
                            <button onClick={() => { setCarryOpenFor(null); openAnyDatePicker(t); }} style={{ fontSize: TYPE_SIZE.xs }}>{L('Pick a date', 'তারিখ বাছুন')}</button>
                            <button onClick={() => carryForward(row, t, 'backlog')} style={{ fontSize: TYPE_SIZE.xs }}>{L('Backlog', 'ব্যাকলগ')}</button>
                            <button onClick={() => carryForward(row, t, 'drop')} style={{ fontSize: TYPE_SIZE.xs }}>{L('Drop', 'বাদ দিন')}</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  {addingFor === row.win.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, marginTop: SPACE.xs }}>
                      <div style={{ display: 'flex', gap: SPACE.hair, flexWrap: 'wrap' }}>
                        {NEW_NODE_TYPES.map((t) => {
                          const disabled = t.key === 'milestone' && row.outcomeId == null;
                          const on = addingType === t.key;
                          return (
                            <button
                              key={t.key}
                              onClick={() => setAddingType(t.key)}
                              disabled={disabled}
                              title={disabled ? "This Win's Milestone has no Outcome to attach a new Milestone to" : `Add a ${t.label.toLowerCase()}`}
                              style={{
                                fontSize: TYPE_SIZE.sm,
                                padding: `${SPACE.hair}px ${SPACE.sm}px`,
                                borderRadius: RADIUS.pill,
                                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                background: on ? 'var(--accent-light)' : 'transparent',
                                color: disabled ? 'var(--text-faint)' : on ? 'var(--accent)' : 'var(--text-muted)',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: SPACE.xs }}>
                        <input
                          ref={newTaskRef}
                          aria-label={`New ${addingType}`}
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNode(row);
                            if (e.key === 'Escape') { setAddingFor(null); setNewTaskText(''); setAddingType('task'); }
                          }}
                          placeholder={
                            addingType === 'task' ? 'Add task…' : addingType === 'win' ? 'New Win title…' : addingType === 'milestone' ? 'New Milestone title…' : 'New Outcome title…'
                          }
                          style={{ flex: 1, fontSize: TYPE_SIZE.xs, padding: SPACE.xs }}
                        />
                        <button onClick={() => addNode(row)} title="Add" aria-label="Submit">+</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingFor(row.win.id); setNewTaskText(''); setAddingType('task'); }}
                      title="Add a task, or reach up to add a Win/Milestone/Outcome"
                      aria-label="Add to this Win or a level above it"
                      className="hover-accent"
                      style={{
                        fontSize: TYPE_SIZE.sm,
                        background: 'transparent',
                        // Dashed, matching the mockup's own
                        // .add-goal-trigger — a distinct visual language
                        // for "start something new" vs. an ordinary
                        // action button.
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
