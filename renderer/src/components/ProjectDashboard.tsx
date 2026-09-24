import { useEffect, useState } from 'react';
import { Check, Pause, Pencil, Play, Square, X } from 'lucide-react';
import {
  ActivityEntry,
  ProjectKey,
  ProjectOrderEntry,
  STRIKE_MAX,
  Subtask,
  Task,
  projectsApi,
  tasksApi,
} from '../services/api';
import { useAutoTimer } from '../useAutoTimer';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { useAutofocus } from '../hooks/useAutofocus';
import { dayNumber, elapsedText, projTimeText } from '../format';
import { accentText, inkOn } from '../themes';
import { RADIUS } from '../spacing';


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
  const [, setActivity] = useState<ActivityEntry[]>([]);
  const [name, setName] = useState(project.name);
  const [strikeFlash, setStrikeFlash] = useState<string | null>(null);
  // Legacy defaults the heading to "QUICK NOTES" and lets it be renamed
  // per project; empty means "use the default", not "no heading".
  const [noteTitle, setNoteTitle] = useState(project.note_title);
  const [editingNote, setEditingNote] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const noteFieldRef = useAutofocus<HTMLTextAreaElement>(editingNote);
  const newSubtaskRef = useAutofocus<HTMLInputElement>(addingTask);

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
  const previewBits = [projTimeText(project.secs_today, project.target_minutes)];
  if (subtasks.length > 0) previewBits.push(`${subtasks.length - pending.length}/${subtasks.length}`);
  const previewTail =
    subtasks.length === 0
      ? ''
      : pending.length === 0
        ? '✓ all tasks done'
        : `→ ${pending[0].text}${pending.length > 1 ? `  (+${pending.length - 1} more)` : ''}`;
  const previewText = [previewBits.join('   ·   '), previewTail].filter(Boolean).join('   ·   ');

  // COLLAPSED IS A ROW NOW, not a shrunken card.
  //
  // It used to keep the card's chrome — a 10px progress strip, a bordered
  // box, the number badge, the title as an editable input — and add one
  // muted line of preview underneath, for about 70px per project. That
  // is a card pretending to be collapsed.
  //
  // A row is a row: the number, the name, today's time against its
  // target, the task count and a start button. Those last three are the
  // facts you scan the column FOR, and they were previously invisible
  // unless a card happened to be open, so you could not compare two
  // projects without expanding both — at which point neither fitted.
  if (project.collapsed) {
    return (
      <div
        className="proj-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          borderRadius: RADIUS.card,
          marginBottom: 2,
          border: '1px solid transparent',
          // A running project must not look like an idle one. It used to.
          background: running ? 'var(--running-bg)' : 'transparent',
          // NOT opacity. Dimming a container multiplies EVERY colour
          // inside it, including the ones the palette was tuned to clear
          // 4.5:1 — axe caught a project's own accent at 0.7 over white
          // measuring 3.81:1, and this project's own auditor could not
          // see it because it reads declared colours, not composited
          // ones. "Done today" is the ✓ on the number chip instead; the
          // text stays readable, which is the point of still showing it.
        }}
      >
        <button
          onClick={() => {
            soloThis();
            onSelectGoals(key);
          }}
          title="Open — collapses every other project"
          aria-label={`Open project ${number} — collapses every other project`}
          style={{
            width: 20,
            height: 20,
            flex: 'none',
            border: 'none',
            padding: 0,
            borderRadius: RADIUS.control,
            background: project.accent_color,
            // Ink chosen against THIS project's colour, not the theme's
            // accent: --on-accent is right for the theme accent and
            // wrong for six user-set ones. The purple chip measured
            // 2.57:1 before this.
            color: inkOn(project.accent_color),
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {project.done_today ? <Check size={13} /> : number}
        </button>
        <button
          onClick={() => {
            soloThis();
            onSelectGoals(key);
          }}
          // The name is what ellipsis clips here, so the name is what
          // the hover has to restore — previewText alone (used to be
          // the whole title) tells you the status of a project whose
          // own name you can no longer read.
          title={project.name ? `${project.name}  ·  ${previewText}` : previewText}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: 13,
            padding: 0,
            height: 24,
            cursor: 'pointer',
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {project.name || `PROJECT ${number}`}
        </button>
        <span
          title={`${projTimeText(project.secs_today, project.target_minutes)} today`}
          style={{ width: 44, height: 5, background: 'var(--progress-track)', borderRadius: RADIUS.pill, flex: 'none', overflow: 'hidden' }}
        >
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: project.accent_color }} />
        </span>
        <span
          style={{
            width: 44,
            textAlign: 'right',
            flex: 'none',
            fontSize: 12,
            fontFamily: 'monospace',
            color: running ? accentText(project.accent_color) : 'var(--text-faint)',
            fontWeight: running ? 700 : 400,
          }}
        >
          {elapsedText(project.secs_today)}
        </span>
        <span style={{ width: 30, textAlign: 'right', flex: 'none', fontSize: 12, color: 'var(--text-faint)' }}>
          {subtasks.length > 0 ? `${subtasksDone}/${subtasks.length}` : '—'}
        </span>
        <button
          onClick={() => projectsApi.toggleTimer(key).then(onChanged)}
          title={running ? 'Stop working on this project' : 'Start working on this project'}
          aria-label={running ? 'Stop working on this project' : 'Start working on this project'}
          style={{
            width: 28,
            minWidth: 28,
            height: 28,
            flex: 'none',
            borderRadius: RADIUS.control,
            border: 'none',
            cursor: 'pointer',
            background: running ? project.accent_color : 'transparent',
            color: running ? inkOn(project.accent_color) : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {running ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
      </div>
    );
  }

  return (
    <div
      className="card-elevated"
      style={{
        border: `1px solid ${project.accent_color}55`,
        borderRadius: RADIUS.card,
        marginBottom: 12,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        // See the collapsed row: a dimmed card dims its text too.
      }}
    >
      {/* The 10px top strip is gone. Legacy keeps one because its
          collapsed card had no other progress indicator; this port's
          collapsed ROW carries its own bar and count, so the strip was
          the third representation of subtask completion on one card —
          strip, foot bar, and the "0/1" in the TASKS heading. The foot
          bar survives, for legacy's stated reason: on a card with a
          dozen subtasks the top of the card has scrolled away by the
          time you are ticking things off at the bottom. */}
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => {
              toggleCollapsed();
              onSelectGoals(key);
            }}
            onDoubleClick={soloThis}
            title="Click to collapse · double-click to solo this project"
            aria-label={`Collapse project ${number}`}
            style={{
              width: 22,
              height: 22,
              border: 'none',
              padding: 0,
              borderRadius: RADIUS.control,
              background: project.accent_color,
              color: inkOn(project.accent_color),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {project.done_today ? <Check size={13} /> : number}
          </button>
          <input
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder={`PROJECT ${number}`}
            style={{ flex: 1, height: 24, fontWeight: 700, fontSize: 16, border: 'none', background: 'transparent', color: accentText(project.accent_color) }}
          />
          <button
            onClick={toggleCollapsed}
            title="Collapse"
            style={{ width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            ⌃
          </button>
          {/* Nothing else on this row. Legacy is explicit about why
              (6713-6719): the buttons used to sit here, and sharing the
              row with a fixed-width cluster "clipped longer project
              names". It did here too — "SHIP SPARE EXPORT CAN GENER…".
              The title owns its row; the buttons moved down. */}
        </div>

        {/* Notes first. Legacy puts them directly under the header
            (6634-6696, body row 1) and the timer row below them — the
            note is what the card is for on a planning screen, and
            burying it under the task list is what made these cards so
            tall that only two fit on screen. */}
        {/* The note is TEXT until you edit it.
            Measured with all six projects open: 504px of note boxes, of
            which four of six were empty — a fixed five-row textarea per
            card whether or not there was anything in it. A note is read
            far more often than it is written, so at rest it is the words
            themselves, sized to what you actually wrote. */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <input
            aria-label="Heading for this project’s note"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            onBlur={saveNoteTitle}
            placeholder="QUICK NOTES"
            title="Rename this note — legacy keeps a per-project heading"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              letterSpacing: 0.5,
              border: 'none',
              background: 'transparent',
              color: accentText(project.accent_color),
              padding: '0',
              height: 24,
            }}
          />
          {noteField.value.trim() && !editingNote && (
            <button
              onClick={() => setEditingNote(true)}
              title="Edit this note"
              style={{
                border: 'none',
                background: 'transparent',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                padding: '0 8px',
                height: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Pencil size={12} /> edit
            </button>
          )}
        </div>

        {editingNote || !noteField.value.trim() ? (
          <textarea
            ref={noteFieldRef}
            value={noteField.value}
            onChange={(e) => noteField.setValue(e.target.value)}
            onBlur={() => {
              noteField.flush();
              setEditingNote(false);
            }}
            // Grows with what is in it, from one line, instead of
            // reserving five rows for a note that is usually two.
            rows={Math.min(8, Math.max(1, noteField.value.split('\n').length))}
            placeholder="Jot something down…"
            style={{ width: '100%', fontSize: 12, padding: 8, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box', ...savedFlashStyle(noteField.state) }}
          />
        ) : (
          <div
            onClick={() => setEditingNote(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditingNote(true);
              }
            }}
            title="Click to edit"
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--text-muted)',
              whiteSpace: 'pre-line',
              // A note is free text, so it wraps rather than ellipsizes
              // — but pre-line alone only handles the newlines the user
              // typed; a pasted URL has none, and without this it stays
              // one unbroken "word" wider than the card (measured at
              // 1938px in a 400px column) instead of breaking onto the
              // next line the way every other long word already does.
              overflowWrap: 'break-word',
              cursor: 'text',
              marginBottom: 8,
            }}
          >
            {noteField.value}
          </div>
        )}

        {/* Legacy's _actrow (6714-6829), which is a two-sided row and not
            a progress bar: the timer box on the LEFT, the three page
            links on the RIGHT. It sits under the notes because legacy
            moved it out of the header — see the note up there.

            The fill line is short and above the timer, not a full-width
            bar across the row (6725-6727, width=118). It is the "this
            one is running" signal for the button directly beneath it, so
            it is scoped to that button rather than to the whole card. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12, fontSize: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ width: 118, height: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 4 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: project.accent_color }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => projectsApi.toggleTimer(key).then(onChanged)}
                title="Start / stop working on this project"
                aria-label={running ? 'Stop working on this project' : 'Start working on this project'}
                aria-pressed={running}
                style={{
                  background: running ? project.accent_color : 'transparent',
                  color: running ? inkOn(project.accent_color) : accentText(project.accent_color),
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 8px',
                  height: 28,
                  // Real icons fixed at one size make the old glyph-width
                  // problem (⏸ narrower than ▶ in most faces, shrinking
                  // the button below its minimum right when the timer
                  // starts) moot — both render in the same fixed box now.
                  minWidth: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {running ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
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
                  color: running ? accentText(project.accent_color) : 'inherit',
                  font: 'inherit',
                  padding: '0 4px',
                  height: 24,
                  cursor: 'pointer',
                  opacity: running ? 1 : 0.75,
                }}
              >
                {projTimeText(project.secs_today, project.target_minutes)}
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
                fontSize: 12,
                background: goalsProject === key ? project.accent_color : 'transparent',
                color: goalsProject === key ? inkOn(project.accent_color) : undefined,
                border: 'none',
                cursor: 'pointer',
                padding: '0 8px',
                height: 24,
              }}
            >
              Goals
            </button>
            <button
              onClick={() => onOpenAnalysis(key)}
              title="Business Analysis — idea, numbers, decision"
              style={{ fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 8px', height: 24 }}
            >
              Analysis
            </button>
            <button
              onClick={() => onOpenJourney(key)}
              title="Product Journey — the dated record of what you tried"
              style={{ fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 8px', height: 24 }}
            >
              Journey
            </button>
          </div>
        </div>

        {/* Legacy's TASKS header row: label, done-count, "+ task"
            (6848-6862). The add field lives behind that button rather
            than sitting open on every card — six always-visible inputs
            is most of why this column scrolled. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: 'var(--text-faint)', letterSpacing: 0.5 }}>TASKS</span>
          <span style={{ flex: 1 }} />
          {/* Muted, not dimmed. --text-muted is chosen to clear 4.5:1
              on the card surface; multiplying it by 0.6 measured 4.4:1
              and 4.5:1 on two light themes — a rule failed by a hair is
              still failed, and the dimming bought nothing the colour was
              not already saying. */}
          <span style={{ color: 'var(--text-muted)' }}>
            {subtasksDone}/{subtasks.length}
          </span>
          <button
            onClick={() => setAddingTask((v) => !v)}
            title="Add a task to this project"
            style={{ fontSize: 12, height: 24, padding: '0 8px' }}
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
              <li
                key={s.pid}
                style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}
              >
                {/* Legacy gives every task row a 3px strip in the
                    project's colour, going muted once it is done
                    (6999-7002). It is what makes a list of tasks read as
                    belonging to the card above it. */}
                <span
                  style={{
                    width: 3,
                    alignSelf: 'stretch',
                    minHeight: 16,
                    background: s.done ? 'var(--border)' : project.accent_color,
                  }}
                />
                <button
                  onClick={() => projectsApi.toggleSubtask(s.pid).then(refreshSubtasks)}
                  title="Toggle done"
                  aria-label={s.done ? 'Mark not done' : 'Mark done'}
                  style={{ width: 24, height: 24, padding: 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {/* A box, not a circle — legacy uses a real checkbox
                      here, and the STRIKE rows in panel 3 already use
                      □/✓. One tick idiom across the app. */}
                  {s.done ? <Check size={15} /> : <Square size={15} />}
                </button>
                {/* minWidth: 0 is load-bearing. A flex item defaults to
                    min-width: auto — its own content's width as a floor —
                    and an unbroken string like a pasted URL has no space
                    to wrap on, so without this the task name refuses to
                    shrink and drags the whole row (measured at 1880px in
                    a 400px column) past its container instead of eliding. */}
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: s.done ? 'line-through' : 'none',
                  }}
                  title={s.text}
                >
                  {s.text}
                </span>
                {/* How long this has been open. Muted, not red: legacy
                    had it hard-coded in the same colour the app uses for
                    risk and delete-hover, and "DAY 37" is a neutral fact
                    that does not get more alarming as it grows. */}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {dayNumber(s.added_date)}
                </span>
                {!s.done && (
                  <button
                    onClick={() => strikeSubtask(s.pid)}
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
                      color: onToday ? accentText(project.accent_color) : undefined,
                    }}
                  >
                    {strikeFlash === s.pid ? 'DAY FULL' : onToday ? <><Check size={12} /> ON TODAY</> : '+ STRIKE'}
                  </button>
                )}
                <button
                  onClick={() => projectsApi.deleteSubtask(s.pid).then(refreshSubtasks)}
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
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            <input
              ref={newSubtaskRef}
              aria-label="New task for this project"
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
  onAllCollapsedChange,
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
  // Told every time the collapsed/expanded state of the project list
  // changes, so panel 2 can fall back to the Life Plan headline view
  // when every project is collapsed. See App.tsx's allProjectsCollapsed.
  onAllCollapsedChange: (allCollapsed: boolean) => void;
}) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [focusTasks, setFocusTasks] = useState<Task[]>([]);
  // Without this, a failed initial load left `order` at its empty
  // default with nothing catching the rejection — the panel rendered as
  // an empty div, indistinguishable from "you have no projects" (ui-ux-
  // audit verify pass, 2026-09-22).
  const [loadError, setLoadError] = useState(false);

  const refresh = () => {
    projectsApi.order().then(setOrder).catch(() => setLoadError(true));
    // Fetched once here (not per-card) so every "+ STRIKE" chip agrees
    // about which subtasks are already committed and how full today is.
    tasksApi.list('focus').then(setFocusTasks).catch(() => setLoadError(true));
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
  }, [focusVersion]);

  // Tells panel 2 whenever every project's collapsed state changes, so it
  // can switch to the Life Plan headline view when all are collapsed.
  useEffect(() => {
    if (order.length === 0) return;
    onAllCollapsedChange(order.every((e) => e.project.collapsed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  useAutoTimer(openProject, order, refresh);

  return (
    <div>
      {loadError && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--danger)',
            background: 'var(--surface)',
            border: '1px solid var(--danger)',
            borderRadius: RADIUS.control,
            padding: '8px 12px',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          Couldn't load projects — check the app is connected.
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => { setLoadError(false); refresh(); }}>
            Retry
          </button>
        </div>
      )}
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
