import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { GoalOwnerMeta, PlanTask, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
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

interface OwnedWin {
  win: Win;
  owner: GoalOwnerMeta;
  tasks: PlanTask[];
}

async function findCurrentWin(owner: GoalOwnerMeta, monday: string): Promise<OwnedWin | null> {
  const today = new Date(`${monday}T00:00:00`);
  const outcomes = await planningApi.listOutcomes(owner.key);
  const outcome = outcomes.find((o) => o.year === today.getFullYear());
  if (!outcome) return null;
  const milestones = await planningApi.listMilestones(outcome.id);
  const milestone = milestones.find((m) => m.month === today.getMonth() + 1 && m.year === today.getFullYear());
  if (!milestone) return null;
  const wins = await planningApi.listWins(milestone.id);
  const win = wins.find((w) => w.week_start_date === monday);
  if (!win) return null;
  const tasks = await planningApi.listTasksForWin(win.id);
  return { win, owner, tasks };
}

export default function PlanningWeeklyLevel({
  owners,
  accent,
  expanded,
  onToggle,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
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
      ? () => Promise.all(owners.map((o) => findCurrentWin(o, monday))).then((rs) => rs.filter((r): r is OwnedWin => r !== null))
      : null,
    [owners, monday],
    [],
  );

  const [carryOpenFor, setCarryOpenFor] = useState<number | null>(null);

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
      ) : rows.length === 0 ? (
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
                      {t.status !== 'done' && (
                        <button
                          onClick={() => setCarryOpenFor((cur) => (cur === t.id ? null : t.id))}
                          style={{ fontSize: TYPE_SIZE.xs, background: 'transparent', border: '1px solid var(--border)', borderRadius: RADIUS.pill, padding: `${SPACE.hair}px ${SPACE.sm}px` }}
                        >
                          Carry forward
                        </button>
                      )}
                    </label>
                    {carryOpenFor === t.id && (
                      <div style={{ display: 'flex', gap: SPACE.xs, paddingLeft: SPACE.xl }}>
                        <button onClick={() => carryForward(row, t, 'nextweek')} style={{ fontSize: TYPE_SIZE.xs }}>Next week</button>
                        <button onClick={() => carryForward(row, t, 'backlog')} style={{ fontSize: TYPE_SIZE.xs }}>Backlog</button>
                        <button onClick={() => carryForward(row, t, 'drop')} style={{ fontSize: TYPE_SIZE.xs }}>Drop</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </PlanningProgressCard>
          ))}
        </div>
      )}
    </AccordionSection>
  );
}
