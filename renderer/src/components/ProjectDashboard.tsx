import { useEffect, useRef, useState } from 'react';
import { BarChart3, Check, Flag, LayoutGrid, Pause, Play, Square, X } from 'lucide-react';
import {
  ActivityEntry,
  Journey,
  ProjectKey,
  ProjectOrderEntry,
  STRIKE_MAX,
  Subtask,
  Task,
  Win,
  journeyApi,
  planningApi,
  projectsApi,
  tasksApi,
} from '../services/api';
import { useL } from '../i18n';
import { useAutoTimer } from '../useAutoTimer';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { dayNumber, projTimeText } from '../format';
import { accentText, inkOn } from '../themes';
import { PROGRESS_TRACK_SOFT, RADIUS, SPACE } from '../spacing';


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

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// This week's Win (the weekly goal) for a project, walking the planning
// ladder: this year's outcomes -> their milestones -> wins starting this
// Monday. Only fetched for the one open card, so the chattiness of three
// levels costs a handful of requests, not dozens.
async function thisWeeksWin(key: ProjectKey): Promise<Win | null> {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const mondayIso = isoDay(monday);
  const outcomes = (await planningApi.listOutcomes(key)).filter((o) => o.year === now.getFullYear());
  const milestones = (await Promise.all(outcomes.map((o) => planningApi.listMilestones(o.id)))).flat();
  const wins = (await Promise.all(milestones.map((m) => planningApi.listWins(m.id)))).flat();
  return wins.find((w) => w.week_start_date === mondayIso) ?? null;
}

// Last seven days, oldest first: filled = met the project's daily target
// (or was marked by hand) — the same "worked" the activity strip uses.
function WeekDots({ days, color }: { days: ActivityEntry[]; color: string }) {
  const last = days.slice(-7);
  return (
    <span style={{ display: 'flex', gap: SPACE.hair }} aria-label={`${last.filter((d) => d.worked).length} of the last 7 days on target`}>
      {last.map((d) => (
        <span
          key={d.day}
          title={d.day}
          style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: d.worked ? color : 'var(--progress-track)' }}
        />
      ))}
    </span>
  );
}

function stageLabel(j: Journey | null): string {
  if (!j) return '';
  if (j.launched) return 'Launched';
  return `Stage ${j.current_stage + 1}/6`;
}

function ProjectCard({
  entry,
  focusTasks,
  onChanged,
  onOpenAnalysis,
  onOpenJourney,
  onOpenBoard,
  onSelectGoals,
}: {
  entry: ProjectOrderEntry;
  focusTasks: Task[];
  onChanged: () => void;
  onOpenAnalysis: (key: ProjectKey) => void;
  onOpenJourney: (key: ProjectKey) => void;
  onOpenBoard: (key: ProjectKey) => void;
  onSelectGoals: (key: ProjectKey) => void;
}) {
  const { number, project } = entry;
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [win, setWin] = useState<Win | null>(null);
  const L = useL();
  const [name, setName] = useState(project.name);
  const [strikeFlash, setStrikeFlash] = useState<string | null>(null);
  // Legacy defaults the heading to "QUICK NOTES" and lets it be renamed
  // per project; empty means "use the default", not "no heading".
  const [noteTitle, setNoteTitle] = useState(project.note_title);

  const key = project.key as ProjectKey;
  const noteField = useAutosave(project.note, (v: string) => projectsApi.update(key, { note: v }).then(onChanged));

  const refreshSubtasks = () => projectsApi.listSubtasks(key).then(setSubtasks);
  const refreshActivity = () => projectsApi.activity(key, 30).then(setActivity);

  useEffect(() => {
    setName(project.name);
    setNoteTitle(project.note_title);
    refreshSubtasks();
    refreshActivity();
    journeyApi.get(key).then(setJourney).catch(() => setJourney(null));
  }, [project.name, project.note, key]);

  // A task added to this project from the Capture box (Ctrl+K).
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === key) refreshSubtasks();
    };
    window.addEventListener('project-tasks-changed', onChange);
    return () => window.removeEventListener('project-tasks-changed', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // The weekly goal tile only exists on the open card.
  useEffect(() => {
    if (project.collapsed) return;
    thisWeeksWin(key).then(setWin).catch(() => setWin(null));
  }, [project.collapsed, key]);

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
    const open = () => {
      soloThis();
      onSelectGoals(key);
    };
    return (
      <div
        className="proj-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          borderRadius: RADIUS.card,
          marginBottom: SPACE.xs,
          border: `1px solid ${running ? project.accent_color : 'var(--border)'}`,
          // A running project must not look like an idle one.
          background: running ? 'var(--running-bg)' : 'var(--surface)',
          position: 'relative',
          overflow: 'hidden',
          // NOT opacity: dimming a container multiplies every colour
          // inside it, including the ones tuned to clear 4.5:1.
        }}
      >
        <button
          onClick={open}
          title="Open — collapses every other project"
          aria-label={`Open project ${number} — collapses every other project`}
          style={{
            width: 22,
            height: 22,
            flex: 'none',
            border: 'none',
            padding: 0,
            borderRadius: RADIUS.control,
            background: project.accent_color,
            // Ink chosen against THIS project's colour, not the theme's.
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
          onClick={open}
          title={project.name ? `${project.name}  ·  ${previewText}` : previewText}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text)',
            display: 'flex',
            flexDirection: 'column',
            gap: SPACE.hair,
            // The app's global button style sets align-items: flex-start,
            // which lets each line grow to its content; a pasted URL in a
            // task name then ran over the time and dots. Stretch + hidden
            // keep both lines inside the button so the ellipsis applies.
            alignItems: 'stretch',
            overflow: 'hidden',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, minWidth: 0 }}>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: accentText(project.accent_color),
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {project.name || `PROJECT ${number}`}
            </span>
            {journey && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none' }}>
                {stageLabel(journey)}
              </span>
            )}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subtasks.length === 0
              ? L('No tasks yet', 'এখনো কোনো কাজ নেই')
              : pending.length === 0
                ? L('All tasks done', 'সব কাজ শেষ')
                : `${L('Next', 'পরের')}: ${pending[0].text}`}
          </span>
        </button>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: SPACE.xs, flex: 'none' }}>
          <span
            title={`${projTimeText(project.secs_today, project.target_minutes)} today`}
            style={{
              fontSize: 12,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: running ? accentText(project.accent_color) : project.secs_today > 0 ? 'var(--text)' : 'var(--text-muted)',
            }}
          >
            {projTimeText(project.secs_today, project.target_minutes)}
          </span>
          <WeekDots days={activity} color={project.accent_color} />
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
            borderRadius: RADIUS.pill,
            border: `1.5px solid ${project.accent_color}`,
            cursor: 'pointer',
            background: running ? project.accent_color : 'transparent',
            color: running ? inkOn(project.accent_color) : accentText(project.accent_color),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {running ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
        </button>
        {/* Today against the target, as a hairline along the bottom. */}
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: PROGRESS_TRACK_SOFT }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: project.accent_color }} />
        </span>
      </div>
    );
  }

  // THE OPEN CARD, laid out the way the Projects mockup has it: the
  // header carries what the collapsed row carries (name, stage, next
  // task, time against target, start/stop), so opening a project never
  // moves the controls you already know; then where it stands (weekly
  // goal, journey), the tasks with an always-open add line, the note,
  // and the three pages that belong to it along the foot.
  const nextLine =
    subtasks.length === 0
      ? L('No tasks yet', 'এখনো কোনো কাজ নেই')
      : pending.length === 0
        ? L('All tasks done', 'সব কাজ শেষ')
        : `${L('Next', 'পরের')}: ${pending[0].text}`;
  const full = focusTasks.filter((t) => t.strike && !t.done).length >= STRIKE_MAX;
  const footBtn: React.CSSProperties = {
    flex: 1,
    height: 32,
    fontSize: 12,
    borderRadius: RADIUS.control,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  };

  return (
    <div
      className="card-elevated"
      style={{
        border: `1px solid ${project.accent_color}`,
        borderRadius: RADIUS.card,
        marginBottom: SPACE.md,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: SPACE.sm, padding: SPACE.md }}>
        <button
          onClick={() => {
            toggleCollapsed();
            onSelectGoals(key);
          }}
          title="Collapse this project"
          aria-label={`Collapse project ${number}`}
          style={{
            width: 22,
            height: 22,
            flex: 'none',
            border: 'none',
            padding: 0,
            borderRadius: RADIUS.control,
            background: project.accent_color,
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
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, minWidth: 0 }}>
            <input
              aria-label="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder={`PROJECT ${number}`}
              style={{
                // As wide as the name, so the stage sits right after it
                // (Chromium's field-sizing; Electron 33 has it).
                ...({ fieldSizing: 'content' } as React.CSSProperties),
                minWidth: 0,
                maxWidth: '100%',
                height: 24,
                padding: 0,
                fontWeight: 700,
                fontSize: 16,
                border: 'none',
                background: 'transparent',
                color: accentText(project.accent_color),
              }}
            />
            {journey && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none' }}>{stageLabel(journey)}</span>
            )}
          </span>
          <span
            title={pending[0]?.text}
            style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {nextLine}
          </span>
        </div>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: SPACE.xs, flex: 'none' }}>
          {/* Elapsed AND target — "a target you set in a different panel
              is a target you forget you set" (legacy 6759-6766). Clicking
              cycles the target through the presets. */}
          <button
            onClick={() => projectsApi.bumpTarget(key, nextProjectTarget(project.target_minutes) - project.target_minutes).then(onChanged)}
            title={`Time today / daily target — click to cycle ${PROJ_TARGETS.join('/')} min`}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              height: 'auto',
              fontSize: 12,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: running ? accentText(project.accent_color) : project.secs_today > 0 ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {projTimeText(project.secs_today, project.target_minutes)}
          </button>
          <WeekDots days={activity} color={project.accent_color} />
        </span>
        <button
          onClick={() => projectsApi.toggleTimer(key).then(onChanged)}
          title={running ? 'Stop working on this project' : 'Start working on this project'}
          aria-label={running ? 'Stop working on this project' : 'Start working on this project'}
          aria-pressed={running}
          style={{
            width: 32,
            minWidth: 32,
            height: 32,
            flex: 'none',
            borderRadius: RADIUS.pill,
            border: `2px solid ${project.accent_color}`,
            cursor: 'pointer',
            background: running ? project.accent_color : 'transparent',
            color: running ? inkOn(project.accent_color) : accentText(project.accent_color),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          {running ? <Square size={12} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        {/* Today against the target, as a line under the header. */}
        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: PROGRESS_TRACK_SOFT }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: project.accent_color }} />
        </span>
      </div>

      <div style={{ padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        {/* Where this project stands, before any detail: this week's
            goal (from the planning ladder) and the Journey stage. Each
            tile opens the place it summarises. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: SPACE.sm }}>
          <button
            onClick={() => {
              onSelectGoals(key);
              // Bring Goals to the front of panel 2 (a ritual or Health
              // may be covering it) and go to the Weekly Goal — opening
              // its add box when there is none yet.
              window.dispatchEvent(new CustomEvent('open-week-goal', { detail: key }));
            }}
            title="Open this project's weekly goal in panel 2"
            style={{
              textAlign: 'left',
              padding: SPACE.sm,
              height: 'auto',
              borderRadius: RADIUS.control,
              border: 'none',
              background: 'var(--bg)',
              color: 'var(--text)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: SPACE.xs,
              minWidth: 0,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L("This week's goal", 'এই সপ্তাহের লক্ষ্য')}</span>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {win ? win.title : L('None set — add one', 'নেই — যোগ করুন')}
            </span>
            <span style={{ height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: `${win ? win.progress : 0}%`, background: project.accent_color }} />
            </span>
          </button>
          <button
            onClick={() => onOpenJourney(key)}
            title="Open this project's Journey"
            style={{
              textAlign: 'left',
              padding: SPACE.sm,
              height: 'auto',
              borderRadius: RADIUS.control,
              border: 'none',
              background: 'var(--bg)',
              color: 'var(--text)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: SPACE.xs,
              minWidth: 0,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{L('Journey', 'যাত্রা')}</span>
            <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {journey ? (journey.launched ? L('Launched', 'লঞ্চ হয়েছে') : journey.stages[journey.current_stage]?.name) : '—'}
            </span>
            <span style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: SPACE.hair }}>
              {(journey?.stages ?? []).map((st) => (
                <span
                  key={st.stage_index}
                  style={{
                    height: 4,
                    borderRadius: RADIUS.pill,
                    background: st.done ? 'var(--success)' : st.stage_index === journey?.current_stage ? project.accent_color : PROGRESS_TRACK_SOFT,
                  }}
                />
              ))}
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>{L('TASKS', 'কাজ')}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {subtasksDone}/{subtasks.length}
            </span>
          </div>
          {subtasks.map((s) => {
            const committed = focusTasks.find((t) => t.psrc === s.pid);
            const onToday = committed !== undefined && committed.strike && !committed.done;
            return (
              <div key={s.pid} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, minHeight: 32, fontSize: 13 }}>
                <button
                  onClick={() => projectsApi.toggleSubtask(s.pid).then(refreshSubtasks)}
                  title="Toggle done"
                  aria-label={s.done ? 'Mark not done' : 'Mark done'}
                  style={{
                    width: 20,
                    height: 20,
                    padding: 0,
                    flex: 'none',
                    borderRadius: RADIUS.control,
                    border: `1.5px solid ${s.done ? project.accent_color : 'var(--text-muted)'}`,
                    background: s.done ? project.accent_color : 'transparent',
                    color: inkOn(project.accent_color),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {s.done && <Check size={13} />}
                </button>
                {/* minWidth: 0 is load-bearing: without it a pasted URL
                    refuses to shrink and drags the row past the card. */}
                <span
                  title={`${s.text} · ${dayNumber(s.added_date)}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: s.done ? 'line-through' : 'none',
                    color: s.done ? 'var(--text-muted)' : 'var(--text)',
                  }}
                >
                  {s.text}
                </span>
                {!s.done &&
                  (onToday ? (
                    <span title="On today’s three (MIT)" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: accentText(project.accent_color) }}>
                      MIT
                    </span>
                  ) : (
                    <button
                      onClick={() => strikeSubtask(s.pid)}
                      disabled={full}
                      title={full ? 'Today’s three are full' : 'Put this in today’s three (MIT)'}
                     
                      style={{ fontSize: 12, height: 24, padding: `0 ${SPACE.sm}px`, flex: 'none' }}
                    >
                      {strikeFlash === s.pid ? 'DAY FULL' : '+ MIT'}
                    </button>
                  ))}
                <button
                  onClick={() => projectsApi.deleteSubtask(s.pid).then(refreshSubtasks)}
                  title="Delete"
                  aria-label="Delete task"
                 
                  style={{ width: 24, height: 24, padding: 0, flex: 'none', border: 'none', background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <input
            aria-label="New task for this project"
            value={newSubtask}
            onChange={(e) => setNewSubtask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addSubtask();
              if (e.key === 'Escape') setNewSubtask('');
            }}
            placeholder={L('+ Add a task, Enter to save', '+ কাজ লিখুন, Enter চাপলে সেভ')}
            style={{
              height: 32,
              marginTop: SPACE.xs,
              padding: `0 ${SPACE.sm}px`,
              fontSize: 13,
              border: '1px dashed var(--border)',
              borderRadius: RADIUS.control,
              background: 'transparent',
              color: 'var(--text)',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          <input
            aria-label="Heading for this project’s note"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            onBlur={saveNoteTitle}
            placeholder={L('QUICK NOTE', 'দ্রুত নোট')}
            title="Rename this note's heading"
            style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, border: 'none', background: 'transparent', color: 'var(--text)', padding: 0, height: 24 }}
          />
          <textarea
            value={noteField.value}
            onChange={(e) => noteField.setValue(e.target.value)}
            onBlur={() => noteField.flush()}
            // Grows with what is in it: two lines at rest, up to eight.
            rows={Math.min(8, Math.max(2, noteField.value.split('\n').length))}
            placeholder={L('Jot something down…', 'কিছু লিখে রাখুন…')}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontSize: 13,
              lineHeight: 1.5,
              padding: SPACE.sm,
              resize: 'vertical',
              borderRadius: RADIUS.control,
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text)',
              overflowWrap: 'break-word',
              ...savedFlashStyle(noteField.state),
            }}
          />
        </div>

        {/* The project's three pages. Board replaced Goals here: goals
            already open in panel 2 whenever this card opens (and the
            weekly goal tile above goes straight to them), while the
            board had no way in except from old goals. */}
        <div style={{ display: 'flex', gap: SPACE.sm }}>
          <button onClick={() => onOpenBoard(key)} title="This project's tasks, each with its own QUEUED / FOCUS / CLOSED board" style={footBtn}>
            <LayoutGrid size={13} /> {L('Board', 'বোর্ড')}
          </button>
          <button onClick={() => onOpenAnalysis(key)} title="Business Analysis — idea, numbers, decision" style={footBtn}>
            <BarChart3 size={13} /> {L('Analysis', 'বিশ্লেষণ')}
          </button>
          <button onClick={() => onOpenJourney(key)} title="Product Journey — the dated record of what you tried" style={footBtn}>
            <Flag size={13} /> {L('Journey', 'যাত্রা')}
          </button>
        </div>
      </div>
    </div>
  );
}

// The one project whose timer is running, pinned above the list so it
// can be stopped without finding its row. Ticks locally once a second;
// the server's secs_today excludes the current run until it is stopped
// (engine.timer_reconciliation credits on stop), so the live figure is
// secs_today + (now - running_since).
function RunningStrip({ entry, onStop }: { entry: ProjectOrderEntry; onStop: () => void }) {
  const L = useL();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  const p = entry.project;
  const live = p.secs_today + Math.max(0, now - (p.running_since ?? now));
  const h = Math.floor(live / 3600);
  const m = Math.floor((live % 3600) / 60);
  const sec = Math.floor(live % 60);
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.sm,
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        borderRadius: RADIUS.card,
        background: p.accent_color,
        color: inkOn(p.accent_color),
        marginBottom: SPACE.sm,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: RADIUS.pill, background: 'currentColor', flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {p.name || `PROJECT ${entry.number}`}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
      </span>
      <button
        onClick={onStop}
        style={{
          height: 24,
          padding: `0 ${SPACE.sm}px`,
          fontSize: 12,
          fontWeight: 700,
          borderRadius: RADIUS.control,
          border: '1px solid currentColor',
          background: 'transparent',
          color: 'inherit',
          whiteSpace: 'nowrap',
          flex: 'none',
          cursor: 'pointer',
        }}
      >
        ■ {L('Stop', 'থামুন')}
      </button>
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
  onOpenBoard,
  onSelectGoals,
  openProject,
  onAllCollapsedChange,
}: {
  // Bumped by panel 3 when it writes to the focus list; see App.tsx.
  focusVersion: number;
  // Called when THIS panel writes, so panel 3 re-fetches.
  onFocusChanged: () => void;
  onOpenAnalysis: (key: ProjectKey) => void;
  onOpenJourney: (key: ProjectKey) => void;
  onOpenBoard: (key: ProjectKey) => void;
  onSelectGoals: (key: ProjectKey) => void;
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

  // One open project at a time. The accordion used to be optional, so a
  // saved layout can have several open; the first time this panel sees
  // that, it keeps the first open one and folds the rest (solo is the
  // same call a collapsed row's click makes).
  const [soloed, setSoloed] = useState(false);
  useEffect(() => {
    if (soloed || order.length === 0) return;
    setSoloed(true);
    const open = order.filter((e) => !e.project.collapsed);
    if (open.length > 1) projectsApi.solo(open[0].project.key as ProjectKey).then(refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, soloed]);

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

  // A project picked in EXECUTE › MIT's DEEP WORK opens here too, and
  // its goals in panel 2 — the same as opening it from this column.
  // Going back to today's list there closes whatever is open here.
  useEffect(() => {
    const onPick = (e: Event) => {
      const key = (e as CustomEvent<ProjectKey | null>).detail;
      if (key) {
        projectsApi.solo(key).then(() => {
          refresh();
          onSelectGoals(key);
        });
      } else {
        projectsApi
          .order()
          .then((o) => Promise.all(o.filter((x) => !x.project.collapsed).map((x) => projectsApi.update(x.project.key as ProjectKey, { collapsed: true }))))
          .then(refresh);
      }
    };
    window.addEventListener('select-project', onPick);
    return () => window.removeEventListener('select-project', onPick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening a project brings the column back to the top, where it now is.
  const rootRef = useRef<HTMLDivElement>(null);
  const openKey = order.find((e) => !e.project.collapsed)?.project.key ?? null;
  useEffect(() => {
    if (!openKey) return;
    let el: HTMLElement | null = rootRef.current?.parentElement ?? null;
    while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
    el?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [openKey]);

  const L = useL();
  const running = order.find((e) => e.project.running_since !== null);
  const named = order.filter((e) => e.project.name.trim());
  const totalSecs = named.reduce((n, e) => n + e.project.secs_today, 0);
  const totalTarget = named.reduce((n, e) => n + e.project.target_minutes, 0);
  const totalPct = totalTarget ? Math.min(100, Math.round((totalSecs / (totalTarget * 60)) * 100)) : 0;

  // The project you are working on moves to the top and the others
  // drop below it — on screen only: their numbers and saved order stay
  // as they are, so collapsing it puts everything back where it was.
  const openEntries = order.filter((e) => !e.project.collapsed);
  const restEntries = order.filter((e) => e.project.collapsed);

  return (
    <div ref={rootRef}>
      {order.length > 0 && (
        // Today across every named project — the first thing the column
        // answers, before any one project.
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>{L('Today', 'আজ')}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {/* The sum of targets is rarely a whole hour (375m), so it is
                spelled as hours and minutes rather than projTimeText's
                whole-hours-or-minutes rule. */}
            {projTimeText(totalSecs, 0).split(' / ')[0]} /{' '}
            {totalTarget >= 60
              ? `${Math.floor(totalTarget / 60)}h${totalTarget % 60 ? ` ${String(totalTarget % 60).padStart(2, '0')}m` : ''}`
              : `${totalTarget}m`}
          </span>
          <span style={{ flex: 1, height: 4, borderRadius: RADIUS.pill, background: PROGRESS_TRACK_SOFT, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${totalPct}%`, background: 'var(--accent)' }} />
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {L(
              `${order.filter((e) => e.project.done_today).length}/${named.length} on target`,
              `${named.length}টার ${order.filter((e) => e.project.done_today).length}টা লক্ষ্যে`
            )}
          </span>
        </div>
      )}
      {running && <RunningStrip entry={running} onStop={() => projectsApi.toggleTimer(running.project.key as ProjectKey).then(refresh)} />}
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
      {[...openEntries, ...restEntries].map((entry, i) => (
        <div key={entry.project.key}>
          {/* The open project sits on top on its own; the rest follow
              under a quiet heading, so they read as "elsewhere". */}
          {openEntries.length > 0 && i === openEntries.length && (
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)', margin: `${SPACE.lg}px 0 ${SPACE.sm}px` }}>
              {L('OTHER PROJECTS', 'অন্য প্রজেক্ট')}
            </div>
          )}
          <ProjectCard
            entry={entry}
            focusTasks={focusTasks}
            onChanged={refresh}
            onOpenAnalysis={onOpenAnalysis}
            onOpenJourney={onOpenJourney}
            onOpenBoard={onOpenBoard}
            onSelectGoals={onSelectGoals}
          />
        </div>
      ))}
    </div>
  );
}
