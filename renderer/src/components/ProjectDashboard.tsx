import { useEffect, useState } from 'react';
import {
  ActivityEntry,
  CirclePerson,
  Project,
  ProjectKey,
  ProjectOrderEntry,
  STRIKE_MAX,
  Subtask,
  Task,
  TodayProgress,
  circleApi,
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

// Matches the legacy app's _CIRCLE_CADENCES exactly.
const CADENCE_PRESETS = [1, 3, 7, 14, 30];

function nextCadence(current: number): number {
  const i = CADENCE_PRESETS.indexOf(current);
  // Falls back to the default rather than erroring when the stored
  // value isn't one of the presets (matches legacy's own fallback).
  return i === -1 ? 7 : CADENCE_PRESETS[(i + 1) % CADENCE_PRESETS.length];
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
  const [people, setPeople] = useState<CirclePerson[]>([]);
  const [newPerson, setNewPerson] = useState('');
  const [name, setName] = useState(project.name);
  const [strikeFlash, setStrikeFlash] = useState<string | null>(null);

  const key = project.key as ProjectKey;
  const noteField = useAutosave(project.note, (v: string) => projectsApi.update(key, { note: v }).then(onChanged));

  const refreshSubtasks = () => projectsApi.listSubtasks(key).then(setSubtasks);
  const refreshActivity = () => projectsApi.activity(key, 30).then(setActivity);
  const refreshPeople = () => circleApi.list(key).then(setPeople);

  useEffect(() => {
    setName(project.name);
    refreshSubtasks();
    refreshActivity();
    refreshPeople();
  }, [project.name, project.note, key]);

  const saveName = () => {
    if (name !== project.name) projectsApi.update(key, { name }).then(onChanged);
  };

  const strikeSubtask = (pid: string) => {
    projectsApi
      .strikeSubtask(pid)
      .then(() => onChanged())
      .catch(() => {
        setStrikeFlash(pid);
        setTimeout(() => setStrikeFlash(null), 1500);
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

  const addPerson = () => {
    const nm = newPerson.trim();
    if (!nm) return;
    circleApi.add(key, nm).then(() => {
      setNewPerson('');
      refreshPeople();
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
          <button onClick={() => projectsApi.toggleTimer(key).then(onChanged)} title="Start/stop timer">
            {running ? '⏸' : '▶'}
          </button>
          {/* Legacy's Goals | Analysis | Journey row (6799-6814). "Goals"
              points PANEL 2 at this project and shows as active while it
              is doing so — without that state the same three headings in
              the middle column would silently mean six different things
              depending on which card you last pressed. Analysis and
              Journey open over the whole window instead, as legacy opens
              them in their own windows. */}
          <button
            onClick={() => onSelectGoals(key)}
            aria-pressed={goalsProject === key}
            title="Show this project's goals in the middle panel"
            style={{
              fontSize: 11,
              fontWeight: goalsProject === key ? 'bold' : 'normal',
              background: goalsProject === key ? 'var(--accent-light)' : undefined,
            }}
          >
            Goals
          </button>
          <button onClick={() => onOpenAnalysis(key)} style={{ fontSize: 11 }}>
            Analysis
          </button>
          <button onClick={() => onOpenJourney(key)} style={{ fontSize: 11 }}>
            Journey
          </button>
        </div>

        {project.collapsed ? (
          <div onClick={toggleCollapsed} style={{ fontSize: 11, opacity: 0.7, cursor: 'pointer', padding: '2px 0' }}>
            {previewText}
          </div>
        ) : (
          <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: project.accent_color }} />
          </div>
          <span>
            {formatSecs(project.secs_today)} /{' '}
            <button
              onClick={() =>
                projectsApi
                  .bumpTarget(key, nextProjectTarget(project.target_minutes) - project.target_minutes)
                  .then(onChanged)
              }
              title={`Daily target — click to cycle ${PROJ_TARGETS.join('/')} min`}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline dotted',
              }}
            >
              {project.target_minutes}m
            </button>
          </span>
          <button onClick={() => projectsApi.bumpTarget(key, -15).then(onChanged)} title="Decrease daily target">−</button>
          <button onClick={() => projectsApi.bumpTarget(key, 15).then(onChanged)} title="Increase daily target">+</button>
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
          {activity.map((a) => (
            <div
              key={a.day}
              title={`${a.day} — ${formatSecs(a.secs)}`}
              onClick={() => projectsApi.mark(key, a.day, !a.worked).then(refreshActivity)}
              style={{
                width: 7,
                height: 14,
                background: a.worked ? project.accent_color : 'var(--border)',
                cursor: 'pointer',
              }}
            />
          ))}
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
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          <input
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
            placeholder="Add subtask…"
            style={{ flex: 1, fontSize: 12, padding: 4 }}
          />
          <button onClick={addSubtask} title="Add subtask">+</button>
        </div>

        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>QUICK NOTES</div>
        <textarea
          value={noteField.value}
          onChange={(e) => noteField.setValue(e.target.value)}
          onBlur={noteField.flush}
          rows={3}
          placeholder="Jot something down…"
          style={{ width: '100%', fontSize: 12, padding: 6, marginBottom: 10, resize: 'vertical', boxSizing: 'border-box', ...savedFlashStyle(noteField.state) }}
        />

        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>CIRCLE</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {people.map((p) => (
            <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: p.overdue ? 'var(--danger)' : 'var(--success)' }} />
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ opacity: 0.6 }}>{p.gap_days === null ? 'never' : `${p.gap_days}d ago`}</span>
              <button
                onClick={() => circleApi.update(p.id, { cadence_days: nextCadence(p.cadence_days) }).then(refreshPeople)}
                title="How often you want to be in touch — click to change"
                style={{ fontSize: 11, opacity: 0.8 }}
              >
                every {p.cadence_days}d
              </button>
              <button onClick={() => circleApi.markContacted(p.id).then(refreshPeople)} title="Mark contacted today">✓</button>
              <button onClick={() => circleApi.remove(p.id).then(refreshPeople)} title="Remove">✕</button>
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <input
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPerson()}
            placeholder="Add person…"
            style={{ flex: 1, fontSize: 12, padding: 4 }}
          />
          <button onClick={addPerson} title="Add person">+</button>
        </div>
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
  onOpenAnalysis,
  onOpenJourney,
  onSelectGoals,
  goalsProject,
  openProject,
}: {
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
  };

  useEffect(refresh, []);
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
