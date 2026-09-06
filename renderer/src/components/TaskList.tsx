import { useEffect, useState } from 'react';
import { DayView, ListKey, STRIKE_MAX, Task, nowApi, tasksApi } from '../services/api';
import { useUndo } from '../undo';
import NowCard from './NowCard';

function formatSecs(secs: number): string {
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const URGENCY_COLOR: Record<Task['urgency'], string> = {
  low: '#8a8a8a',
  med: '#c8a24a',
  high: '#c0392b',
};

export default function TaskList({ listKey }: { listKey: ListKey }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [dayView, setDayViewState] = useState<DayView>('today');
  const [nowBump, setNowBump] = useState(0);
  const { push: pushUndo } = useUndo();

  const refresh = () => tasksApi.list(listKey).then(setTasks);
  // NOW's derived pointer depends on strike/done state, which lives
  // server-side — bump this after any action that could change it, so
  // NowCard (a sibling, not a child) knows to refetch.
  const bumpNow = () => setNowBump((b) => b + 1);

  const struckCount = tasks.filter((t) => t.strike).length;

  const toggleStrike = (id: number) => {
    tasksApi
      .toggleStrike(id)
      .then(() => {
        // A pure toggle: undo and redo are the same call.
        const flip = () => tasksApi.toggleStrike(id).then(() => { refresh(); bumpNow(); });
        pushUndo({ label: 'star task', undo: flip, redo: flip });
        refresh();
        bumpNow();
      })
      .catch(() => {
        setFlash(`${STRIKE_MAX}/${STRIKE_MAX} — full`);
        setTimeout(() => setFlash(null), 1500);
      });
  };

  const toggleDone = (id: number) => {
    tasksApi.toggleDone(id).then(() => {
      const flip = () => tasksApi.toggleDone(id).then(() => { refresh(); bumpNow(); });
      pushUndo({ label: 'toggle done', undo: flip, redo: flip });
      refresh();
      bumpNow();
    });
  };

  const pointNow = (id: number) => nowApi.setNow(id).then(bumpNow);

  const setMit = (task: Task) => {
    const previousMit = tasks.find((t) => t.mit && t.id !== task.id);
    tasksApi.setMit(task.id).then(() => {
      pushUndo({
        label: 'change MIT',
        // Setting MIT clears every sibling first, so restoring the
        // previous holder (or re-toggling this one off if there wasn't
        // one) exactly reverses it — matches the legacy undo semantics.
        undo: () => tasksApi.setMit(previousMit ? previousMit.id : task.id).then(refresh),
        // Redo just re-applies the original action on the original task.
        redo: () => tasksApi.setMit(task.id).then(refresh),
      });
      refresh();
    });
  };

  const cycleUrgency = (id: number) => {
    tasksApi.cycleUrgency(id).then(() => {
      pushUndo({
        label: 'cycle urgency',
        // The cycle only moves forward (low→med→high→low); undoing one
        // step forward means stepping forward twice more, redoing it
        // back means one more step forward again.
        undo: async () => {
          await tasksApi.cycleUrgency(id);
          await tasksApi.cycleUrgency(id);
          refresh();
        },
        redo: () => tasksApi.cycleUrgency(id).then(refresh),
      });
      refresh();
    });
  };

  const deleteTask = (task: Task) => {
    tasksApi.remove(task.id).then(() => {
      pushUndo({
        label: `delete "${task.text.slice(0, 30)}"`,
        undo: () => tasksApi.restore(task).then(() => { refresh(); bumpNow(); }),
        redo: () => tasksApi.remove(task.id).then(() => { refresh(); bumpNow(); }),
      });
      refresh();
      bumpNow();
    });
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const created = await tasksApi.create(text, listKey);
    pushUndo({
      label: `add "${text.slice(0, 30)}"`,
      undo: () => tasksApi.remove(created.id).then(refresh),
      // Restoring the exact snapshot (not creating a new one) keeps the
      // id stable across repeated undo/redo cycles.
      redo: () => tasksApi.restore(created).then(refresh),
    });
    setInput('');
    refresh();
  };

  const switchDayView = (view: DayView) => {
    if (view === dayView) return;
    tasksApi.setDayView(view).then(() => {
      setDayViewState(view);
      refresh();
    });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([tasksApi.list(listKey), tasksApi.getDayView()])
      .then(([taskList, { view }]) => {
        setTasks(taskList);
        setDayViewState(view);
      })
      .finally(() => setLoading(false));
  }, [listKey]);

  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <div style={{ maxWidth: 560 }}>
      {listKey === 'classic' && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['today', 'tomorrow'] as const).map((view) => (
            <button
              key={view}
              onClick={() => switchDayView(view)}
              disabled={dayView === view}
              style={{ fontSize: 12, textTransform: 'capitalize' }}
            >
              {view}
            </button>
          ))}
        </div>
      )}

      {listKey === 'focus' && <NowCard refreshSignal={nowBump} onChanged={refresh} />}

      <form onSubmit={addTask} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Add a task… ("~30" = 30-min time-box)'
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Add</button>
      </form>

      {listKey === 'focus' && (
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          {flash ?? `Today's commitments: ${struckCount}/${STRIKE_MAX}`}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : sorted.length === 0 ? (
        <p style={{ opacity: 0.6 }}>
          {listKey === 'classic' && dayView === 'tomorrow' ? 'No tasks for tomorrow yet.' : 'No tasks yet.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sorted.map((t) => (
            <li
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid rgba(128,128,128,0.2)',
                opacity: t.done ? 0.5 : 1,
              }}
            >
              <button onClick={() => toggleDone(t.id)} title="Toggle done" style={{ width: 24 }}>
                {t.done ? '✓' : '○'}
              </button>

              <button onClick={() => setMit(t)} title="Most Important Task" style={{ color: t.mit ? '#c8a24a' : undefined }}>
                {t.mit ? '★' : '☆'}
              </button>

              {listKey === 'focus' && (
                <button
                  onClick={() => toggleStrike(t.id)}
                  title="Commit to today's 3"
                  style={{ color: t.strike ? '#c0392b' : undefined }}
                >
                  {t.strike ? '◆' : '◇'}
                </button>
              )}

              {listKey === 'focus' && t.strike && !t.done && (
                <button onClick={() => pointNow(t.id)} title="Point NOW at this task" style={{ fontSize: 11 }}>
                  → NOW
                </button>
              )}

              <span
                style={{
                  flex: 1,
                  textDecoration: t.done ? 'line-through' : 'none',
                }}
              >
                {t.text}
              </span>

              {t.est > 0 && <span style={{ fontSize: 12, opacity: 0.7 }}>~{t.est}m</span>}

              <button
                onClick={() => cycleUrgency(t.id)}
                title="Cycle priority"
                style={{ color: URGENCY_COLOR[t.urgency], fontSize: 12 }}
              >
                {t.urgency.toUpperCase()}
              </button>

              <button onClick={() => tasksApi.toggleTimer(t.id).then(refresh)} title="Start/stop timer">
                {t.sessions.length > 0 && t.sessions[t.sessions.length - 1].end === null ? '⏸' : '▶'}
              </button>
              <span style={{ fontSize: 12, opacity: 0.7, width: 44 }}>{formatSecs(t.secs)}</span>

              <button onClick={() => deleteTask(t)} title="Delete">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
