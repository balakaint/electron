import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, CalendarRange, Check, ChevronUp, Circle, Square, Target, X } from 'lucide-react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { useAutoTimer } from '../useAutoTimer';
import { accentText } from '../themes';
import {
  ChecklistItem,
  GoalHorizon,
  GoalOwnerKey,
  GoalPanel,
  Milestone,
  Outcome,
  ProjectKey,
  ProjectOrderEntry,
  Win,
  goalsApi,
  planningApi,
  projectsApi,
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
// renaming the keys or reordering this array. `legacyHorizon` is the
// OLD stored `Goal.horizon` value this level replaced — it is kept
// ONLY because the panel-level section-title override
// (goalsApi.getPanel/setSectionTitle) still lives on
// `Project.sec_title_yearly/_monthly/_weekly`, unchanged by this
// migration (those columns store a display override, not Goal data —
// orthogonal to the Outcome/Milestone/Win schema change, so there was
// no reason to touch them). Swapping `legacyHorizon`'s mapping would
// silently move an existing custom section title to the wrong level.
//
// These are DEFAULTS. Each heading is editable and the custom title is
// stored per legacyHorizon, so `sectionTitle[key] || label` means anyone
// who has already renamed a section keeps their name.
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
// Icons match Panel3's own WEEKLY/MONTHLY/YEARLY accordion icons
// (Panel3.tsx's HOURS_LEVELS) by DISPLAYED meaning, not stored key — the
// same crossing above applies here, so "WEEKLY GOAL" (level `win`) gets
// the same CalendarDays glyph Panel3's WEEKLY section uses, and so on.
type PlanningLevel = 'outcome' | 'milestone' | 'win';

const LEVELS: { key: PlanningLevel; legacyHorizon: GoalHorizon; label: string; glyph: ReactNode; accent: string; weight: number }[] = [
  { key: 'win', legacyHorizon: 'yearly', label: 'WEEKLY GOAL', glyph: <CalendarDays size={14} />, accent: 'var(--goal-yearly)', weight: 50 },
  { key: 'milestone', legacyHorizon: 'monthly', label: 'MONTHLY GOAL', glyph: <CalendarRange size={14} />, accent: 'var(--goal-monthly)', weight: 30 },
  { key: 'outcome', legacyHorizon: 'weekly', label: 'YEARLY GOAL', glyph: <Target size={14} />, accent: 'var(--goal-weekly)', weight: 20 },
];

function mondayOf(d: Date): string {
  const copy = new Date(d);
  const offset = (d.getDay() + 6) % 7;
  copy.setDate(d.getDate() - offset);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`;
}

// Any of the three node types this panel edits — narrowed by `level`
// wherever the shape actually differs (parent id, week_start_date).
type PlanningNode = Outcome | Milestone | Win;

// Which of ChecklistItemCreate's three optional parent fields this
// level's nodes attach to — engine-enforced to be exactly one (see
// engine.planning.add_checklist_item).
function checklistScope(level: PlanningLevel, id: number) {
  if (level === 'outcome') return { outcomeId: id };
  if (level === 'milestone') return { milestoneId: id };
  return { winId: id };
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
// state is the one to optimise. A goal at rest is a tick, its name and a
// progress spark. Opening it is what reveals the editor, and only one is
// open at a time.
function PlanningNodeRow({
  node,
  level,
  accent,
  open,
  onOpen,
  onClose,
  onToggle,
  onDelete,
  onEditText,
  onOpenBoard,
}: {
  node: PlanningNode;
  level: PlanningLevel;
  accent: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onEditText: (text: string) => void;
  onOpenBoard: (legacyGoalId: number) => void;
}) {
  const [text, setText] = useState(node.title);
  const textInputRef = useAutofocus<HTMLInputElement>(open);

  const [tasks, setTasks] = useState<ChecklistItem[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const tasksBlockRef = useRef<HTMLDivElement>(null);
  const newTaskRef = useAutofocus<HTMLInputElement>(addingTask);

  const scope = checklistScope(level, node.id);
  const refreshTasks = () => planningApi.listChecklistItems(scope).then(setTasks);

  useEffect(() => setText(node.title), [node.title]);
  // Fetched regardless of open/collapsed — the collapsed row's own
  // tooltip surfaces the first pending task, same as ProjectCard's
  // collapsed preview needing subtasks whether or not the card is open.
  useEffect(() => {
    refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const addTask = () => {
    const t = newTaskText.trim();
    if (!t) return;
    planningApi.addChecklistItem(t, scope).then(() => {
      setNewTaskText('');
      refreshTasks();
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

  // `node.progress` is already resolved server-side (see
  // engine.planning's winProgress/milestoneProgress/outcomeProgress) —
  // this row never derives it itself.
  const pct = node.progress;
  const achieved = node.status === 'achieved';
  const barColor = achieved ? 'var(--success)' : accent;
  const dayLabel = `${node.progress}%`;
  const barTitle = `${node.progress}% complete`;

  const tick = (
    <button
      onClick={onToggle}
      title={achieved ? 'Mark not achieved' : 'Mark achieved'}
      aria-pressed={achieved}
      style={{
        width: 24,
        height: 24,
        flex: 'none',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: achieved ? 'var(--success)' : 'var(--text-faint)',
        transition: 'color 0.12s ease-out',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {achieved ? <Check size={15} /> : <Circle size={15} />}
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
      title="Delete"
      aria-label="Delete"
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
        id={`node-${node.id}`}
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
          title={pendingTasks.length > 0 ? `${node.title}  ·  → ${pendingTasks[0].text}` : 'Open this'}
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
            color: achieved ? 'var(--text-faint)' : 'var(--text)',
            textDecoration: achieved ? 'line-through' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.title}
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
      id={`node-${node.id}`}
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
          onBlur={() => text.trim() && text !== node.title && onEditText(text.trim())}
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span
            style={{ width: 72, flex: 'none', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}
          >
            PROGRESS
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
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
              <span style={{ fontSize: 12, color: 'var(--text-faint)', flex: 'none' }}>{Math.round(pct)}%</span>
              {/* Board (Phase B) isn't remapped to this hierarchy yet —
                  only nodes forward-copied from an old Goal
                  (legacy_goal_id set) can still open their Board. A
                  node created after this migration ships has no Board
                  to open, honestly labeled rather than silently hidden
                  or pointing at nothing. */}
              {node.legacy_goal_id != null ? (
                <button
                  onClick={() => onOpenBoard(node.legacy_goal_id as number)}
                  title="Break this into tasks, each with its own board"
                  className="btn-primary"
                  style={{ fontSize: 12, padding: '4px 8px', flex: 'none' }}
                >
                  → BOARD
                </button>
              ) : (
                <span title="Board support for new goals ships in a later update" style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  BOARD (soon)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TASKS — a plain, unscheduled checklist (ChecklistItem), same
          add/check/remove shape as the old GoalTask block it replaces. */}
      <div ref={tasksBlockRef} style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: 'var(--text-faint)', letterSpacing: 0.5 }}>TASKS</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--text-muted)' }}>
            {tasksDone}/{tasks.length}
          </span>
          <button
            onClick={() => setAddingTask((v) => !v)}
            title="Add a task"
            style={{ fontSize: 12, height: 24, padding: '0 8px' }}
          >
            + task
          </button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}>
          {tasks.map((t) => (
            <li key={t.pid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
              <span style={{ width: 3, alignSelf: 'stretch', minHeight: 16, background: t.done ? 'var(--border)' : accent }} />
              <button
                onClick={() => planningApi.toggleChecklistItem(t.pid).then(refreshTasks)}
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
              <button
                onClick={() => planningApi.removeChecklistItem(t.pid).then(refreshTasks)}
                title="Delete"
                aria-label="Delete task"
                style={{ width: 28, height: 28, padding: 0, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={15} />
              </button>
            </li>
          ))}
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
              aria-label="New task"
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
    </div>
  );
}

function PlanningLevelSection({
  level,
  label,
  defaultLabel,
  glyph,
  weight,
  accent,
  nodes,
  parentOptions,
  openId,
  onOpenChange,
  onAdd,
  onToggle,
  onDelete,
  onEditText,
  onRenameTitle,
  onOpenBoard,
}: {
  level: PlanningLevel;
  label: string;
  defaultLabel: string;
  glyph: ReactNode;
  weight: number;
  accent: string;
  nodes: PlanningNode[];
  // Populated for 'milestone' (its Outcomes) and 'win' (its Milestones)
  // — 'outcome' has no parent, this stays empty for it.
  parentOptions: { id: number; title: string }[];
  openId: number | null;
  onOpenChange: (id: number | null) => void;
  onAdd: (text: string, parentId: number | null) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEditText: (id: number, text: string) => void;
  onRenameTitle: (title: string) => void;
  onOpenBoard: (legacyGoalId: number) => void;
}) {
  const [title, setTitle] = useState(label);
  const [composing, setComposing] = useState(false);
  const [newText, setNewText] = useState('');
  const newTextInputRef = useAutofocus<HTMLInputElement>(composing);
  const [newParentId, setNewParentId] = useState<number | null>(null);

  useEffect(() => setTitle(label), [label]);
  // Defaults to the owner's only option when there's exactly one —
  // matches the design spec's parent-picker default. Re-runs whenever
  // the option list changes (a new Outcome just added, the composer
  // just opened) so the select isn't left pointing at nothing.
  useEffect(() => {
    if (parentOptions.length === 1) setNewParentId(parentOptions[0].id);
    else if (newParentId !== null && !parentOptions.some((p) => p.id === newParentId)) setNewParentId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentOptions]);

  const done = nodes.filter((n) => n.status === 'achieved').length;
  const openCount = nodes.length - done;
  const needsParent = level !== 'outcome';
  const canCompose = !needsParent || parentOptions.length > 0;
  // milestone's parent level is outcome, win's parent level is
  // milestone — used only for the disabled-composer hint copy below.
  const parentLevelLabel = level === 'milestone' ? 'yearly goal' : level === 'win' ? 'monthly goal' : '';

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newText.trim();
    if (!t) return;
    if (needsParent && newParentId === null) return;
    onAdd(t, needsParent ? newParentId : null);
    setNewText('');
    // Stays open: adding one is usually adding three.
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
    // EXCEPT when a section is genuinely empty (no nodes, not mid-add):
    // its proportional share was still reserved in full, so a low-count
    // project could leave ~500px of blank space below "Nothing here
    // yet" (Zahid's UX audit, 2026-09-20). An empty section shrinks to
    // its own content instead — the freed space goes to whichever
    // section(s) still have real content, via their own unchanged
    // weights.
    <div
      style={{
        flex: nodes.length === 0 && !composing ? '0 0 auto' : `${weight} 1 0`,
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
        <span style={{ color: accent, display: 'flex', alignItems: 'center' }}>{glyph}</span>
        <input
          aria-label="Section heading"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          // BUG THIS FIXES: this fired on EVERY blur, so merely clicking
          // into a heading and out again persisted whatever it happened
          // to be showing — including the default. So: persist only a
          // real change, and treat "typed the default back in" as
          // clearing the override rather than as a custom title that
          // happens to match.
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
          {done}/{nodes.length}
          {openCount > 0 && nodes.length > 0 ? ` · ${openCount} open` : ''}
        </span>
        <button
          onClick={() => setComposing((v) => !v)}
          aria-expanded={composing}
          disabled={!canCompose}
          title={canCompose ? `Add a ${label.toLowerCase()}` : `Add a ${parentLevelLabel} first`}
          style={{
            width: 24,
            height: 24,
            flex: 'none',
            border: 'none',
            background: composing ? 'var(--accent-light)' : 'transparent',
            borderRadius: RADIUS.control,
            color: !canCompose ? 'var(--text-faint)' : composing ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 16,
            lineHeight: 1,
            cursor: canCompose ? 'pointer' : 'not-allowed',
            padding: 0,
          }}
        >
          +
        </button>
      </div>

      {composing && canCompose && (
        <form onSubmit={submitAdd} style={{ display: 'flex', gap: 4, margin: '4px 0 4px', flexWrap: 'wrap' }}>
          <input
            ref={newTextInputRef}
            value={newText}
            aria-label="New goal"
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setComposing(false)}
            placeholder="What are you aiming at?"
            style={{ flex: 1, fontSize: 12, padding: 4, minWidth: 120 }}
          />
          {needsParent && (
            <select
              aria-label="Parent"
              value={newParentId ?? ''}
              onChange={(e) => setNewParentId(e.target.value ? Number(e.target.value) : null)}
              style={{ fontSize: 12, padding: 4 }}
            >
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <button type="submit" style={{ fontSize: 12 }}>
            Add
          </button>
        </form>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {nodes.length === 0 && !composing && (
          // One muted line. Three stacked illustrated empty states was
          // the app apologising three times on a panel that is empty
          // only until you have used it once.
          <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 4px' }}>
            {canCompose ? (
              <>
                Nothing here yet — <span style={{ color: 'var(--accent)' }}>+</span> to add one.
              </>
            ) : (
              `Add a ${parentLevelLabel} first, then a ${label.toLowerCase()} can attach to it.`
            )}
          </div>
        )}
        {nodes.map((n) => (
          <PlanningNodeRow
            key={n.id}
            node={n}
            level={level}
            accent={accent}
            open={openId === n.id}
            onOpen={() => onOpenChange(n.id)}
            onClose={() => onOpenChange(null)}
            onToggle={() => onToggle(n.id)}
            onDelete={() => onDelete(n.id)}
            onEditText={(text) => onEditText(n.id, text)}
            onOpenBoard={onOpenBoard}
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
  jumpToGoal,
}: {
  // The reserved "life" key (App.tsx passes it whenever every real
  // project in panel 1 is collapsed) renders this exact same component —
  // same sections, same editing, same CRUD — with only the header
  // changed to "LIFE PLAN" instead of a project name. See GoalOwnerKey's
  // own comment in services/api.ts.
  projectKey: GoalOwnerKey | null;
  // Fires when a node's "→ BOARD" button is pressed, carrying its
  // legacy_goal_id (only migrated nodes have one — see PlanningNodeRow's
  // own conditional). App.tsx wires this to open the full-window
  // Goal -> Task -> Board overlay — unchanged, Board is still keyed off
  // the old Goal id until Phase B remaps it.
  onOpenBoard: (goalId: number) => void;
  // Kept for prop-signature compatibility with App.tsx — the STRIKE
  // wiring these used to drive (Goal checklist item -> today's Focus
  // list, via Task.gsrc) has no equivalent for the new generic
  // ChecklistItem table in this phase, so neither is read internally
  // here anymore.
  focusVersion: number;
  onFocusChanged: () => void;
  // A calendar day clicked elsewhere asks this panel to open a node —
  // dormant in Phase A (Panel 3's calendar dots aren't wired to it yet,
  // see PlanningMonthlyLevel/PlanningYearlyLevel's own comment on why),
  // kept so that wiring lands on an already-working target.
  jumpToGoal: { id: number; token: number } | null;
}) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [panel, setPanel] = useState<GoalPanel | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [wins, setWins] = useState<Win[]>([]);
  // ONE open node across the whole panel, not one per section. Two open
  // editors would be two places to look for the thing you are editing,
  // and the panel is 545px wide — there is room for exactly one.
  const [openNodeId, setOpenNodeId] = useState<number | null>(null);
  // Without this, a failed fetch left state at its empty defaults with
  // nothing catching the rejection — the panel rendered with no visible
  // signal anything had gone wrong (ui-ux-audit verify pass, 2026-09-22).
  const [loadError, setLoadError] = useState(false);

  // Opens the node and scrolls it into view — `id="node-<id>"` on
  // PlanningNodeRow's own root (both collapsed/expanded) is what this
  // targets, regardless of which level the id belongs to.
  useEffect(() => {
    if (!jumpToGoal) return;
    setOpenNodeId(jumpToGoal.id);
    const raf = requestAnimationFrame(() => {
      document.getElementById(`node-${jumpToGoal.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [jumpToGoal]);

  // Refetches the whole three-level tree — simplest correct option,
  // this panel's data volume is small (same reasoning the old
  // GoalRepository.list comment gives for not needing a sort-order
  // column).
  const refreshTree = (key: GoalOwnerKey) =>
    planningApi
      .listOutcomes(key)
      .then((os) => {
        setOutcomes(os);
        return Promise.all(os.map((o) => planningApi.listMilestones(o.id)));
      })
      .then((lists) => {
        const ms = lists.flat();
        setMilestones(ms);
        return Promise.all(ms.map((m) => planningApi.listWins(m.id)));
      })
      .then((lists) => setWins(lists.flat()))
      .catch(() => setLoadError(true));
  const refreshOrder = () => projectsApi.order().then(setOrder).catch(() => setLoadError(true));

  useEffect(() => {
    refreshOrder();
  }, []);

  // Re-runs whenever the shell points this panel at another project.
  // getPanel is still the source for the section titles (Project's own
  // sec_title_* columns, untouched by this migration), and it also
  // covers the first render, before the shell has loaded settings.
  useEffect(() => {
    goalsApi
      .getPanel()
      .then((p) => {
        setPanel(p);
        refreshTree(projectKey ?? p.project_key);
      })
      .catch(() => setLoadError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  // Zahid's own framing: "goal click means i am working and giving
  // concentration in that project" — the same logic as legacy's
  // _auto_timer_on_open/_auto_timer_on_close, extended to this panel.
  // Opening ANY node in this panel counts as attention landing on
  // `shownKey`'s project; closing it (or opening a different project's
  // panel) stops the clock again, but only if this hook is the one that
  // started it — see useAutoTimer's own comment for the full contract.
  const timerKey: ProjectKey | null = projectKey === 'life' ? null : projectKey ?? (panel?.project_key ?? null);
  useAutoTimer(openNodeId !== null ? timerKey : null, order, refreshOrder);

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
              refreshTree(projectKey ?? p.project_key);
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

  const today = new Date();
  const thisMonth = today.getMonth() + 1;
  const thisYear = today.getFullYear();
  const thisMonday = mondayOf(today);

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
        {LEVELS.map(({ key, legacyHorizon, label, glyph, accent, weight }) => {
          const nodes: PlanningNode[] =
            key === 'outcome' ? outcomes : key === 'milestone' ? milestones.filter((m) => outcomes.some((o) => o.id === m.outcome_id)) : wins.filter((w) => milestones.some((m) => m.id === w.milestone_id));
          const parentOptions =
            key === 'milestone'
              ? outcomes.map((o) => ({ id: o.id, title: o.title }))
              : key === 'win'
                ? milestones.map((m) => ({ id: m.id, title: m.title }))
                : [];

          return (
            <PlanningLevelSection
              key={key}
              level={key}
              label={sectionTitle[legacyHorizon] || label}
              defaultLabel={label}
              glyph={glyph}
              weight={weight}
              accent={accent}
              nodes={nodes}
              parentOptions={parentOptions}
              openId={openNodeId}
              onOpenChange={setOpenNodeId}
              onAdd={(text, parentId) => {
                const refetch = () => refreshTree(shownKey);
                if (key === 'outcome') {
                  planningApi.createOutcome(shownKey, text, thisYear).then(refetch);
                } else if (key === 'milestone' && parentId !== null) {
                  planningApi.createMilestone(parentId, text, thisMonth, thisYear).then(refetch);
                } else if (key === 'win' && parentId !== null) {
                  planningApi.createWin(parentId, text, thisMonday).then(refetch);
                }
              }}
              onToggle={(id) => {
                const node = nodes.find((n) => n.id === id);
                if (!node) return;
                const status = node.status === 'achieved' ? 'active' : 'achieved';
                const refetch = () => refreshTree(shownKey);
                if (key === 'outcome') planningApi.editOutcome(id, { status }).then(refetch);
                else if (key === 'milestone') planningApi.editMilestone(id, { status }).then(refetch);
                else planningApi.editWin(id, { status }).then(refetch);
              }}
              onDelete={(id) => {
                const refetch = () => refreshTree(shownKey);
                const afterDelete = () => {
                  setOpenNodeId((cur) => (cur === id ? null : cur));
                  refetch();
                };
                if (key === 'outcome') planningApi.deleteOutcome(id).then(afterDelete);
                else if (key === 'milestone') planningApi.deleteMilestone(id).then(afterDelete);
                else planningApi.deleteWin(id).then(afterDelete);
              }}
              onEditText={(id, text) => {
                const refetch = () => refreshTree(shownKey);
                if (key === 'outcome') planningApi.editOutcome(id, { title: text }).then(refetch);
                else if (key === 'milestone') planningApi.editMilestone(id, { title: text }).then(refetch);
                else planningApi.editWin(id, { title: text }).then(refetch);
              }}
              onRenameTitle={(title) => goalsApi.setSectionTitle(legacyHorizon, title).then(setPanel)}
              onOpenBoard={onOpenBoard}
            />
          );
        })}
      </div>
    </div>
  );
}
