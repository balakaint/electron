import { useEffect, useRef, useState } from 'react';
import { DayView, ListKey, Project, ProjectKey, STRIKE_MAX, Task, hoursApi, nowApi, projectsApi, tasksApi } from '../services/api';
import { useUndo } from '../undo';
import { accentText } from '../themes';
import NowCard from './NowCard';
import DeepWorkCard from './DeepWorkCard';
import ProjectTaskList from './ProjectTaskList';
import { formatSecs } from '../format';
import { RADIUS } from '../spacing';

// Session.start/end are unix seconds (python's time.time()), not ms.
function formatClock(unixSecs: number): string {
  return new Date(unixSecs * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatSessionSpan(start: number, end: number | null): string {
  if (end === null) return `${formatClock(start)} – running`;
  return `${formatClock(start)} – ${formatClock(end)} (${formatSecs(end - start)})`;
}

// Legacy (task_tracker_v3_THEMES.py 9614-9620) paints high=RED,
// med=YELLOW, low=CARD_BORDER, and prints the level as a word on every
// row. Both halves of that are kept where they belong and dropped where
// they are not: the word survives inside the row's ⋯ panel, where you
// go to CHANGE the level, and the colour survives as the row's left
// edge — but only for high.
//
// The reason is that `med` is the DEFAULT. Every task starts there, so
// an amber badge and an amber rail appeared on every row of the list,
// and four identical warnings are not a warning. A default has to be
// silent for the exception to be audible.
const URGENCY_COLOR: Record<Task['urgency'], string> = {
  low: 'var(--border)',
  med: 'var(--warning)',
  high: 'var(--danger)',
};

// What the row's 3px edge shows. Committed first — that is the one
// decision this screen exists to record, and with the STRIKE card gone
// the rail is what tells a committed row from the rest. Then priority,
// but only when you deliberately raised it above the default. Otherwise
// nothing at all: a grey bar drawn down every row is a line the eye has
// to dismiss on every row.
function railColor(t: Task): string {
  if (t.done) return 'transparent';
  if (t.strike) return 'var(--accent)';
  if (t.urgency === 'high') return 'var(--danger)';
  return 'transparent';
}

// Below this many tasks the list is short enough to read, so the
// search box would be chrome for its own sake.
const SEARCH_FROM = 8;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TaskList({
  listKey,
  dayView: dayViewProp,
  focusVersion = 0,
  onFocusChanged = () => {},
  activeProjectKey = undefined,
}: {
  listKey: ListKey;
  // When EXECUTE drives this from its tab strip, the day is the TAB —
  // MIT is today, TASK LIST is tomorrow — so the list must not also
  // carry its own today/tomorrow switch. Two controls for one piece of
  // state is how they drift apart. Left undefined, the list owns the
  // choice as before (PLAN's classic list still does).
  dayView?: DayView;
  // Bumped by the OTHER panel when it writes to this list; see App.tsx.
  focusVersion?: number;
  // Called when THIS panel writes, so the other one re-fetches.
  onFocusChanged?: () => void;
  // Panel 1's open project, one-way — DEEP WORK below starts on it, but
  // a click on a different row here doesn't reach back up to Panel 1/2.
  // undefined (not passed) leaves DEEP WORK's own selection alone, for
  // the TASK LIST tab call site that doesn't render DEEP WORK at all.
  activeProjectKey?: ProjectKey | null;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [ownDayView, setDayViewState] = useState<DayView>('today');
  const dayView = dayViewProp ?? ownDayView;
  const [nowBump, setNowBump] = useState(0);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [title, setTitleState] = useState('');
  const [mitPromptTasks, setMitPromptTasks] = useState<Task[] | null>(null);
  // Which project the list below is showing, if any. Null means today's
  // own list — the default, and what you get back by pressing the
  // project again or the "today's list" link in the heading.
  const [projectKey, setProjectKey] = useState<ProjectKey | null>(null);
  // One-way: Panel 1 opening/closing a project re-points DEEP WORK at
  // it. Not a dependency on projectKey itself — that would fight a
  // click on a different DEEP WORK row the instant it happened, since
  // this effect would see its own prior write and re-run.
  useEffect(() => {
    if (activeProjectKey !== undefined) setProjectKey(activeProjectKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectKey]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const selectedProject = projectKey ? projects[projectKey] ?? null : null;

  useEffect(() => {
    if (listKey !== 'focus' || dayView !== 'today') return;
    projectsApi.order().then((o) => {
      const map: Record<string, Project> = {};
      o.forEach((e) => (map[e.project.key] = e.project));
      setProjects(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, dayView]);
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

  // Play on a Focus row = make this NOW and run it. setNow stops
  // whatever clock was running first (that is its own contract), so this
  // is start, switch and pause in one control: pressing it on the task
  // already running pauses that task rather than restarting it.
  const startHere = (t: Task) => {
    const running = t.sessions.length > 0 && t.sessions[t.sessions.length - 1].end === null;
    const act = running
      ? nowApi.toggleRun()
      : nowApi.setNow(t.id).then(() => nowApi.toggleRun());
    return act.then(() => {
      refresh();
      bumpNow();
    });
  };

  // Which hour each hour-started task came from. One fetch, only on the
  // screen that can show such a task; the pair (hour_slot_id -> hour)
  // does not exist on the task itself because the LINK deliberately
  // keys the row, not the (day, hour) a carried entry would outgrow.
  const [hourOf, setHourOf] = useState<Record<number, number>>({});
  useEffect(() => {
    if (listKey !== 'focus' || dayView !== 'today') return;
    hoursApi.get(todayIso()).then((plan) => {
      const map: Record<number, number> = {};
      plan.blocks.forEach((b) => b.hours.forEach((h) => { if (h.id !== null) map[h.id] = h.hour; }));
      setHourOf(map);
    });
  }, [listKey, dayView, focusVersion, nowBump]);
  const hourLabelFor = (t: Task): string | null => {
    if (t.hour_slot_id === null) return null;
    const h = hourOf[t.hour_slot_id];
    if (h === undefined) return null;
    return `${String(h % 12 || 12).padStart(2, '0')}:00 ${h < 12 ? 'AM' : 'PM'}`;
  };

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
  //
  // NOW's task is excluded for the same reason. Since a task can now
  // reach NOW without being struck (started from an hour), the strike
  // test alone stopped covering it: pressing play on 09:00 put the task
  // in the NOW card AND left it in the pool below, on screen twice with
  // two sets of controls — exactly the duplication the rule above
  // exists to prevent.
  // ONE list. The STRIKE card above this used to hold the committed
  // tasks, and the pool filtered them out so they would not appear
  // twice — two cards, two row designs, two sets of controls for one
  // kind of object, which is what made this screen read as complicated.
  // Zahid's call, and it is the right one: the commitment is a PROPERTY
  // of a task, not a different kind of thing, so it is now a mark on the
  // row (the rail, the star, the pressed STRIKE chip) and committed
  // tasks simply sort to the top.
  //
  // Removing the card also removes the bug that made it necessary: with
  // the card gone AND the filter kept, striking a task would have made
  // it vanish from the screen entirely.
  //
  // The NOW task stays in the list too. It was excluded to avoid saying
  // the same thing twice, but "it disappeared" is a worse confusion than
  // "it is shown above as well" — the card is a control surface with a
  // running clock, the row is an inventory line, and the row says which
  // one it is.
  const pool = tasks;
  const sorted = [...pool].sort(
    (a, b) => Number(a.done) - Number(b.done) || Number(b.strike) - Number(a.strike),
  );
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
      // The "everything you've taken on is committed ABOVE" variant is
      // gone with the card it referred to. It is also unreachable now:
      // committed tasks live in this pool, so a list with something
      // committed is not an empty list.
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
      {listKey === 'classic' && dayViewProp === undefined && (
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

      {/* NOW is rendered by Panel3, above the tab strip — it is the one
          thing you are doing, and it must not depend on which tab is
          open. It used to live here, which put it inside a tab. */}

      {/* The STRIKE card stood here. What it did — showing what you
          took on today — is now split in two: the commitment mark moved
          onto the rows themselves, and the box became DEEP WORK, which
          answers the question this screen is actually opened with. */}
      {listKey === 'focus' && dayView === 'today' && (
        <DeepWorkCard onChanged={onFocusChanged} selectedKey={projectKey} onSelect={setProjectKey} />
      )}

      {/* A project is selected: everything below belongs to it. Used to
          restate the project's name here too — necessary back when
          DEEP WORK still listed every project and this heading was the
          only unambiguous "which one is selected". DEEP WORK now shows
          only the selected project (2026-09-20), so its own row already
          says the name; repeating it right underneath read as the same
          fact printed twice back to back (Zahid's screenshot). Just the
          way back remains. */}
      {selectedProject ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              onClick={() => setProjectKey(null)}
              className="btn-ghost"
              title="Back to today's list"
              style={{ fontSize: 12, height: 24, padding: '0 8px', flex: 'none' }}
            >
              ← today's list
            </button>
          </div>
          <ProjectTaskList
            projectKey={selectedProject.key}
            accent={accentText(selectedProject.accent_color)}
            onPromoted={() => {
              refresh();
              onFocusChanged();
            }}
          />
        </>
      ) : (
      <>
      {/* Heading and count on one row. With the search box gone below
          for short lists, "0/3 done" was left floating on a line of its
          own between the heading and the add box, captioning nothing. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
      <input
        aria-label="Heading for this list"
        value={title}
        onChange={(e) => setTitleState(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        style={{
          display: 'block',
          fontWeight: 700,
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          padding: 0,
          flex: 1,
          minWidth: 0,
          height: 24,
        }}
      />
        {/* The commitment count lived in the STRIKE card's header. It
            says the same thing here, next to the count it belongs
            beside, and only while there is something committed — "0/0"
            is a statement about an empty set. The 3/3-full warning
            flashes in its place, which is where the eye already is. */}
        {listKey === 'focus' && dayView === 'today' && (flash || struckCount > 0) && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
              whiteSpace: 'nowrap',
              flex: 'none',
            }}
          >
            {flash ?? `${struckCount}/${STRIKE_MAX} committed`}
          </span>
        )}
        {pool.length > 0 && (
          <span className="tabular" style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', flex: 'none' }}>
            {doneCount}/{pool.length} done
          </span>
        )}
      </div>

      {/* The search box appears when there is something to search.
          Four tasks do not need a filter, and a permanent 30px input
          above four rows is the same trade the empty note textarea was
          making on the project cards. Once it is on screen it stays,
          even if a filter empties the list — pulling the control out
          from under the query you just typed is worse than the 30px. */}
      {(pool.length >= SEARCH_FROM || q) && (
        <input
          aria-label="Search tasks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="⌕ Search tasks…"
          style={{ fontSize: 12, padding: 4, width: '100%', marginBottom: 8, height: 26 }}
        />
      )}

      <form onSubmit={addTask} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          aria-label="New task"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Add a task… ("~30" = 30-min time-box)'
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit" className="btn-primary" style={{ padding: '0 16px' }}>
          Add
        </button>
      </form>


      {loading ? (
        <p>Loading…</p>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>{emptyState.icon}</div>
          <div style={{ fontSize: 14 }}>{emptyState.title}</div>
          {emptyState.subtitle && (
            <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-muted)' }}>{emptyState.subtitle}</div>
          )}
          {emptyState.chips.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {emptyState.chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => quickAddChip(chip)}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: RADIUS.pill }}
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
              className="task-row"
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 8,
                borderRadius: RADIUS.control,
                // No hairline under every row. A rule per row is how a
                // list looked when lists were tables; separation is the
                // padding, and the hover tint is what groups a row into
                // one object when you are about to click it.
                //
                // Muted by COLOUR, not by opacity. Opacity multiplies
                // every colour in the row — the strike-through text, the
                // time, the controls — and drops all of them below
                // 4.5:1 at once. A done task is still a task you can
                // read.
                background: t.id === nowId ? 'var(--accent-light)' : undefined,
              }}
            >
            {/* ONE ROW, ONE TASK.
                Measured before this change: ▲▼ ○ ☆ ◇ MED ▶ ↺ 24:29 ›1 ✕
                took ~250px of a 545px panel, leaving ~180px for the only
                part you actually read — so "DEEP WORK: pricing model"
                wrapped onto two lines. Every control drew at the same
                weight, so nothing on the row said which of the eight
                mattered.

                This app has already solved this once. Legacy's project
                card (6713-6719): "the buttons used to sit here, and
                sharing the row with a fixed-width cluster clipped longer
                project names... The title owns its row; the buttons
                moved down." Same fix, same reason.

                What stays: done, the name, its time-box, its clock, play
                and + STRIKE — tick it, read it, time it, commit it. What
                moves behind ⋯: reorder, priority, timer reset, session
                history, delete. Not hover — legacy rejected hover-only
                for the hour-clear button, "findable by accident and
                unreachable by keyboard or touch" — a real button that
                opens a real second line. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Priority is a 3px edge, not a chip. `med` is the
                  DEFAULT, so every task was wearing an amber MED badge:
                  four identical warnings on four rows, which is no
                  warning at all. Only high — the one that is a
                  deliberate statement — still says so in words. */}
              <span
                title={`Priority: ${t.urgency}`}
                style={{
                  width: 3,
                  alignSelf: 'stretch',
                  minHeight: 20,
                  flex: 'none',
                  background: railColor(t),
                }}
              />

              {/* Drawn, not typed. "○" and "✓" are text glyphs: their
                  size, weight and vertical centring come from whatever
                  font the OS picked, which is why the tick sat high and
                  the circle looked thin and old. A bordered box the app
                  draws itself is the same control at any font. */}
              <button
                onClick={() => toggleDone(t.id)}
                title="Toggle done"
                aria-pressed={t.done}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  lineHeight: 1,
                  borderRadius: RADIUS.pill,
                  border: `1px solid ${t.done ? 'var(--success)' : 'var(--text-faint)'}`,
                  background: t.done ? 'var(--success)' : 'transparent',
                  color: t.done ? 'var(--on-accent)' : 'transparent',
                }}
              >
                ✓
              </button>

              {editingId === t.id ? (
                <input
                  aria-label="Task text"
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={() => commitEdit(t)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(t);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{ flex: 1, minWidth: 0, fontSize: 14, padding: 4, height: 24 }}
                />
              ) : (
                <span
                  onDoubleClick={() => startEdit(t)}
                  title="Double-click to edit"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    // The name is the only thing on this row you read
                    // rather than operate, so it is the only thing above
                    // 13px. A committed task steps up again: the weight
                    // is the hierarchy the STRIKE card used to provide
                    // by being a separate box.
                    fontSize: 14,
                    fontWeight: t.strike && !t.done ? 600 : 400,
                    lineHeight: 1.35,
                    color: t.done ? 'var(--text-muted)' : 'var(--text)',
                    textDecoration: t.done ? 'line-through' : 'none',
                    cursor: 'text',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.text}
                </span>
              )}

              {/* Where this came from, when it came from an hour. One
                  fact, no new control: a task that appeared here because
                  you pressed play on 09:00 should say so, or the list
                  looks like it grew a row by itself. */}
              {t.hour_slot_id !== null && hourLabelFor(t) && (
                <span
                  title="Started from your hour plan"
                  style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-faint)', flex: 'none' }}
                >
                  {hourLabelFor(t)}
                </span>
              )}

              {t.urgency === 'high' && !t.done && (
                <button
                  onClick={() => cycleUrgency(t.id)}
                  title="Cycle priority"
                  className="btn-ghost"
                  style={{ color: URGENCY_COLOR.high, fontSize: 12, height: 24, padding: '0 8px', flex: 'none' }}
                >
                  HIGH
                </button>
              )}

              {t.est > 0 && !t.done && (
                t.secs > t.est * 60 ? (
                  <span style={{ fontSize: 12, color: 'var(--danger)', flex: 'none' }} title="Over the time-box">
                    ! {Math.floor(t.secs / 60)}m / ~{t.est}m
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 'none' }}>~{t.est}m</span>
                )
              )}

              {listKey === 'classic' && dayView === 'tomorrow' && (
                <button onClick={() => sendToToday(t)} title="Move to today" style={{ fontSize: 12, height: 24, flex: 'none' }}>
                  → Today
                </button>
              )}

              {/* Tabular figures, not a monospace FACE. The digits still
                  line up column to column, but they stay in the app's own
                  typeface instead of dropping into Courier — a second
                  font on a row is most of what "dated" looks like. */}
              <span
                className="tabular"
                style={{ fontSize: 12, color: 'var(--text-muted)', width: 44, textAlign: 'right', flex: 'none' }}
              >
                {formatSecs(t.secs)}
              </span>

              {/* On the EXECUTE list, play means "I am working on this
                  NOW" — it points the card at the top of the panel at
                  this task and starts its clock there. It used to start
                  a private per-row timer instead, so a task could be
                  running for twenty minutes while NOW, three inches
                  above it, still said "Choose today's 3". One screen
                  cannot hold a running clock and no answer to what am I
                  doing.
                  PLAN's classic list keeps the independent timer that
                  legacy gives it — "one clock at a time" is NOW's rule
                  and NOW is not on that screen. */}
              <button
                onClick={() =>
                  listKey === 'focus'
                    ? startHere(t)
                    : tasksApi.toggleTimer(t.id).then(refresh)
                }
                title={listKey === 'focus' ? 'Work on this now' : 'Start/stop timer'}
                className="btn-ghost"
                style={{ width: 28, height: 28, padding: 0, flex: 'none', color: 'var(--accent)' }}
              >
                {t.sessions.length > 0 && t.sessions[t.sessions.length - 1].end === null ? '⏸' : '▶'}
              </button>

              {/* The star only means something on a committed task —
                  FIRST OF THE THREE, the one NOW opens on. It lived in
                  the STRIKE card because that was the only place
                  committed tasks appeared; it follows them here. */}
              {listKey === 'focus' && t.strike && !t.done && (
                <button
                  onClick={() => setMit(t)}
                  aria-pressed={t.mit}
                  title={t.mit ? 'First of the three — NOW opens here' : 'Make this the first of the three'}
                  className="btn-ghost"
                  style={{
                    width: 24,
                    height: 24,
                    padding: 0,
                    flex: 'none',
                    fontSize: 14,
                    color: t.mit ? 'var(--warning)' : 'var(--text-faint)',
                  }}
                >
                  {t.mit ? '★' : '☆'}
                </button>
              )}

              {/* ONE control, two states. Committing and un-committing
                  were a "+ STRIKE" button down here and a "−" button up
                  in the STRIKE card — the same decision wearing two
                  different marks in two different places. Pressed is the
                  state, aria-pressed says so, and the row's rail says it
                  again at a glance. */}
              {listKey === 'focus' && !t.done && (
                <button
                  onClick={() => toggleStrike(t.id)}
                  aria-pressed={t.strike}
                  disabled={!t.strike && struckCount >= STRIKE_MAX}
                  title={
                    t.strike
                      ? "Committed to today — click to take it back"
                      : struckCount >= STRIKE_MAX
                        ? `Already ${STRIKE_MAX}/${STRIKE_MAX} — today is full`
                        : "Commit this to today's 3"
                  }
                  className={t.strike ? undefined : 'btn-ghost'}
                  style={{
                    fontSize: 12,
                    fontWeight: t.strike ? 600 : 400,
                    height: 24,
                    padding: '0 8px',
                    flex: 'none',
                    background: t.strike ? 'var(--accent-light)' : undefined,
                    borderColor: t.strike ? 'var(--accent)' : undefined,
                    color: t.strike ? 'var(--accent)' : undefined,
                  }}
                >
                  {t.strike ? 'STRIKE' : '+ STRIKE'}
                </button>
              )}

              <button
                onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                aria-expanded={expandedId === t.id}
                title="More — reorder, priority, sessions, delete"
                // Explicitly transparent. A button with no background of
                // its own keeps Chromium's default face, which under
                // color-scheme:dark is #6B6B6B — and --text-muted on
                // that measured 2.08:1. Every icon button in this app
                // paints its own background for exactly this reason.
                className="btn-ghost"
                style={{ width: 24, height: 24, padding: 0, flex: 'none' }}
              >
                ⋯
              </button>
            </div>

            {expandedId === t.id && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 4px 16px', flexWrap: 'wrap' }}>
                {!q && (
                  <>
                    <button onClick={() => moveTask(t.id, -1)} disabled={isFirst} title="Move up" style={{ width: 24, height: 24, padding: 0 }}>
                      ▲
                    </button>
                    <button onClick={() => moveTask(t.id, 1)} disabled={isLast} title="Move down" style={{ width: 24, height: 24, padding: 0 }}>
                      ▼
                    </button>
                  </>
                )}
                <button
                  onClick={() => cycleUrgency(t.id)}
                  title="Cycle priority"
                  style={{ color: URGENCY_COLOR[t.urgency], fontSize: 12, height: 24, padding: '0 8px' }}
                >
                  {t.urgency.toUpperCase()}
                </button>
                {/* Legacy's ↺ (9947-9948) appears only once there is time
                    to throw away — an always-on destructive control does
                    nothing useful on a fresh task. */}
                {t.secs > 0 && (
                  <button onClick={() => resetTaskTimer(t)} title="Reset this task's timer" style={{ height: 24, padding: '0 8px', fontSize: 12 }}>
                    ↺ reset
                  </button>
                )}
                <button onClick={() => deleteTask(t)} title="Delete this task" style={{ height: 24, padding: '0 8px', fontSize: 12 }}>
                  ✕ delete
                </button>
                {t.sessions.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 4 }}>
                    {t.sessions.length} session{t.sessions.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}

            {expandedId === t.id && t.sessions.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '4px 0 0 32px', padding: 0, fontSize: 12, color: 'var(--text-muted)' }}>
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
      </>
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
          <div style={{ background: 'var(--surface)', borderRadius: RADIUS.card, padding: 24, width: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--warning)', marginBottom: 4 }}>
              ★ WHAT'S TODAY'S MIT?
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>One Most Important Task. Do it first.</div>
            {mitPromptTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => pickMitPrompt(t)}
                style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, padding: '8px 8px', marginBottom: 4 }}
              >
                ☆ {t.text.slice(0, 44)}
              </button>
            ))}
            <button
              onClick={() => setMitPromptTasks(null)}
              style={{ display: 'block', margin: '8px auto 0', fontSize: 12, color: 'var(--text-muted)', border: 'none', background: 'none' }}
            >
              Skip today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
