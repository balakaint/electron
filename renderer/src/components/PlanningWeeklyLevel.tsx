import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { GoalOwnerMeta, PlanTask, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';

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

  const toggleTask = (row: OwnedWin, task: PlanTask) =>
    planningApi
      .editTask(task.id, { status: task.status === 'done' ? 'open' : 'done' })
      .then(() => planningApi.listTasksForWin(row.win.id))
      .then((tasks) => setRows((rs) => rs.map((r) => (r.win.id === row.win.id ? { ...r, tasks } : r))));

  const carryForward = (row: OwnedWin, task: PlanTask, action: 'nextweek' | 'backlog' | 'drop') =>
    planningApi
      .carryForwardTask(task.id, action)
      .then(() => planningApi.listTasksForWin(row.win.id))
      .then((tasks) => setRows((rs) => rs.map((r) => (r.win.id === row.win.id ? { ...r, tasks } : r))))
      .then(() => setCarryOpenFor(null));

  const totalWins = rows.length;
  const achievedWins = rows.filter((r) => r.win.progress === 100).length;

  return (
    <AccordionSection
      glyph={<CalendarDays size={16} />}
      label="WEEKLY"
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
