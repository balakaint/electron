import { useEffect, useRef, useState } from 'react';
import { Check, ChevronUp, Circle, Square, X } from 'lucide-react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { useAutoTimer } from '../useAutoTimer';
import { accentText } from '../themes';
import {
  Goal,
  GoalHorizon,
  GoalOwnerKey,
  GoalPanel,
  GoalTask,
  ProjectKey,
  ProjectOrderEntry,
  STRIKE_MAX,
  Task,
  goalTasksApi,
  goalsApi,
  projectsApi,
  tasksApi,
} from '../services/api';
import { dayNumber } from '../format';
import { RADIUS } from '../spacing';
import { useAutofocus } from '../hooks/useAutofocus';

// ⚠ READ THE KEYS CAREFULLY BEFORE CHANGING ANYTHING HERE.
//
// The `key` and the `label` do NOT correspond, and that is deliberate in
// two separate layers.
//
// Legacy shipped SHORT / MID / LONG TERM against keys yearly / monthly /
// weekly, already crossed: the horizon is how long the goal runs, the
// label is how near the work is. Zahid then asked for the defaults to
// read WEEKLY / MONTHLY / YEARLY top to bottom, which crosses them the
// rest of the way — the top row's key is `yearly` and it now says
// "WEEKLY GOAL".
//
// That looks like a bug and it is not one, so: DO NOT "fix" it by
// renaming the keys or reordering this array. The keys are the stored
// horizon on every Goal row and the column names behind
// sec_title_yearly / _monthly / _weekly. Swapping them would move every
// existing goal to a different section of the screen — a data reshuffle
// dressed up as a label change. The words on screen are the only thing
// that changed here.
//
// These are DEFAULTS. Each heading is editable and the custom title is
// stored per horizon, so `sectionTitle[key] || label` means anyone who
// has already renamed a section keeps their name.
//
// `weight` is the share of the column each section gets — 50 / 30 / 20,
// Zahid's split. It is a real division of the height, not a maximum:
// the three sections fill the panel exactly and each scrolls inside
// itself, so the column never ends in blank space and a long week never
// pushes the year off screen.
//
// The sizes say what the horizons are FOR. The week is where the work
// actually gets decided, so it gets half the column; the year is a
// direction you check rather than edit, so it gets a fifth. Legacy's
// 50/25/25 said nearly the same thing with the bottom two tied.
const HORIZONS: { key: GoalHorizon; label: string; glyph: string; accent: string; weight: number }[] = [
  { key: 'yearly', label: 'WEEKLY GOAL', glyph: '◈', accent: 'var(--goal-yearly)', weight: 50 },
  { key: 'monthly', label: 'MONTHLY GOAL', glyph: '❖', accent: 'var(--goal-monthly)', weight: 30 },
  { key: 'weekly', label: 'YEARLY GOAL', glyph: '◆', accent: 'var(--goal-weekly)', weight: 20 },
];

// Legacy capped the progress bar at a flat 30-day window for every
// horizon. Zahid asked for horizon-based defaults instead (weekly goal
// 7 days, monthly 30, yearly 12 months) AND a calendar picker to
// override them — so the window is no longer a constant here at all.
// It's now `goal.deadline`, a real stored/editable field (see the
// backend's engine.goals._default_deadline for where the 7/30/12mo
// defaults are actually computed, and its own warning about the
// crossed horizon<->label mapping). This file only reads the result.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
}

// Whole days between two ISO dates, for turning a goal's own
// start_date/deadline pair into a "day N of M" window — the same shape
// the old fixed GOAL_WINDOW used to provide, now derived per-goal
// instead of being one constant for every horizon. Clamped to at least
// 1 so a same-day or backwards deadline (a user can type anything into
// the picker) never produces a divide-by-zero or a negative bar.
function windowDays(startIso: string, deadlineIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${deadlineIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

// ONE LINE AT REST, the rest on demand.
//
// This used to render every goal as a full editing form at all times: a
// notes textarea, a native date picker and a delete button on each one,
// whether or not you were editing. Measured on the running app, six
// goals cost 926px and still scrolled, nine date inputs at 95px each,
// and five of the six note boxes were empty — a third of the panel spent
// telling you that you had written nothing.
//
// The panel is read many times a day and edited rarely, so the resting
// state is the one to optimise. A goal at rest is a tick, its name, a
// progress spark and its day count. Opening it is what reveals the
// editor, and only one is open at a time.
// A compact label+value row for the expanded goal's meta fields
// (STARTED / DEADLINE / PROGRESS) — Zahid's own mockup asked for these
// as labeled rows rather than the single run-on "started … · day …
// ends …" line the panel used to have. NEXT ACTION gets its own
// heavier, bordered/accented treatment below instead of a MetaRow: his
// priority table ranked it "Very High" against these three's "Medium",
// so it needs to look different, not just be positioned lower.
function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span
        style={{
          // 60 was narrower than "PROGRESS" itself at 12px/700/0.5
          // tracking — the one label this row ever draws — so its last
          // letter spilled past the box and into the bar beside it.
          // flex: 'none' fixes the box's width but not what happens
          // when content exceeds it: with no whiteSpace, the browser
          // still wraps or overflows visibly rather than clipping.
          width: 72,
          flex: 'none',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: 'var(--text-faint)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)' }}>{children}</div>
    </div>
  );
}

function GoalRow({
  goal,
  accent,
  open,
  onOpen,
  onClose,
  onToggle,
  onDelete,
  onEditText,
  onEditNote,
  onEditStartDate,
  onEditDeadline,
  onOpenBoard,
  focusTasks,
  onFocusListChanged,
}: {
  goal: Goal;
  accent: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onEditText: (text: string) => void;
  onEditNote: (note: string) => void;
  onEditStartDate: (date: string) => void;
  onEditDeadline: (deadline: string) => void;
  onOpenBoard: () => void;
  // Every goal's "+ STRIKE" chips share this one Focus-list snapshot
  // (fetched once by GoalsPanel, not per-row) so they agree about which
  // tasks are already committed and how full today is — same reasoning
  // ProjectDashboard fetches focusTasks once for every ProjectCard.
  focusTasks: Task[];
  // Called after a strike attempt (success or 409) so GoalsPanel
  // re-fetches focusTasks and tells the other panels — mirrors
  // ProjectCard's strikeSubtask calling its own onChanged either way.
  onFocusListChanged: () => void;
}) {
  const [text, setText] = useState(goal.text);
  const textInputRef = useAutofocus<HTMLInputElement>(open);
  const [startDate, setStartDate] = useState(goal.start_date);
  const [deadline, setDeadline] = useState(goal.deadline);
  const noteField = useAutosave(goal.note, onEditNote);

  const [tasks, setTasks] = useState<GoalTask[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const tasksBlockRef = useRef<HTMLDivElement>(null);
  const [strikeFlash, setStrikeFlash] = useState<string | null>(null);
  const newTaskRef = useAutofocus<HTMLInputElement>(addingTask);

  const refreshTasks = () => goalTasksApi.list(goal.id).then(setTasks);

  useEffect(() => setText(goal.text), [goal.text]);
  useEffect(() => setStartDate(goal.start_date), [goal.start_date]);
  useEffect(() => setDeadline(goal.deadline), [goal.deadline]);
  // Fetched regardless of open/collapsed — the collapsed row's own
  // tooltip surfaces the first pending task, same as ProjectCard's
  // collapsed preview needing subtasks whether or not the card is open.
  useEffect(() => {
    refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal.id]);

  const addTask = () => {
    const t = newTaskText.trim();
    if (!t) return;
    goalTasksApi.add(goal.id, t).then(() => {
      setNewTaskText('');
      refreshTasks();
    });
  };

  const strikeTask = (pid: string) => {
    goalTasksApi
      .strike(pid)
      .then(() => onFocusListChanged())
      .catch(() => {
        setStrikeFlash(pid);
        setTimeout(() => setStrikeFlash(null), 1500);
        onFocusListChanged();
      });
  };

  const pendingTasks = tasks.filter((t) => !t.done);
  const tasksDone = tasks.length - pendingTasks.length;

  // Click outside the add-task form closes it, same pattern ToolsMenu
  // uses for its own popup — without this it stayed open until "+ task"
  // was pressed again, the only way out being the button that opened it
  // (Zahid caught this live: "outside click will collapse add task
  // window, it remain same until i click + button again").
  useEffect(() => {
    if (!addingTask) return;
    const onDocDown = (e: MouseEvent) => {
      if (tasksBlockRef.current && !tasksBlockRef.current.contains(e.target as Node)) setAddingTask(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [addingTask]);

  // The bar means board completion — how much of the work under this
  // goal is actually done, not how much time has passed. Zahid
  // confirmed this explicitly (2026-09-14): a freshly-opened goal with
  // no board yet must read 0%, not a time-elapsed guess — a prior
  // version of this code filled the bar from elapsed time as a
  // fallback ("day 1 of 14" -> 7%), which he flagged as wrong on his
  // own running app. So PROGRESS now shows 0% until a board exists;
  // the day-count context (start..deadline) still shows elsewhere
  // (the STARTED/DEADLINE row), just not as a fill on this bar.
  const hasBoardData = goal.board_total > 0;
  const goalWindow = windowDays(goal.start_date, goal.deadline);
  const pct = hasBoardData ? (goal.board_done / goal.board_total) * 100 : 0;
  const barColor = goal.done ? 'var(--success)' : accent;
  const dayLabel = hasBoardData
    ? `${goal.board_done}/${goal.board_total}`
    : `d${goal.day_number}${goal.day_number <= goalWindow ? `/${goalWindow}` : ''}`;
  const barTitle = hasBoardData
    ? `${goal.board_done} of ${goal.board_total} board cards done`
    : `No board yet — day ${goal.day_number} of ${goalWindow}`;

  const tick = (
    <button
      onClick={onToggle}
      title={goal.done ? 'Mark not done' : 'Mark done'}
      aria-pressed={goal.done}
      style={{
        width: 24,
        height: 24,
        flex: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: goal.done ? 'var(--success)' : 'var(--text-faint)',
        transition: 'color 0.12s ease-out',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {goal.done ? <Check size={15} /> : <Circle size={15} />}
    </button>
  );

  // Hover-and-focus, via a class rather than inline styles, because
  // inline CSS cannot express :hover or :focus-within. Delete was the
  // most prominent thing in every card — a boxed ✕ in the top-right
  // corner of each one, twelve on screen at once. It is still reachable
  // by keyboard (focus-within shows it), just no longer shouting.
  const del = (
    <button
      className="goal-x"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      title="Delete this goal"
      aria-label="Delete this goal"
      style={{
        width: 24,
        height: 24,
        flex: 'none',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <X size={13} />
    </button>
  );

  if (!open) {
    return (
      <div
        className="goal-row"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', borderRadius: RADIUS.control }}
      >
        {tick}
        {/* The name is the click target, not the whole row: a row-level
            role="button" would nest the tick and the delete inside it,
            which is invalid and makes both ambiguous to a screen
            reader. */}
        <button
          onClick={onOpen}
          // Same treatment as ProjectCard's collapsed preview tooltip —
          // the top pending task, without adding a second visible line
          // to a row this app already fixed once for being too tall.
          title={pendingTasks.length > 0 ? `${goal.text}  ·  → ${pendingTasks[0].text}` : 'Open this goal'}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: 14,
            fontWeight: 600,
            padding: '4px 0',
            cursor: 'pointer',
            color: goal.done ? 'var(--text-faint)' : 'var(--text)',
            textDecoration: goal.done ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {goal.text}
        </button>
        <span
          title={barTitle}
          style={{ width: 64, height: 4, background: 'var(--border)', borderRadius: RADIUS.pill, flex: 'none', overflow: 'hidden' }}
        >
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: barColor, transition: 'width 300ms ease' }} />
        </span>
        <span
          style={{
            width: 52,
            textAlign: 'right',
            flex: 'none',
            fontSize: 12,
            fontFamily: 'monospace',
            color: 'var(--text-faint)',
          }}
        >
          {dayLabel}
        </span>
        {del}
      </div>
    );
  }

  return (
    // Escape-to-close is delegated from whichever child has focus (the
    // rename input, most often) — the row itself is never meant to be
    // tabbed to, so a role/tabIndex here would add a focus stop that
    // does nothing.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="goal-row goal-row-open card-elevated"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: RADIUS.card,
        padding: '8px 8px',
        margin: '4px 0',
        boxShadow: 'var(--shadow-sm)',
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tick}
        <input
          ref={textInputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== goal.text && onEditText(text.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 13,
            fontWeight: 700,
            padding: '4px 0',
          }}
        />
        <button
          onClick={onClose}
          title="Close"
          aria-label="Close"
          style={{ width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronUp size={14} />
        </button>
        {del}
      </div>

      {/* Labeled rows: STARTED+DEADLINE / PROGRESS / NEXT ACTION /
          NOTES, matching the priority order Zahid's own review ranked
          them in. STARTED and DEADLINE share one row — Zahid's own
          follow-up after seeing this on his machine ("startted and
          dateline single row will save space"): as two separate
          MetaRows, each date input sat inside MetaRow's flex:1 value
          column but didn't itself stretch to fill it, leaving a wide
          empty strip beside the STARTED picker (visible as dead space
          in his screenshot) and costing a whole extra row height for
          DEADLINE. This row is hand-built instead of two MetaRows for
          that reason — both pickers hug their own content, and the
          leftover space goes to the day-count text, not to nothing. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)', flex: 'none' }}>
            STARTED
          </span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={() => startDate !== goal.start_date && onEditStartDate(startDate)}
            title="Start date"
            style={{
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: RADIUS.pill,
              background: 'transparent',
              color: 'inherit',
              padding: '2px 4px',
              flex: 'none',
              colorScheme: 'var(--input-color-scheme)',
            }}
          />
          <span style={{ color: 'var(--text-faint)', flex: 'none' }}>→</span>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)', flex: 'none' }}>
            DEADLINE
          </span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            onBlur={() => deadline !== goal.deadline && onEditDeadline(deadline)}
            title="Deadline — defaults per horizon, editable any time"
            style={{
              fontSize: 12,
              border: '1px solid var(--border)',
              borderRadius: RADIUS.pill,
              background: 'transparent',
              color: 'inherit',
              padding: '2px 4px',
              flex: 'none',
              colorScheme: 'var(--input-color-scheme)',
            }}
          />
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {!goal.done && goal.day_number > goalWindow ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{goal.day_number - goalWindow}d overdue</span>
            ) : (
              <>day {goal.day_number} of {goalWindow}</>
            )}
            {goal.done && goal.done_date && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}> · <Check size={12} /> {shortDate(goal.done_date)}</span>
            )}
          </span>
        </div>
        <MetaRow label="PROGRESS">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              title={barTitle}
              style={{ flex: 1, minWidth: 0, height: 5, background: 'var(--border)', borderRadius: RADIUS.pill, overflow: 'hidden' }}
            >
              <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: barColor, transition: 'width 300ms ease' }} />
            </span>
            {/* Count/percent and the BOARD button are grouped tighter
                (8px) than their gap from the bar (12px) — they read as
                one status cluster, not three equally-spaced items
                fighting for attention on one crowded line. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', flex: 'none' }}>
                {hasBoardData ? `${goal.board_done}/${goal.board_total} tasks done` : `${Math.round(pct)}%`}
              </span>
              {/* Breaking a goal into work is a different action from
                  writing it down. Placed next to PROGRESS rather than as
                  its own row: the board is what drives this number, so
                  the button that opens it belongs beside it. Superseded
                  design note: this used to create one card directly on a
                  flat per-project Board — the user corrected the shape to
                  Goal -> Task -> that task's own board, so this opens the
                  full-window overlay instead of writing anything itself. */}
              <button
                onClick={onOpenBoard}
                title="Break this goal into tasks, each with its own board"
                className="btn-primary"
                style={{ fontSize: 12, padding: '4px 8px', flex: 'none' }}
              >
                → BOARD
              </button>
            </div>
          </div>
        </MetaRow>
      </div>

      {/* TASKS — replaces the old single free-text NEXT ACTION field.
          Zahid's own review called that field the biggest UX
          opportunity on this panel, but a single line couldn't hold
          more than one next step and still meant opening the full
          Individual Task Board (→ BOARD above) for anything beyond it.
          This is ProjectCard's own TASKS block (add/check/strike/
          remove, no board needed) ported here verbatim — same shape,
          same "+ STRIKE" cap, so a quick goal-level task moves exactly
          as fast as a project-level one. */}
      <div ref={tasksBlockRef} style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: 'var(--text-faint)', letterSpacing: 0.5 }}>TASKS</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--text-muted)' }}>
            {tasksDone}/{tasks.length}
          </span>
          <button
            onClick={() => setAddingTask((v) => !v)}
            title="Add a task to this goal"
            style={{ fontSize: 12, height: 24, padding: '0 8px' }}
          >
            + task
          </button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
          {tasks.map((t) => {
            const committed = focusTasks.find((ft) => ft.gsrc === t.pid);
            const onToday = committed !== undefined && committed.strike && !committed.done;
            const full = focusTasks.filter((ft) => ft.strike && !ft.done).length >= STRIKE_MAX;
            return (
              <li key={t.pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <span style={{ width: 3, alignSelf: 'stretch', minHeight: 16, background: t.done ? 'var(--border)' : accent }} />
                <button
                  onClick={() => goalTasksApi.toggle(t.pid).then(refreshTasks)}
                  title="Toggle done"
                  aria-label={t.done ? 'Mark not done' : 'Mark done'}
                  style={{ width: 24, height: 24, padding: 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {t.done ? <Check size={15} /> : <Square size={15} />}
                </button>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: t.done ? 'line-through' : 'none',
                  }}
                  title={t.text}
                >
                  {t.text}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {dayNumber(t.added_date)}
                </span>
                {!t.done && (
                  <button
                    onClick={() => strikeTask(t.pid)}
                    disabled={onToday || (full && !onToday)}
                    title={onToday ? 'Already on today’s list' : 'Commit to today’s 3'}
                    style={{
                      fontSize: 12,
                      height: 24,
                      padding: '0 8px',
                      flex: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      opacity: onToday ? 0.7 : 1,
                      color: onToday ? accent : undefined,
                    }}
                  >
                    {strikeFlash === t.pid ? 'DAY FULL' : onToday ? <><Check size={12} /> ON TODAY</> : '+ STRIKE'}
                  </button>
                )}
                <button
                  onClick={() => goalTasksApi.remove(t.pid).then(refreshTasks)}
                  title="Delete"
                  aria-label="Delete task"
                  style={{ width: 28, height: 28, padding: 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={15} />
                </button>
              </li>
            );
          })}
        </ul>
        {tasks.length > 0 && (
          <div title={`${tasksDone}/${tasks.length} tasks done`} style={{ height: 4, background: 'var(--progress-track)', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${(tasksDone / tasks.length) * 100}%`, background: accent }} />
          </div>
        )}
        {addingTask && (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              ref={newTaskRef}
              aria-label="New task for this goal"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask();
                if (e.key === 'Escape') setAddingTask(false);
              }}
              placeholder="Add task…"
              style={{ flex: 1, fontSize: 12, padding: 4 }}
            />
            <button onClick={addTask} title="Add task">+</button>
          </div>
        )}
      </div>

      {/* NOTES — "Very Low" in the same priority table, so it stays the
          quietest thing on the row: no label box, no accent, smallest
          type. */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)', marginBottom: 4 }}>
          NOTES
        </div>
        <textarea
          value={noteField.value}
          onChange={(e) => noteField.setValue(e.target.value)}
          onBlur={noteField.flush}
          placeholder="Notes…"
          rows={2}
          style={{
            width: '100%',
            fontSize: 12,
            padding: 4,
            resize: 'vertical',
            boxSizing: 'border-box',
            ...savedFlashStyle(noteField.state),
          }}
        />
      </div>
    </div>
  );
}

function GoalSection({
  horizon,
  label,
  defaultLabel,
  glyph,
  weight,
  accent,
  goals,
  openId,
  onOpenChange,
  onAdd,
  onToggle,
  onDelete,
  onEditText,
  onEditNote,
  onEditStartDate,
  onEditDeadline,
  onRenameTitle,
  onOpenBoard,
  focusTasks,
  onFocusListChanged,
}: {
  horizon: GoalHorizon;
  label: string;
  defaultLabel: string;
  glyph: string;
  weight: number;
  accent: string;
  goals: Goal[];
  openId: number | null;
  onOpenChange: (id: number | null) => void;
  onAdd: (text: string, startDate: string) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEditText: (id: number, text: string) => void;
  onEditNote: (id: number, note: string) => void;
  onEditStartDate: (id: number, date: string) => void;
  onEditDeadline: (id: number, deadline: string) => void;
  onRenameTitle: (title: string) => void;
  onOpenBoard: (goal: Goal) => void;
  focusTasks: Task[];
  onFocusListChanged: () => void;
}) {
  const [title, setTitle] = useState(label);
  const [composing, setComposing] = useState(false);
  const [newText, setNewText] = useState('');
  const newTextInputRef = useAutofocus<HTMLInputElement>(composing);
  const [newDate, setNewDate] = useState(todayIso);

  useEffect(() => setTitle(label), [label]);

  const done = goals.filter((g) => g.done).length;
  const openCount = goals.length - done;

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newText.trim();
    if (!t) return;
    onAdd(t, newDate || todayIso());
    setNewText('');
    setNewDate(todayIso());
    // Stays open: adding one goal is usually adding three.
  };

  return (
    // flexGrow: weight with a ZERO BASIS is what makes the split exact.
    // With the default `auto` basis each section would first claim its
    // content's height and the weights would only divide the leftover —
    // which is how a 50/25/25 split produced three near-equal sections
    // whenever their contents were similar. From zero, the weights ARE
    // the proportions.
    //
    // The list inside each section carries overflowY, so a section that
    // holds more than its share scrolls rather than growing: the three
    // always fill the column and never more than it.
    //
    // EXCEPT when a section is genuinely empty (no goals, not mid-add):
    // its proportional share was still reserved in full, so a low-goal
    // project could leave ~500px of blank space below "Nothing here
    // yet" (Zahid's UX audit, 2026-09-20). An empty section shrinks to
    // its own content instead — the freed space goes to whichever
    // section(s) still have real content, via their own unchanged
    // weights.
    <div
      style={{
        flex: goals.length === 0 && !composing ? '0 0 auto' : `${weight} 1 0`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* The header carries the count AND the add control. There used to
          be a permanent composer under every section — three text
          fields, three date pickers and three Add buttons on screen for
          one action. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 4px 4px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 4,
        }}
      >
        <span style={{ color: accent, fontSize: 12 }}>{glyph}</span>
        <input
          aria-label="Section heading"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          // BUG THIS FIXES: this fired on EVERY blur, so merely clicking
          // into a heading and out again persisted whatever it happened
          // to be showing — including the default. Once the old default
          // "MID TERM GOAL" was written into sec_title_monthly, it was a
          // custom title, and changing the default could never reach it
          // again. Two of three sections picked up the new names and the
          // middle one did not, which is what it looked like from
          // outside: a rename that half worked.
          //
          // So: persist only a real change, and treat "typed the default
          // back in" as clearing the override rather than as a custom
          // title that happens to match. An empty string clears it
          // server-side, which is what restores default-following.
          onBlur={() => {
            const next = title.trim();
            if (next === label) return;
            onRenameTitle(next === defaultLabel ? '' : next);
          }}
          title="Rename this section"
          style={{
            flex: 1,
            minWidth: 0,
            fontWeight: 700,
            fontSize: 12,
            letterSpacing: 0.5,
            border: 'none',
            background: 'transparent',
            color: accent,
            padding: 0,
            height: 24,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
          {done}/{goals.length}
          {openCount > 0 && goals.length > 0 ? ` · ${openCount} open` : ''}
        </span>
        <button
          onClick={() => setComposing((v) => !v)}
          aria-expanded={composing}
          title={`Add a ${label.toLowerCase()}`}
          style={{
            width: 24,
            height: 24,
            flex: 'none',
            border: 'none',
            background: composing ? 'var(--accent-light)' : 'transparent',
            borderRadius: RADIUS.control,
            color: composing ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          +
        </button>
      </div>

      {composing && (
        <form onSubmit={submitAdd} style={{ display: 'flex', gap: 4, margin: '4px 0 4px' }}>
          <input
            ref={newTextInputRef}
            value={newText}
            aria-label="New goal"
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setComposing(false)}
            placeholder="What are you aiming at?"
            style={{ flex: 1, fontSize: 12, padding: 4, minWidth: 0 }}
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            title="Start date"
            style={{ fontSize: 12, padding: 4, width: 116, colorScheme: 'var(--input-color-scheme)' }}
          />
          <button type="submit" style={{ fontSize: 12 }}>
            Add
          </button>
        </form>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {goals.length === 0 && !composing && (
          // One muted line. Three stacked illustrated empty states was
          // the app apologising three times on a panel that is empty
          // only until you have used it once.
          <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 4px' }}>
            Nothing here yet — <span style={{ color: 'var(--accent)' }}>+</span> to add one.
          </div>
        )}
        {goals.map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            accent={accent}
            open={openId === g.id}
            onOpen={() => onOpenChange(g.id)}
            onClose={() => onOpenChange(null)}
            onToggle={() => onToggle(g.id)}
            onDelete={() => onDelete(g.id)}
            onEditText={(text) => onEditText(g.id, text)}
            onEditNote={(note) => onEditNote(g.id, note)}
            onEditStartDate={(date) => onEditStartDate(g.id, date)}
            onEditDeadline={(deadline) => onEditDeadline(g.id, deadline)}
            onOpenBoard={() => onOpenBoard(g)}
            focusTasks={focusTasks}
            onFocusListChanged={onFocusListChanged}
          />
        ))}
      </div>
    </div>
  );
}

export default function GoalsPanel({
  projectKey,
  onOpenBoard,
  focusVersion,
  onFocusChanged,
}: {
  // The reserved "life" key (App.tsx passes it whenever every real
  // project in panel 1 is collapsed) renders this exact same component —
  // same sections, same editing, same CRUD — with only the header
  // changed to "LIFE PLAN" instead of a project name. See GoalOwnerKey's
  // own comment in services/api.ts.
  projectKey: GoalOwnerKey | null;
  // Fires when a goal's "→ BOARD" button is pressed. App.tsx wires this
  // to open the full-window Goal -> Task -> Board overlay for that
  // goal — GoalsPanel itself no longer talks to boardApi at all (see
  // the superseded design note on GoalRow's button above).
  onOpenBoard: (goalId: number) => void;
  // Bumped by panel 1 or panel 3 when either writes to the shared Focus
  // list, so this panel's own "+ STRIKE" chips (GoalRow's TASKS block)
  // re-fetch and stay in sync — same three-way counter contract as
  // ProjectDashboard/Panel3, see App.tsx's panel2Wrote comment.
  focusVersion: number;
  // Called when THIS panel writes (a goal task struck), so the other
  // two panels re-fetch.
  onFocusChanged: () => void;
}) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [panel, setPanel] = useState<GoalPanel | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [focusTasks, setFocusTasks] = useState<Task[]>([]);
  // ONE open goal across the whole panel, not one per section. Two open
  // editors would be two places to look for the thing you are editing,
  // and the panel is 545px wide — there is room for exactly one.
  const [openGoalId, setOpenGoalId] = useState<number | null>(null);
  // Without this, a failed fetch left `goals`/`panel`/`order` at their
  // empty defaults with nothing catching the rejection — the panel
  // rendered with no visible signal anything had gone wrong (ui-ux-audit
  // verify pass, 2026-09-22).
  const [loadError, setLoadError] = useState(false);

  const refreshGoals = (key: GoalOwnerKey) => goalsApi.list(key).then(setGoals).catch(() => setLoadError(true));
  const refreshOrder = () => projectsApi.order().then(setOrder).catch(() => setLoadError(true));
  const refreshFocusTasks = () => tasksApi.list('focus').then(setFocusTasks);
  // Called after a goal task is struck (success or 409) — refreshes this
  // panel's own copy AND tells the other two panels, same as
  // ProjectCard's strikeSubtask calling onChanged either way.
  const onFocusListChanged = () => {
    refreshFocusTasks();
    onFocusChanged();
  };

  useEffect(() => {
    refreshOrder();
    refreshFocusTasks();
  }, []);

  // Panel 1 or panel 3 struck, completed or deleted something; this
  // panel's own "+ STRIKE" chips are computed from focusTasks, so they
  // are now wrong until we re-read — mirrors ProjectDashboard's own
  // focusVersion effect exactly.
  useEffect(() => {
    if (focusVersion === 0) return;
    refreshFocusTasks();
  }, [focusVersion]);

  // Re-runs whenever the shell points this panel at another project.
  // getPanel is still the source for the section titles, and it also
  // covers the first render, before the shell has loaded settings.
  useEffect(() => {
    goalsApi
      .getPanel()
      .then((p) => {
        setPanel(p);
        refreshGoals(projectKey ?? p.project_key);
      })
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  // Zahid's own framing: "goal click means i am working and giving
  // concentration in that project" — the same logic as legacy's
  // _auto_timer_on_open/_auto_timer_on_close (opening the Business
  // Analysis or Journey window starts the project's clock), now
  // extended to this panel. Opening ANY goal in this panel counts as
  // attention landing on `shownKey`'s project; closing it (or opening
  // a different project's panel) stops the clock again, but only if
  // this hook is the one that started it — see useAutoTimer's own
  // comment for the full auto-start/auto-stop contract (settings gate,
  // idle auto-stop, short-session discard — all still enforced by the
  // backend's toggle_timer, this hook just decides when to call it).
  // Computed with optional chaining because this hook must run on
  // every render (rules of hooks), including before `panel` loads.
  //
  // "life" has no real Project row (see GoalOwnerKey's comment), so it
  // must never reach useAutoTimer — there is nothing for
  // projectsApi.toggleTimer to start. useAutoTimer itself stays exactly
  // as it is for the 6 real projects: it only acts when it finds an
  // `order` entry for the key it's given, and "life" will never have
  // one, but resolving to null here rather than relying on that is what
  // keeps this hook's contract (ProjectKey | null) honest.
  const timerKey: ProjectKey | null = projectKey === 'life' ? null : projectKey ?? (panel?.project_key ?? null);
  useAutoTimer(openGoalId !== null ? timerKey : null, order, refreshOrder);

  if (!panel) {
    return loadError ? (
      <div
        style={{
          fontSize: 12,
          color: 'var(--danger)',
          background: 'var(--surface)',
          border: '1px solid var(--danger)',
          borderRadius: RADIUS.control,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        Couldn't load goals — check the app is connected.
        <button
          className="btn-ghost"
          style={{ fontSize: 12 }}
          onClick={() => {
            setLoadError(false);
            goalsApi.getPanel().then((p) => {
              setPanel(p);
              refreshGoals(projectKey ?? p.project_key);
            }).catch(() => setLoadError(true));
          }}
        >
          Retry
        </button>
      </div>
    ) : (
      <div>Loading…</div>
    );
  }

  const shownKey = projectKey ?? panel.project_key;
  const activeEntry = order.find((e) => e.project.key === shownKey);
  const headerLabel = shownKey === 'life' ? 'LIFE PLAN' : (activeEntry?.project.name || shownKey).toUpperCase();

  const sectionTitle: Record<GoalHorizon, string | null> = {
    yearly: panel.sec_title_yearly,
    monthly: panel.sec_title_monthly,
    weekly: panel.sec_title_weekly,
  };

  return (
    // Fills the column and lets the three sections divide its height,
    // rather than sitting at a fixed max-width inside it.
    // overflow HIDDEN, not auto. A scrolling parent has no definite
    // height for its children to take a percentage of, so the whole
    // 50/30/20 split silently degrades to content-sized sections. Each
    // section scrolls on its own instead.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', paddingLeft: 32, paddingRight: 4 }}>
      {/* The project chips that used to sit here are gone. Panel 1's
          Goals button is the switch — legacy has exactly one control for
          this, and two of them disagreeing about which project is
          selected is worse than a click saved. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontSize: 12,
          marginBottom: 12,
          paddingBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Whose goals these are. Without it the same three headings
            silently mean six different things depending on which card
            was pressed last, and nothing on screen says which. */}
        <span style={{ flex: 1, fontWeight: 700, color: activeEntry ? accentText(activeEntry.project.accent_color) : undefined }}>
          {headerLabel}
        </span>
        <span style={{ color: 'var(--text-faint)', letterSpacing: 0.5 }}>GOALS</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
        {HORIZONS.map(({ key, label, glyph, accent, weight }) => (
          <GoalSection
            key={key}
            horizon={key}
            label={sectionTitle[key] || label}
            defaultLabel={label}
            glyph={glyph}
            weight={weight}
            accent={accent}
            goals={goals.filter((g) => g.horizon === key)}
            openId={openGoalId}
            onOpenChange={setOpenGoalId}
            onAdd={(text, startDate) =>
              goalsApi.create(shownKey, key, text, startDate).then(() => refreshGoals(shownKey))
            }
            onToggle={(id) => goalsApi.toggle(id).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))}
            onDelete={(id) =>
              goalsApi.remove(id).then(() => {
                setGoals((gs) => gs.filter((x) => x.id !== id));
                // Deleting the goal that is open would otherwise leave
                // the panel holding an id that no longer resolves.
                setOpenGoalId((cur) => (cur === id ? null : cur));
              })
            }
            onEditText={(id, text) =>
              goalsApi.edit(id, { text }).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
            }
            onEditNote={(id, note) =>
              goalsApi.edit(id, { note }).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
            }
            onEditStartDate={(id, start_date) =>
              goalsApi.edit(id, { start_date }).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
            }
            onEditDeadline={(id, deadline) =>
              goalsApi.edit(id, { deadline }).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
            }
            focusTasks={focusTasks}
            onFocusListChanged={onFocusListChanged}
            onRenameTitle={(title) => goalsApi.setSectionTitle(key, title).then(setPanel)}
            onOpenBoard={(goal) => onOpenBoard(goal.id)}
          />
        ))}
      </div>
    </div>
  );
}
