import { useEffect, useState } from 'react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { useAutoTimer } from '../useAutoTimer';
import { accentText } from '../themes';
import { Goal, GoalHorizon, GoalOwnerKey, GoalPanel, ProjectKey, ProjectOrderEntry, goalsApi, projectsApi } from '../services/api';
import { RADIUS } from '../spacing';

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
  onEditNextAction,
  onEditDeadline,
  onOpenBoard,
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
  onEditNextAction: (nextAction: string) => void;
  onEditDeadline: (deadline: string) => void;
  onOpenBoard: () => void;
}) {
  const [text, setText] = useState(goal.text);
  const [startDate, setStartDate] = useState(goal.start_date);
  const [deadline, setDeadline] = useState(goal.deadline);
  const noteField = useAutosave(goal.note, onEditNote);
  const nextActionField = useAutosave(goal.next_action, onEditNextAction);

  useEffect(() => setText(goal.text), [goal.text]);
  useEffect(() => setStartDate(goal.start_date), [goal.start_date]);
  useEffect(() => setDeadline(goal.deadline), [goal.deadline]);

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
        fontSize: 14,
        padding: 0,
      }}
    >
      {goal.done ? '✓' : '○'}
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
      style={{
        width: 24,
        height: 24,
        flex: 'none',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 12,
        padding: 0,
      }}
    >
      ✕
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
          title="Open this goal"
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            font: 'inherit',
            fontSize: 13,
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
    <div
      className="goal-row goal-row-open"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: RADIUS.card,
        padding: '8px 8px',
        margin: '4px 0',
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {tick}
        <input
          value={text}
          autoFocus
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
          style={{ width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          ⌃
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
            day {goal.day_number} of {goalWindow}
            {goal.done && goal.done_date && <span style={{ color: 'var(--success)' }}> · ✓ {shortDate(goal.done_date)}</span>}
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

      {/* NEXT ACTION — the single field Zahid's review called the
          biggest UX opportunity on this panel ("Very High" in his own
          priority table, above everything else here): the one concrete,
          physical next step, not an abstract restatement of the goal.
          Boxed and bolded like GoalBoardOverlay's own NEXT ACTION
          callout so the two screens read as the same idea at two
          levels, not two unrelated features. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${accent}`,
          borderRadius: RADIUS.control,
          padding: '8px 12px',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: accent, flex: 'none' }}>
          NEXT ACTION
        </span>
        <input
          // Defaults to the goal's own top FOCUS card ("board_focus_title",
          // added 2026-09-16 alongside this) whenever nobody has typed a
          // manual NEXT ACTION — Zahid's own words: "next action by
          // default its board 1st focused 1st card name". Typing
          // anything here still saves as an explicit override into
          // goal.next_action exactly as before; clearing it back to
          // empty reverts to showing the board's own current top card
          // again on the next refresh, since the fallback is live, not
          // copied in.
          value={nextActionField.value || goal.board_focus_title || ''}
          onChange={(e) => nextActionField.setValue(e.target.value)}
          onBlur={nextActionField.flush}
          placeholder="The next concrete step — e.g. Open Seller Central → create listing"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            background: 'transparent',
            fontSize: 13,
            // Bold only when there's real text (typed or board-derived)
            // — a bold empty-state placeholder read as if it were
            // actual content (same issue fixed on GoalBoardOverlay's
            // own NEXT ACTION field this same round).
            fontWeight: nextActionField.value || goal.board_focus_title ? 700 : 400,
            padding: '2px 0',
            ...savedFlashStyle(nextActionField.state),
          }}
        />
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
  onEditNextAction,
  onEditDeadline,
  onRenameTitle,
  onOpenBoard,
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
  onEditNextAction: (id: number, nextAction: string) => void;
  onEditDeadline: (id: number, deadline: string) => void;
  onRenameTitle: (title: string) => void;
  onOpenBoard: (goal: Goal) => void;
}) {
  const [title, setTitle] = useState(label);
  const [composing, setComposing] = useState(false);
  const [newText, setNewText] = useState('');
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
    <div
      style={{
        flex: `${weight} 1 0`,
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
            value={newText}
            autoFocus
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
            onEditNextAction={(nextAction) => onEditNextAction(g.id, nextAction)}
            onEditDeadline={(deadline) => onEditDeadline(g.id, deadline)}
            onOpenBoard={() => onOpenBoard(g)}
          />
        ))}
      </div>
    </div>
  );
}

export default function GoalsPanel({
  projectKey,
  onOpenBoard,
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
}) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [panel, setPanel] = useState<GoalPanel | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  // ONE open goal across the whole panel, not one per section. Two open
  // editors would be two places to look for the thing you are editing,
  // and the panel is 545px wide — there is room for exactly one.
  const [openGoalId, setOpenGoalId] = useState<number | null>(null);

  const refreshGoals = (key: GoalOwnerKey) => goalsApi.list(key).then(setGoals);
  const refreshOrder = () => projectsApi.order().then(setOrder);

  useEffect(() => {
    refreshOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-runs whenever the shell points this panel at another project.
  // getPanel is still the source for the section titles, and it also
  // covers the first render, before the shell has loaded settings.
  useEffect(() => {
    goalsApi.getPanel().then((p) => {
      setPanel(p);
      refreshGoals(projectKey ?? p.project_key);
    });
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

  if (!panel) return <div>Loading…</div>;

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
            onEditNextAction={(id, next_action) =>
              goalsApi.edit(id, { next_action }).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
            }
            onEditDeadline={(id, deadline) =>
              goalsApi.edit(id, { deadline }).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))
            }
            onRenameTitle={(title) => goalsApi.setSectionTitle(key, title).then(setPanel)}
            onOpenBoard={(goal) => onOpenBoard(goal.id)}
          />
        ))}
      </div>
    </div>
  );
}
