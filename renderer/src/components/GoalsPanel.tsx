import { useEffect, useState } from 'react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { accentText } from '../themes';
import { Goal, GoalHorizon, GoalPanel, ProjectKey, ProjectOrderEntry, goalsApi, projectsApi } from '../services/api';

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
// `weight` is legacy's 50/25/25 height split. weight alone would divide
// only the leftover space, so sections with similar content came out
// near-equal; these are explicit fractions of the column instead.
const HORIZONS: { key: GoalHorizon; label: string; glyph: string; accent: string; weight: number }[] = [
  { key: 'yearly', label: 'WEEKLY GOAL', glyph: '◈', accent: 'var(--goal-yearly)', weight: 50 },
  { key: 'monthly', label: 'MONTHLY GOAL', glyph: '❖', accent: 'var(--goal-monthly)', weight: 25 },
  { key: 'weekly', label: 'YEARLY GOAL', glyph: '◆', accent: 'var(--goal-weekly)', weight: 25 },
];

// Legacy caps the progress bar at a 30-day window, and the API's
// day_number counts from the goal's start date.
const GOAL_WINDOW = 30;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
}

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return shortDate(d.toISOString().slice(0, 10));
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
}) {
  const [text, setText] = useState(goal.text);
  const [startDate, setStartDate] = useState(goal.start_date);
  const noteField = useAutosave(goal.note, onEditNote);

  useEffect(() => setText(goal.text), [goal.text]);
  useEffect(() => setStartDate(goal.start_date), [goal.start_date]);

  const capped = Math.min(goal.day_number, GOAL_WINDOW);
  const pct = (capped / GOAL_WINDOW) * 100;
  const barColor = goal.done ? 'var(--success)' : accent;
  const dayLabel = `d${goal.day_number}${goal.day_number <= GOAL_WINDOW ? `/${GOAL_WINDOW}` : ''}`;

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
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', borderRadius: 4 }}
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
          title={`Day ${goal.day_number} of ${GOAL_WINDOW}`}
          style={{ width: 64, height: 4, background: 'var(--border)', borderRadius: 2, flex: 'none', overflow: 'hidden' }}
        >
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: barColor }} />
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
      className="goal-row"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
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
            fontWeight: 'bold',
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

      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', margin: '8px 0' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor }} />
      </div>

      {/* Dates as words. Nine native date inputs at 95px each turned the
          panel into a form; the picker belongs in the one place you are
          actually setting a date. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>started</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          onBlur={() => startDate !== goal.start_date && onEditStartDate(startDate)}
          title="Start date"
          style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 3, background: 'transparent', color: 'inherit', padding: '4px 4px' }}
        />
        <span>· day {goal.day_number} of {GOAL_WINDOW} · ends {plusDays(goal.start_date, GOAL_WINDOW)}</span>
        {goal.done && goal.done_date && (
          <span style={{ color: 'var(--success)' }}>· ✓ {shortDate(goal.done_date)}</span>
        )}
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
          marginTop: 8,
          resize: 'vertical',
          boxSizing: 'border-box',
          ...savedFlashStyle(noteField.state),
        }}
      />
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
  onRenameTitle,
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
  onRenameTitle: (title: string) => void;
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
    // Sections size to their CONTENT now, and the panel scrolls as one
    // column. The 50/25/25 split it used to carry was there because a
    // goal was a 130px card and a long section really could push the
    // other two off screen. With one-line rows that reversed: three
    // 30px rows were being given half of a 900px panel, so the top
    // section held 90px of goals and 360px of nothing. Weight is kept in
    // the props as the max share a section may take before it scrolls
    // inside itself, which is the case the split was protecting against.
    <div
      style={{
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: `${weight}%`,
        minHeight: 0,
        marginBottom: 16,
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
            fontWeight: 'bold',
            fontSize: 12,
            letterSpacing: 0.6,
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
            borderRadius: 4,
            color: composing ? 'var(--accent)' : 'var(--text-muted)',
            fontSize: 15,
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
            style={{ fontSize: 12, padding: 4, width: 116 }}
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
          />
        ))}
      </div>
    </div>
  );
}

export default function GoalsPanel({ projectKey }: { projectKey: ProjectKey | null }) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [panel, setPanel] = useState<GoalPanel | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  // ONE open goal across the whole panel, not one per section. Two open
  // editors would be two places to look for the thing you are editing,
  // and the panel is 545px wide — there is room for exactly one.
  const [openGoalId, setOpenGoalId] = useState<number | null>(null);

  const refreshGoals = (key: ProjectKey) => goalsApi.list(key).then(setGoals);

  useEffect(() => {
    projectsApi.order().then(setOrder);
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

  if (!panel) return <div>Loading…</div>;

  const shownKey = projectKey ?? panel.project_key;
  const activeEntry = order.find((e) => e.project.key === shownKey);

  const sectionTitle: Record<GoalHorizon, string | null> = {
    yearly: panel.sec_title_yearly,
    monthly: panel.sec_title_monthly,
    weekly: panel.sec_title_weekly,
  };

  return (
    // Fills the column and lets the three sections divide its height,
    // rather than sitting at a fixed max-width inside it.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflowY: 'auto', paddingLeft: 24, paddingRight: 4 }}>
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
        <span style={{ flex: 1, fontWeight: 'bold', color: activeEntry ? accentText(activeEntry.project.accent_color) : undefined }}>
          {(activeEntry?.project.name || shownKey).toUpperCase()}
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
            onRenameTitle={(title) => goalsApi.setSectionTitle(key, title).then(setPanel)}
          />
        ))}
      </div>
    </div>
  );
}
