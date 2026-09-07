import { useEffect, useRef, useState } from 'react';
import { DayView, ListKey, STRIKE_MAX, Task, nowApi, tasksApi } from '../services/api';
import { useUndo } from '../undo';
import NowCard from './NowCard';
import StrikeCard from './StrikeCard';

function formatSecs(secs: number): string {
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Session.start/end are unix seconds (python's time.time()), not ms.
function formatClock(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatSessionSpan(start: number, end: number | null): string {
  if (end === null) return `${formatClock(start)} – running`;
  return `${formatClock(start)} – ${formatClock(end)} (${formatSecs(end - start)})`;
}

// Matches legacy exactly (task_tracker_v3_THEMES.py lines 9614-9620):
// high=RED, med=YELLOW, low=CARD_BORDER.
const URGENCY_COLOR: Record<Task['urgency'], string> = {
  low: 'var(--border)',
  med: 'var(--warning)',
  high: 'var(--danger)',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TaskList({
  listKey,
  focusVersion = 0,
  onFocusChanged = () => {},
}: {
  listKey: ListKey;
  // Bumped by the OTHER panel when it writes to this list; see App.tsx.
  focusVersion?: number;
  // Called when THIS panel writes, so the other one re-fetches.
  onFocusChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [dayView, setDayViewState] = useState<DayView>('today');
  const [nowBump, setNowBump] = useState(0);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [title, setTitleState] = useState('');
  const [mitPromptTasks, setMitPromptTasks] = useState<Task[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { push: pushUndo } = useUndo();

  // Every write in this component funnels through refresh(), so telling
  // the other panel here covers all of them at once. Safe from looping
  // because this panel listens to a DIFFERENT counter than the one it
  // bumps — it never re-fetches in response to its own write.
  const refresh = () =>
    tasksApi.list(listKey).then((next) => {
      setTasks(next);
      onFocusChanged();
    });

  // The project cards struck or completed something; our copy is stale.
  useEffect(() => {
    if (focusVersion === 0) return;
    tasksApi.list(listKey).then(setTasks);
    setNowBump((b) => b + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVersion]);
  // NOW's derived pointer depends on strike/done state, which lives
  // server-side — bump this after any action that could change it, so
  // NowCard (a sibling, not a child) knows to refetch.
  const bumpNow = () => setNowBump((b) => b + 1);

  // NOW's id, so the STRIKE card can tint the selected row. NowCard
  // fetches this too, but it is a sibling, not a parent — sharing the
  // fetch would mean lifting NowCard's whole state up for one number.
  const [nowId, setNowId] = useState<number | null>(null);
  useEffect(() => {
    if (listKey !== 'focus') return;
    nowApi.get().then((t) => setNowId(t?.id ?? null));
  }, [listKey, nowBump]);

  const setNow = (id: number) => nowApi.setNow(id).then(() => bumpNow());

  const struck = tasks.filter((t) => t.strike);
  const struckCount = struck.length;

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

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditText(task.text);
  };

  const commitEdit = (task: Task) => {
    const text = editText.trim();
    setEditingId(null);
    if (!text || text === task.text) return;
    const previousText = task.text;
    tasksApi.edit(task.id, text).then(() => {
      pushUndo({
        label: 'edit task',
        undo: () => tasksApi.edit(task.id, previousText).then(refresh),
        redo: () => tasksApi.edit(task.id, text).then(refresh),
      });
      refresh();
    });
  };

  const quickAddChip = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const moveTask = (id: number, direction: -1 | 1) => {
    tasksApi.move(id, direction).then((next) => {
      setTasks(next);
      // A neighbour swap is its own inverse, so undo is the same call
      // with the direction flipped — no snapshot needed. Legacy undoes
      // this by restoring the visible tasks' slots (9059-9064); the
      // outcome is the same for a one-step move, which is all the ▲/▼
      // buttons can produce.
      const back = (direction * -1) as -1 | 1;
      pushUndo({
        label: 'reorder task',
        undo: () => tasksApi.move(id, back).then(setTasks),
        redo: () => tasksApi.move(id, direction).then(setTasks),
      });
    });
  };

  // Legacy singles this action out as worth undoing more than most
  // (9404-9406): it throws away recorded time, and recorded time is the
  // one thing on a task that cannot be retyped from memory. So the
  // snapshot is taken before the reset, not reconstructed after.
  const resetTaskTimer = (task: Task) => {
    const secs = task.secs;
    const sessions = task.sessions;
    tasksApi.resetTimer(task.id).then(() => {
      refresh();
      pushUndo({
        label: 'reset timer',
        undo: () => tasksApi.restoreTimer(task.id, secs, sessions).then(refresh),
        redo: () => tasksApi.resetTimer(task.id).then(refresh),
      });
    });
  };

  const sendToToday = (task: Task) => {
    const previousDay = task.day;
    tasksApi.setDay(task.id, todayIso()).then(() => {
      pushUndo({
        label: 'move to today',
        undo: () => tasksApi.setDay(task.id, previousDay).then(refresh),
        redo: () => tasksApi.setDay(task.id, todayIso()).then(refresh),
      });
      refresh();
    });
  };

  const fetchTitle = () => tasksApi.getTitle(listKey).then(({ title }) => setTitleState(title));

  const saveTitle = () => {
    tasksApi.setTitle(listKey, title.trim()).then(({ title }) => setTitleState(title));
  };

  const switchDayView = (view: DayView) => {
    if (view === dayView) return;
    tasksApi.setDayView(view).then(() => {
      setDayViewState(view);
      refresh();
      fetchTitle();
    });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([tasksApi.list(listKey), tasksApi.getDayView(), tasksApi.getTitle(listKey)])
      .then(([taskList, { view }, { title }]) => {
        setTasks(taskList);
        setDayViewState(view);
        setTitleState(title);
      })
      .finally(() => setLoading(false));
  }, [listKey]);

  // Retired on Focus, same as legacy: its NOW/strike surface already
  // asks "what matters most" permanently, so a popup over it would
  // cover the very screen answering it. Classic has no such surface.
  useEffect(() => {
    if (listKey !== 'classic') return;
    tasksApi.checkMitPrompt().then(({ show, tasks }) => {
      if (show) setMitPromptTasks(tasks);
    });
  }, [listKey]);

  const pickMitPrompt = (task: Task) => {
    setMitPromptTasks(null);
    setMit(task);
  };

  // A struck task belongs to the NOW/STRIKE card above, not the pool
  // below it — showing it in both places would put the same task on
  // screen twice with two checkboxes, which reads as a duplication bug
  // rather than two views of one thing. Matches legacy's own fix for
  // exactly that (_render_tasks: "tasks = [x for x in tasks if not
  // x.get('strike')]"). Tomorrow has no STRIKE card to relate to, so
  // its pool keeps every task regardless of strike.
  const pool = listKey === 'focus' && dayView === 'today' ? tasks.filter((t) => !t.strike) : tasks;
  const sorted = [...pool].sort((a, b) => Number(a.done) - Number(b.done));
  const q = query.trim().toLowerCase();
  const visible = q ? sorted.filter((t) => t.text.toLowerCase().includes(q)) : sorted;
  const doneCount = pool.filter((t) => t.done).length;

  // Matches legacy's _empty_state: an empty list doubles as onboarding
  // via a few one-click task suggestions, rather than just sitting
  // there blank. Four variants by context — search-empty gets no chips
  // since "add this" doesn't make sense while filtering.
  const emptyState = q
    ? { icon: '⌕', title: 'No matching tasks', subtitle: 'Clear the search box to see them', chips: [] as string[] }
    : listKey === 'classic' && dayView === 'tomorrow'
      ? {
          icon: '☾',
          title: 'Plan tomorrow, sleep better tonight',
          subtitle: "Deciding now means no deciding in the morning — pick 3 things you'll actually do",
          chips: ['deep work ~90', 'email + admin ~30', 'review the day ~10'],
        }
      : listKey === 'focus' && struckCount > 0
        ? {
            icon: '✓',
            title: "Nothing queued behind today's list",
            subtitle: "Everything you've taken on is committed above — add here only what comes after it",
            chips: ['deep work ~45', 'review inbox ~15', 'quick call ~10'],
          }
        : listKey === 'focus'
          ? {
              icon: '◇',
              title: 'Nothing to work from yet',
              subtitle: 'Add what today could contain, then + STRIKE up to 3 of them',
              chips: ['deep work ~45', 'review inbox ~15', 'quick call ~10'],
            }
          : {
              icon: '✦',
              title: 'A clear list is a clear mind',
              subtitle: '0 active tasks · add one — try "deep work ~45" to set a 45-min time-box',
              chips: ['deep work ~45', 'review inbox ~15', 'quick call ~10'],
            };

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

      {/* Above the pool, as in legacy: "the three you committed to and
          the pool you promote them FROM are one decision; splitting them
          across two tabs meant picking today's work needed a tab switch
          each time." The flash message (the 3/3-full warning) shows in
          place of the count, which is where the eye already is. */}
      {listKey === 'focus' && dayView === 'today' && (
        <StrikeCard
          struck={struck}
          nowId={nowId}
          flash={flash}
          onToggleDone={toggleDone}
          onUnstrike={toggleStrike}
          onSetNow={setNow}
        />
      )}

      <input
        value={title}
        onChange={(e) => setTitleState(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        style={{
          display: 'block',
          fontWeight: 'bold',
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          padding: 0,
          marginBottom: 8,
          width: '100%',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕ Search tasks…"
          style={{ fontSize: 12, padding: 5, flex: 1, marginRight: 8 }}
        />
        {pool.length > 0 && (
          <span style={{ fontSize: 12, opacity: 0.6, whiteSpace: 'nowrap' }}>
            {doneCount}/{pool.length} done
          </span>
        )}
      </div>

      <form onSubmit={addTask} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Add a task… ("~30" = 30-min time-box)'
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Add</button>
      </form>


      {loading ? (
        <p>Loading…</p>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', opacity: 0.7 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{emptyState.icon}</div>
          <div style={{ fontSize: 14 }}>{emptyState.title}</div>
          {emptyState.subtitle && (
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>{emptyState.subtitle}</div>
          )}
          {emptyState.chips.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
              {emptyState.chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => quickAddChip(chip)}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12 }}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {visible.map((t) => {
            const group = sorted.filter((x) => x.done === t.done);
            const isFirst = group[0]?.id === t.id;
            const isLast = group[group.length - 1]?.id === t.id;
            return (
            <li
              key={t.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                opacity: t.done ? 0.5 : 1,
              }}
            >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!q && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={() => moveTask(t.id, -1)} disabled={isFirst} title="Move up" style={{ width: 18, fontSize: 9, lineHeight: 1 }}>
                    ▲
                  </button>
                  <button onClick={() => moveTask(t.id, 1)} disabled={isLast} title="Move down" style={{ width: 18, fontSize: 9, lineHeight: 1 }}>
                    ▼
                  </button>
                </div>
              )}

              <button onClick={() => toggleDone(t.id)} title="Toggle done" style={{ width: 24 }}>
                {t.done ? '✓' : '○'}
              </button>

              <button onClick={() => setMit(t)} title="Most Important Task" style={{ color: t.mit ? 'var(--warning)' : undefined }}>
                {t.mit ? '★' : '☆'}
              </button>

              {listKey === 'focus' && (
                <button
                  onClick={() => toggleStrike(t.id)}
                  title="Commit to today's 3"
                  style={{ color: t.strike ? 'var(--danger)' : undefined }}
                >
                  {t.strike ? '◆' : '◇'}
                </button>
              )}

              {listKey === 'focus' && t.strike && !t.done && (
                <button onClick={() => pointNow(t.id)} title="Point NOW at this task" style={{ fontSize: 11 }}>
                  → NOW
                </button>
              )}

              {editingId === t.id ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => commitEdit(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(t);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{ flex: 1, fontSize: 14, padding: 2 }}
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(t)}
                  title="Double-click to edit"
                  style={{
                    flex: 1,
                    textDecoration: t.done ? 'line-through' : 'none',
                    cursor: 'text',
                  }}
                >
                  {t.text}
                </span>
              )}

              {listKey === 'classic' && dayView === 'tomorrow' && (
                <button onClick={() => sendToToday(t)} title="Move to today" style={{ fontSize: 11 }}>
                  → Today
                </button>
              )}

              {t.est > 0 && !t.done && (
                t.secs > t.est * 60 ? (
                  <span style={{ fontSize: 11, color: 'var(--danger)' }} title="Over the time-box">
                    ! {Math.floor(t.secs / 60)}m / ~{t.est}m
                  </span>
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.7 }}>~{t.est}m</span>
                )
              )}

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
              {/* Legacy's ▶/↺/✕ button row (9947-9948). The reset only
                  appears once there is time to throw away — an always-on
                  destructive control beside ▶ is easy to hit by accident
                  and does nothing useful on a fresh task. */}
              {t.secs > 0 && (
                <button onClick={() => resetTaskTimer(t)} title="Reset this task's timer">
                  ↺
                </button>
              )}
              <span style={{ fontSize: 12, opacity: 0.7, width: 44 }}>{formatSecs(t.secs)}</span>

              {t.sessions.length > 0 && (
                <button
                  onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  title="View session history"
                  style={{ fontSize: 10, opacity: 0.7 }}
                >
                  {expandedId === t.id ? '▾' : '▸'} {t.sessions.length}
                </button>
              )}

              <button onClick={() => deleteTask(t)} title="Delete">
                ✕
              </button>
            </div>

            {expandedId === t.id && t.sessions.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '4px 0 0 32px', padding: 0, fontSize: 11, opacity: 0.75 }}>
                {[...t.sessions].reverse().map((s, i) => (
                  <li key={i}>{formatSessionSpan(s.start, s.end)}</li>
                ))}
              </ul>
            )}
            </li>
            );
          })}
        </ul>
      )}

      {mitPromptTasks && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 20, width: 320 }}>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--warning)', marginBottom: 4 }}>
              ★ WHAT'S TODAY'S MIT?
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 12 }}>One Most Important Task. Do it first.</div>
            {mitPromptTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => pickMitPrompt(t)}
                style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, padding: '6px 8px', marginBottom: 2 }}
              >
                ☆ {t.text.slice(0, 44)}
              </button>
            ))}
            <button
              onClick={() => setMitPromptTasks(null)}
              style={{ display: 'block', margin: '10px auto 0', fontSize: 11, opacity: 0.6, border: 'none', background: 'none' }}
            >
              Skip today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
