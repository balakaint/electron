import { useEffect, useState } from 'react';
import {
  ActivityEntry,
  Project,
  ProjectKey,
  ProjectOrderEntry,
  STRIKE_MAX,
  Subtask,
  Task,
  TodayProgress,
  projectsApi,
  tasksApi,
} from '../services/api';
import { useAutoTimer } from '../useAutoTimer';
import BusinessAnalysisCanvas from './BusinessAnalysisCanvas';
import DeepWorkTrend from './DeepWorkTrend';
import TodayProgressBar from './TodayProgressBar';
import { savedFlashStyle, useAutosave } from '../useAutosave';

function formatSecs(secs: number): string {
  const mins = Math.round(secs / 60);
  return `${mins}m`;
}

// Legacy's _PROJ_TARGETS (task_tracker_v3_THEMES.py 2760). Its own note
// on why presets and not free typing: "the useful answers to 'how long a
// day on this project' are coarse, and a spinner you can land on 37
// minutes with invites fiddling instead of deciding."
const PROJ_TARGETS = [15, 30, 45, 60, 90, 120];

// The next preset ABOVE the current value, wrapping. Written as a search
// rather than an index lookup, exactly as legacy does, so a value the
// ±15 stepper produced (say 75) still steps sensibly to 90 instead of
// snapping back to the first preset.
function nextProjectTarget(current: number): number {
  return PROJ_TARGETS.find((o) => o > current) ?? PROJ_TARGETS[0];
}

function ProjectCard({
  entry,
  focusTasks,
  onChanged,
  onOpenAnalysis,
  onOpenJourney,
  onSelectGoals,
  goalsProject,
}: {
  entry: ProjectOrderEntry;
  focusTasks: Task[];
  onChanged: () => void;
  onOpenAnalysis: (key: ProjectKey) => void;
  onOpenJourney: (key: ProjectKey) => void;
  onSelectGoals: (key: ProjectKey) => void;
  goalsProject: ProjectKey | null;
}) {
  const { number, project } = entry;
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [name, setName] = useState(project.name);
  const [strikeFlash, setStrikeFlash] = useState<string | null>(null);
  // Legacy defaults the heading to "QUICK NOTES" and lets it be renamed
  // per project; empty means "use the default", not "no heading".
  const [noteTitle, setNoteTitle] = useState(project.note_title);
  const [addingTask, setAddingTask] = useState(false);

  const key = project.key as ProjectKey;
  const noteField = useAutosave(project.note, (v: string) => projectsApi.update(key, { note: v }).then(onChanged));

  const refreshSubtasks = () => projectsApi.listSubtasks(key).then(setSubtasks);
  const refreshActivity = () => projectsApi.activity(key, 30).then(setActivity);

  useEffect(() => {
    setName(project.name);
    setNoteTitle(project.note_title);
    refreshSubtasks();
    refreshActivity();
  }, [project.name, project.note, key]);

  const saveName = () => {
    if (name !== project.name) projectsApi.update(key, { name }).then(onChanged);
  };

  const saveNoteTitle = () => {
    const t = noteTitle.trim();
    if (t !== project.note_title) projectsApi.update(key, { note_title: t }).then(onChanged);
  };

  const strikeSubtask = (pid: string) => {
    projectsApi
      .strikeSubtask(pid)
      .then(() => onChanged())
      .catch(() => {
        setStrikeFlash(pid);
        setTimeout(() => setStrikeFlash(null), 1500);
        // Resync, or the button that just failed stays enabled and the
        // next click fails identically. `focusTasks` is fetched by the
        // panel above and is what decides whether today is full, so a
        // task struck anywhere ELSE — the STRIKE card, the task list —
        // leaves this copy stale: the chip still reads "+ STRIKE", the
        // server still says 409, and clicking produces nothing visible
        // but another rejected request. A 409 is the server telling us
        // this view is out of date, so treat it as one.
        onChanged();
      });
  };

  const addSubtask = () => {
    const text = newSubtask.trim();
    if (!text) return;
    projectsApi.addSubtask(key, text).then(() => {
      setNewSubtask('');
      refreshSubtasks();
    });
  };

  const running = project.running_since !== null;
  const pct = project.target_minutes > 0 ? Math.min(100, Math.round((project.secs_today / (project.target_minutes * 60)) * 100)) : 0;

  const toggleCollapsed = () => projectsApi.update(key, { collapsed: !project.collapsed }).then(onChanged);
  const soloThis = () => projectsApi.solo(key).then(onChanged);

  // One line that answers "how is this project doing today" without
  // opening it — matches legacy's _collapsed_preview_text. Time-vs-
  // target rather than the next task's name, since the question you
  // scan collapsed cards for is which project has gone quiet, and a
  // task name can't tell you that (a project untouched for a week
  // shows the same line as one worked an hour ago; the minutes can't).
  const pending = subtasks.filter((s) => !s.done);
  const subtasksDone = subtasks.length - pending.length;
  const previewBits = [`${formatSecs(project.secs_today)} / ${project.target_minutes}m`];
  if (subtasks.length > 0) previewBits.push(`${subtasks.length - pending.length}/${subtasks.length}`);
  const previewTail =
    subtasks.length === 0
      ? ''
      : pending.length === 0
        ? '✓ all tasks done'
        : `→ ${pending[0].text}${pending.length > 1 ? `  (+${pending.length - 1} more)` : ''}`;
  const previewText = [previewBits.join('   ·   '), previewTail].filter(Boolean).join('   ·   ');

  return (
    <div
      style={{
        border: `1px solid ${project.accent_color}55`,
        borderRadius: 8,
        marginBottom: 16,
        overflow: 'hidden',
        opacity: project.done_today ? 0.7 : 1,
      }}
    >
      {/* Top strip — legacy's _draw_top_strip (6903-6926). It fills by
          SUBTASK completion, and carries two states a plain accent bar
          cannot: a project with no subtasks reads muted rather than
          fully saturated, so an untouched project doesn't look identical
          to a finished one; and a project with subtasks but none done
          keeps a thin sliver, so "active, zero progress" stays distinct
          from "empty". */}
      <div style={{ height: 10, background: 'var(--progress-track)' }}>
        {subtasks.length > 0 && (
          <div
            title={`${subtasksDone}/${subtasks.length} subtasks done`}
            style={{
              height: '100%',
              width: subtasksDone > 0 ? `${(subtasksDone / subtasks.length) * 100}%` : 5,
              minWidth: 3,
              background: project.accent_color,
            }}
          />
        )}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span
            onClick={toggleCollapsed}
            onDoubleClick={soloThis}
            title="Click to collapse/expand · double-click to solo this project"
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {number}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder={`PROJECT ${number}`}
            style={{ flex: 1, fontWeight: 'bold', fontSize: 15, border: 'none', background: 'transparent', color: project.accent_color }}
          />
          {/* Nothing else on this row. Legacy is explicit about why
              (6713-6719): the buttons used to sit here, and sharing the
              row with a fixed-width cluster "clipped longer project
              names". It did here too — "SHIP SPARE EXPORT CAN GENER…".
              The title owns its row; the buttons moved down. */}
        </div>

        {project.collapsed ? (
          <div onClick={toggleCollapsed} style={{ fontSize: 11, opacity: 0.7, cursor: 'pointer', padding: '2px 0' }}>
            {previewText}
          </div>
        ) : (
          <>
        {/* Notes first. Legacy puts them directly under the header
            (6634-6696, body row 1) and the timer row below them — the
            note is what the card is for on a planning screen, and
            burying it under the task list is what made these cards so
            tall that only two fit on screen. */}
        <input
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          onBlur={saveNoteTitle}
          placeholder="QUICK NOTES"
          title="Rename this note — legacy keeps a per-project heading"
          style={{
            width: '100%',
            fontSize: 11,
            letterSpacing: 0.5,
            opacity: 0.7,
            border: 'none',
            background: 'transparent',
            color: project.accent_color,
            padding: 0,
            marginBottom: 4,
          }}
        />
        <textarea
          value={noteField.value}
          onChange={(e) => noteField.setValue(e.target.value)}
          onBlur={noteField.flush}
          rows={5}
          placeholder="Jot something down…"
          style={{ width: '100%', fontSize: 12, padding: 6, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box', ...savedFlashStyle(noteField.state) }}
        />

        {/* Legacy's _actrow (6714-6829), which is a two-sided row and not
            a progress bar: the timer box on the LEFT, the three page
            links on the RIGHT. It sits under the notes because legacy
            moved it out of the header — see the note up there.

            The fill line is short and above the timer, not a full-width
            bar across the row (6725-6727, width=118). It is the "this
            one is running" signal for the button directly beneath it, so
            it is scoped to that button rather than to the whole card. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 10, fontSize: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ width: 118, height: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: project.accent_color }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => projectsApi.toggleTimer(key).then(onChanged)}
                title="Start / stop working on this project"
                aria-pressed={running}
                style={{
                  background: running ? project.accent_color : 'transparent',
                  color: running ? 'var(--on-accent)' : project.accent_color,
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                {running ? '⏸' : '▶'}
              </button>
              {/* Elapsed AND target, because "a target you set in a
                  different panel is a target you forget you set"
                  (6759-6766). Clicking cycles it — the same
                  click-to-cycle idiom as task urgency and the Circle
                  cadence chip, so no stepper and no dialog. The −/+
                  buttons that used to sit here are a control legacy does
                  not put on the card; the cycle wraps past 120 back to
                  15, so nothing is unreachable without them. */}
              <button
                onClick={() =>
                  projectsApi
                    .bumpTarget(key, nextProjectTarget(project.target_minutes) - project.target_minutes)
                    .then(onChanged)
                }
                title={`Time today / daily target — click to cycle ${PROJ_TARGETS.join('/')} min`}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: running ? project.accent_color : 'inherit',
                  font: 'inherit',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: running ? 1 : 0.75,
                }}
              >
                {formatSecs(project.secs_today)} / {project.target_minutes}m
              </button>
            </div>
          </div>

          {/* Legacy's _navrow (6800-6828). Named, not glyphs: these open
              the two pages the app is built around and were once hidden
              behind ▤ and ❖. "Goals" points PANEL 2 at this project and
              renders filled while it is doing so, "so the card itself
              answers whose goals am I looking at". */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => onSelectGoals(key)}
              aria-pressed={goalsProject === key}
              title="Show this project's short / mid / long term goals in panel 2"
              style={{
                fontSize: 11,
                background: goalsProject === key ? project.accent_color : 'transparent',
                color: goalsProject === key ? 'var(--on-accent)' : undefined,
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              Goals
            </button>
            <button
              onClick={() => onOpenAnalysis(key)}
              title="Business Analysis — idea, numbers, decision"
              style={{ fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              Analysis
            </button>
            <button
              onClick={() => onOpenJourney(key)}
              title="Product Journey — the dated record of what you tried"
              style={{ fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            >
              Journey
            </button>
          </div>
        </div>

        {/* Legacy's TASKS header row: label, done-count, "+ task"
            (6848-6862). The add field lives behind that button rather
            than sitting open on every card — six always-visible inputs
            is most of why this column scrolled. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 2 }}>
          <span style={{ opacity: 0.6, letterSpacing: 0.5 }}>TASKS</span>
          <span style={{ flex: 1 }} />
          <span style={{ opacity: 0.6 }}>
            {subtasksDone}/{subtasks.length}
          </span>
          <button
            onClick={() => setAddingTask((v) => !v)}
            title="Add a task to this project"
            style={{ fontSize: 11 }}
          >
            + task
          </button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
          {subtasks.map((s) => {
            const committed = focusTasks.find((t) => t.psrc === s.pid);
            const onToday = committed !== undefined && committed.strike && !committed.done;
            const full = focusTasks.filter((t) => t.strike && !t.done).length >= STRIKE_MAX;
            return (
              <li key={s.pid} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 0' }}>
                <button onClick={() => projectsApi.toggleSubtask(s.pid).then(refreshSubtasks)} title="Toggle done" style={{ width: 18 }}>
                  {s.done ? '✓' : '○'}
                </button>
                <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none' }}>{s.text}</span>
                {!s.done && (
                  <button
                    onClick={() => strikeSubtask(s.pid)}
                    disabled={onToday || (full && !onToday)}
                    title={onToday ? 'Already on today’s list' : 'Commit to today’s 3'}
                    style={{ fontSize: 10, opacity: onToday ? 0.7 : 1, color: onToday ? project.accent_color : undefined }}
                  >
                    {strikeFlash === s.pid ? 'DAY FULL' : onToday ? '✓ ON TODAY' : '+ STRIKE'}
                  </button>
                )}
                <button onClick={() => projectsApi.deleteSubtask(s.pid).then(refreshSubtasks)} title="Delete">✕</button>
              </li>
            );
          })}
        </ul>
        {/* Legacy's `pb` bar (6883-6899) — subtask completion again, at
            the foot of the list this time. Legacy keeps both this and
            the top strip because a card with a dozen subtasks is tall
            enough that the strip scrolls out of view while you are
            ticking things off down here. */}
        {subtasks.length > 0 && (
          <div
            title={`${subtasksDone}/${subtasks.length} subtasks done`}
            style={{ height: 4, background: 'var(--progress-track)', marginBottom: 8 }}
          >
            <div style={{ height: '100%', width: `${(subtasksDone / subtasks.length) * 100}%`, background: project.accent_color }} />
          </div>
        )}
        {addingTask && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <input
              autoFocus
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addSubtask();
                if (e.key === 'Escape') setAddingTask(false);
              }}
              placeholder="Add task…"
              style={{ flex: 1, fontSize: 12, padding: 4 }}
            />
            <button onClick={addSubtask} title="Add task">+</button>
          </div>
        )}

          </>
        )}
      </div>
    </div>
  );
}

// Panel 1 — the project cards, and nothing else. TODAY PROGRESS and the
// Deep Work Trend used to live here; both belong to panel 3 in legacy
// (the trend under the clock, the progress bar on EXECUTE), and having
// them here is what made this column read as a dashboard rather than
// the list of projects it is.
export default function ProjectDashboard({
  focusVersion,
  onFocusChanged,
  onOpenAnalysis,
  onOpenJourney,
  onSelectGoals,
  goalsProject,
  openProject,
}: {
  // Bumped by panel 3 when it writes to the focus list; see App.tsx.
  focusVersion: number;
  // Called when THIS panel writes, so panel 3 re-fetches.
  onFocusChanged: () => void;
  onOpenAnalysis: (key: ProjectKey) => void;
  onOpenJourney: (key: ProjectKey) => void;
  onSelectGoals: (key: ProjectKey) => void;
  goalsProject: ProjectKey | null;
  // Whichever project has a full-window overlay open, so the auto-timer
  // still starts for it — that behaviour moved to the shell with the
  // overlays and would otherwise have been silently dropped.
  openProject: ProjectKey | null;
}) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [focusTasks, setFocusTasks] = useState<Task[]>([]);

  const refresh = () => {
    projectsApi.order().then(setOrder);
    // Fetched once here (not per-card) so every "+ STRIKE" chip agrees
    // about which subtasks are already committed and how full today is.
    tasksApi.list('focus').then(setFocusTasks);
    // Every write in this panel goes through onChanged (= refresh), so
    // this one line tells panel 3 about all of them. No loop: this panel
    // listens to a different counter than the one it bumps.
    onFocusChanged();
  };

  useEffect(refresh, []);

  // Panel 3 struck, completed or deleted something; the "+ STRIKE" chips
  // are computed from this list, so they are now wrong until we re-read.
  useEffect(() => {
    if (focusVersion === 0) return;
    tasksApi.list('focus').then(setFocusTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusVersion]);

  useAutoTimer(openProject, order, refresh);

  return (
    <div>
      {order.map((entry) => (
        <ProjectCard
          key={entry.project.key}
          entry={entry}
          focusTasks={focusTasks}
          onChanged={refresh}
          onOpenAnalysis={onOpenAnalysis}
          onOpenJourney={onOpenJourney}
          onSelectGoals={onSelectGoals}
          goalsProject={goalsProject}
        />
      ))}
    </div>
  );
}
