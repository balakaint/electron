import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { BoardTask, Goal, GoalOwnerKey, boardTaskApi, goalsApi } from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { RADIUS } from '../spacing';
import IndividualTaskBoard from './IndividualTaskBoard';

// GOAL -> TASK -> INDIVIDUAL TASK BOARD — the full-window overlay
// reached from a Goal's "→ BOARD" button (GoalsPanel/GoalRow).
//
// Supersedes two earlier, narrower designs in the same direction:
//   1. a flat per-project Focus Board (Panel2's GOALS|BOARD tab)
//   2. that board's cards carrying an optional goal_id backlink
// The user corrected the shape to the 3-level hierarchy they specified
// directly:
//
//   GOAL
//   ├── Task 1 -> its own Individual Task Board (QUEUED/FOCUS/CLOSED)
//   ├── Task 2 -> its own Individual Task Board
//   └── Task 3 -> its own Individual Task Board
//
// and then explicitly chose "full-window overlay" over cramming this
// into Panel 2 — this component is that overlay, following the exact
// pattern App.tsx already uses for BusinessAnalysisCanvas/JourneyPanel
// (a "← Back" button above a full-screen surface). The overlay itself
// only renders the "← Back" chrome (App.tsx does that, same as every
// other overlay kind); this component is just the content.
//
// v2 pass: the first cut left both panes stretched to the overlay's
// full available height with nothing to fill it — an empty task list
// still took a flex:1 share of that height (flexbox grows an empty
// child exactly like a full one), so the composer fell to the bottom
// of the window instead of sitting under the text above it, and a task
// list this shows a visually "broken" not "empty" screen. Fixed by
// giving every empty state an intentional, centered design inside the
// space it already occupies, framing both panes as real bordered
// cards (matching the dashed-border "add" card JourneyPanel already
// uses), and bounding the whole two-pane row to a sane height instead
// of an unbounded 100%.
const CARD_STYLE: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  boxShadow: 'var(--shadow-sm)',
};

// A single labeled, editable callout row — OUTCOME and NEXT ACTION
// below share this shape, differing only in emphasis (accentColor,
// prominence) since Zahid's priority table ranked Next Action above
// Outcome ("Very High" vs "High") and asked for that to show, not just
// be true underneath identical boxes.
function CalloutField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  accentColor,
  bold,
  flashState,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder: string;
  accentColor: string;
  bold?: boolean;
  flashState: ReturnType<typeof useAutosave<string>>['state'];
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: RADIUS.control,
        padding: bold ? '10px 12px' : '8px 12px',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: accentColor, flex: 'none' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          background: 'transparent',
          fontSize: bold ? 14 : 13,
          // Bold only when there's real text to be bold — applying the
          // "this field matters" weight to the placeholder too made an
          // EMPTY NEXT ACTION read as if the example text ("Open Seller
          // Central → create listing") were the user's own entered
          // content, same weight and near-same color as real input.
          // The placeholder itself is still deliberately part of this
          // field's larger padding/font-size, just not bold.
          fontWeight: bold && value ? 700 : 400,
          padding: '2px 0',
          ...savedFlashStyle(flashState),
        }}
      />
    </div>
  );
}

// The task's own heading above its board: name, NEXT ACTION (the single
// executable step — ranked "Very High" priority in Zahid's own
// visual-hierarchy review, so it sits first and boldest) and OUTCOME
// (Definition of Done) below it, one notch quieter. See
// BoardTask.next_action/outcome's model comments for why both exist and
// why they're separate fields.
//
// Used to also repeat "FOCUS BOARD" (an eyebrow label) and "Goal: X"
// (the goal's own name, again) above task.title — Zahid's own call,
// 2026-09-16: with the overlay's own top header already showing
// "GOAL → BOARD" + the goal's name in large type, restating the goal
// name again here just read as noise, not useful breadcrumb context.
// Dropped both; task.title alone is enough to say which task's board
// this is (it already matches the highlighted row in the left rail).
function TaskHeader({
  task,
  onSaveOutcome,
  onSaveNextAction,
}: {
  task: BoardTask;
  onSaveOutcome: (outcome: string) => void;
  onSaveNextAction: (nextAction: string) => void;
}) {
  const outcomeField = useAutosave(task.outcome, onSaveOutcome);
  const nextActionField = useAutosave(task.next_action, onSaveNextAction);

  return (
    <div style={{ marginBottom: 16, flex: 'none' }}>
      <h3 style={{ margin: 0, marginBottom: 12, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{task.title}</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CalloutField
          label="NEXT ACTION"
          value={nextActionField.value}
          onChange={nextActionField.setValue}
          onBlur={nextActionField.flush}
          placeholder="The very next physical step — e.g. Open Seller Central → create listing"
          accentColor="var(--accent)"
          bold
          flashState={nextActionField.state}
        />
        <CalloutField
          label="OUTCOME"
          value={outcomeField.value}
          onChange={outcomeField.setValue}
          onBlur={outcomeField.flush}
          placeholder="What finishes this task — Definition of Done…"
          accentColor="var(--text-faint)"
          flashState={outcomeField.state}
        />
      </div>
    </div>
  );
}

// Goal / Plans / Actions / Results — 2026-09-16, straight from Zahid's
// attached design spec ("Virtual Card for AI — Kanban Style Design"),
// which this overlay's structure already matched everywhere except this
// one piece. "Update based on goal state / task completion" is the
// spec's own wording for the trigger rule, without naming the exact
// rule — this is one reasonable reading, not the only one: Goal is
// always reached; Plans once the goal has been broken into at least one
// Task; Actions once any of those tasks' cards has reached FOCUS
// (board_focus, not just board_total — a goal with everything still
// queued hasn't started acting on it yet); Results once any card has
// reached CLOSED. Worth Zahid's own sign-off if he wants a different
// trigger.
const STEP_LABELS = ['Goal', 'Plans', 'Actions', 'Results'];

function progressStep(goal: Goal | null, taskCount: number): number {
  if (!goal) return 1;
  if (goal.board_done > 0) return 4;
  if (goal.board_focus > 0) return 3;
  if (taskCount > 0) return 2;
  return 1;
}

function ProgressSteps({ goal, taskCount }: { goal: Goal | null; taskCount: number }) {
  const step = progressStep(goal, taskCount);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  flex: 'none',
                  borderRadius: RADIUS.pill,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: done || current ? 'var(--accent)' : 'var(--surface)',
                  border: `1px solid ${done || current ? 'var(--accent)' : 'var(--border)'}`,
                  color: done || current ? 'var(--on-accent)' : 'var(--text-faint)',
                }}
              >
                {n}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: current ? 700 : 400,
                  color: current ? 'var(--accent)' : done ? 'var(--text)' : 'var(--text-faint)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </div>
            {n < STEP_LABELS.length && (
              <div style={{ width: 28, height: 1, margin: '0 8px', background: done ? 'var(--accent)' : 'var(--border)', flex: 'none' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ icon, title, note }: { icon: string; title: string; note: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        textAlign: 'center',
        padding: 24,
        border: '1px dashed var(--border)',
        borderRadius: RADIUS.card,
        color: 'var(--text-faint)',
      }}
    >
      <span aria-hidden style={{ fontSize: 24, color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{title}</span>
      <span style={{ fontSize: 12, maxWidth: 220 }}>{note}</span>
    </div>
  );
}

export default function GoalBoardOverlay({ project, goalId }: { project: GoalOwnerKey; goalId: number }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const refreshTasks = () =>
    boardTaskApi.list(goalId).then((ts) => {
      setTasks(ts);
      setSelectedTaskId((cur) => (cur && ts.some((t) => t.id === cur) ? cur : ts[0]?.id ?? null));
    });

  useEffect(() => {
    // No get-by-id endpoint for a single goal (same as every other
    // resource in this app — goalsApi only lists per-project), so the
    // header pulls the goal's own text out of that project's list.
    goalsApi.list(project).then((gs) => setGoal(gs.find((g) => g.id === goalId) ?? null));
    refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, goalId]);

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    boardTaskApi.add(goalId, t).then((task) => {
      setNewTitle('');
      setTasks((ts) => [...ts, task]);
      setSelectedTaskId(task.id);
    });
  };

  const deleteTask = (id: number) => {
    boardTaskApi.remove(id).then(() => {
      setTasks((ts) => ts.filter((t) => t.id !== id));
      setSelectedTaskId((cur) => (cur === id ? null : cur));
    });
  };

  const startRename = (task: BoardTask) => {
    setRenamingId(task.id);
    setRenameValue(task.title);
  };

  const commitRename = (task: BoardTask) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === task.title) return;
    boardTaskApi.edit(task.id, { title }).then((updated) => setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t))));
  };

  const saveOutcome = (task: BoardTask) => (outcome: string) =>
    boardTaskApi.edit(task.id, { outcome }).then((updated) => setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t))));

  const saveNextAction = (task: BoardTask) => (nextAction: string) =>
    boardTaskApi
      .edit(task.id, { next_action: nextAction })
      .then((updated) => setTasks((ts) => ts.map((t) => (t.id === updated.id ? updated : t))));

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header — eyebrow pill + title, matching the breadcrumb weight
          every other overlay in this app gives its own heading. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            borderRadius: RADIUS.card,
            background: 'var(--accent-light)',
            color: 'var(--accent)',
          }}
        >
          ◈
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'inline-block',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: 'var(--accent)',
              background: 'var(--accent-light)',
              borderRadius: RADIUS.pill,
              padding: '2px 8px',
              marginBottom: 4,
            }}
          >
            GOAL → BOARD
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {goal ? goal.text : 'Loading…'}
          </h2>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <ProgressSteps goal={goal} taskCount={tasks.length} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 220px)' }}>
        {/* Left rail: this goal's tasks. Each one owns its own board —
            this list is the "break the goal into parts" step itself. */}
        <div className="card-elevated" style={{ width: 260, flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, ...CARD_STYLE, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-muted)' }}>TASKS</span>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{tasks.length}</span>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {tasks.length === 0 ? (
              <EmptyState icon="◇" title="No tasks yet" note="Break this goal into parts below — each one gets its own board." />
            ) : (
              tasks.map((task) => {
                const active = task.id === selectedTaskId;
                return (
                  <div
                    key={task.id}
                    className="goal-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '8px 8px',
                      marginBottom: 4,
                      flex: 'none',
                      borderRadius: RADIUS.control,
                      borderLeft: `3px solid ${active ? 'var(--accent)' : 'transparent'}`,
                      background: active ? 'var(--accent-light)' : 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    {renamingId === task.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(task)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '2px 4px' }}
                      />
                    ) : (
                      <button
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(task);
                        }}
                        title="Double-click to rename"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          textAlign: 'left',
                          border: 'none',
                          background: 'transparent',
                          font: 'inherit',
                          fontSize: 13,
                          fontWeight: active ? 700 : 400,
                          color: active ? 'var(--accent)' : 'var(--text)',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          padding: 0,
                        }}
                      >
                        {task.title}
                      </button>
                    )}
                    <button
                      className="goal-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                      title="Delete this task and its board"
                      aria-label="Delete this task and its board"
                      style={{ width: 20, height: 20, flex: 'none', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={submitAdd} style={{ display: 'flex', gap: 4, marginTop: 8, flex: 'none' }}>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New task…"
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: 8 }}
            />
            <button type="submit" className="btn-primary" title="Add task" style={{ fontSize: 14, padding: '4px 8px', flex: 'none' }}>
              +
            </button>
          </form>
        </div>

        {/* Right: the selected task's own Individual Task Board, sunk
            into a slightly recessed panel so the three kanban columns
            read as content sitting inside this goal's workspace rather
            than floating loose in the window. */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            padding: selectedTask ? 16 : 0,
          }}
        >
          {selectedTask ? (
            <>
              <TaskHeader
                task={selectedTask}
                onSaveOutcome={saveOutcome(selectedTask)}
                onSaveNextAction={saveNextAction(selectedTask)}
              />
              <IndividualTaskBoard key={selectedTask.id} taskId={selectedTask.id} />
            </>
          ) : (
            <EmptyState
              icon="◫"
              title={tasks.length === 0 ? 'Nothing to show yet' : 'Pick a task'}
              note={tasks.length === 0 ? 'Add your first task on the left to see its board here.' : 'Select a task on the left to open its board.'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
