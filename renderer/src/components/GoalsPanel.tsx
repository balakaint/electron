import { useEffect, useState } from 'react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
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

function GoalCard({
  goal,
  accent,
  onToggle,
  onDelete,
  onEditText,
  onEditNote,
  onEditStartDate,
}: {
  goal: Goal;
  accent: string;
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

  const cappedDay = Math.min(goal.day_number, 30);
  const barPct = (cappedDay / 30) * 100;
  const barTooltip = `Day ${goal.day_number} of 30 — ${cappedDay}/30 progress`;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: 8,
        marginBottom: 8,
        opacity: goal.done ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={onToggle} title="Toggle done" style={{ width: 22 }}>
          {goal.done ? '✓' : '○'}
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== goal.text && onEditText(text)}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: 13,
            textDecoration: goal.done ? 'line-through' : 'none',
          }}
        />
        <button onClick={onDelete} title="Delete">✕</button>
      </div>

      <div
        title={barTooltip}
        style={{ height: 4, background: 'var(--border)', borderRadius: 2, margin: '6px 0', overflow: 'hidden', cursor: 'default' }}
      >
        <div style={{ width: `${barPct}%`, height: '100%', background: goal.done ? 'var(--success)' : accent }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
        <span title={barTooltip}>
          Day {goal.day_number} · {cappedDay}/30
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          onBlur={() => startDate !== goal.start_date && onEditStartDate(startDate)}
          style={{ fontSize: 11, border: 'none', background: 'transparent', color: 'inherit', padding: 0 }}
        />
        {goal.done && goal.done_date && <span>✓ {goal.done_date}</span>}
      </div>

      <textarea
        value={noteField.value}
        onChange={(e) => noteField.setValue(e.target.value)}
        onBlur={noteField.flush}
        placeholder="Notes…"
        rows={2}
        style={{ width: '100%', fontSize: 12, padding: 4, resize: 'vertical', boxSizing: 'border-box', ...savedFlashStyle(noteField.state) }}
      />
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function GoalSection({
  horizon,
  label,
  glyph,
  weight,
  accent,
  goals,
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
  glyph: string;
  weight: number;
  accent: string;
  goals: Goal[];
  onAdd: (text: string, startDate: string) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onEditText: (id: number, text: string) => void;
  onEditNote: (id: number, note: string) => void;
  onEditStartDate: (id: number, date: string) => void;
  onRenameTitle: (title: string) => void;
}) {
  const [title, setTitle] = useState(label);
  const [newText, setNewText] = useState('');
  const [newDate, setNewDate] = useState(todayIso);

  useEffect(() => setTitle(label), [label]);

  const done = goals.filter((g) => g.done).length;

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newText.trim();
    if (!t) return;
    onAdd(t, newDate || todayIso());
    setNewText('');
    setNewDate(todayIso());
  };

  return (
    <div
      style={{
        // The 50/25/25 split, and each section scrolls inside itself so a
        // long list in the top section cannot push the other two off the
        // panel.
        flex: `${weight} 1 0`,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        // Legacy draws a full-height accent rail down the section's left
        // edge, not a small chip beside the title.
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ color: accent, fontSize: 12 }}>{glyph}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onRenameTitle(title.trim())}
          style={{
            flex: 1,
            fontWeight: 'bold',
            fontSize: 13,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          {done}/{goals.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {goals.length === 0 && (
        // Legacy names the empty state rather than leaving a blank box —
        // an empty section and a broken one look identical otherwise.
        <div style={{ textAlign: 'center', opacity: 0.45, padding: '16px 0' }}>
          <div style={{ fontSize: 20 }}>◎</div>
          <div style={{ fontSize: 13, fontWeight: 'bold', margin: '4px 0 2px' }}>No goals yet</div>
          <div style={{ fontSize: 11 }}>Click + Add to create your first goal.</div>
        </div>
      )}
      {goals.map((g) => (
        <GoalCard
          key={g.id}
          goal={g}
          accent={accent}
          onToggle={() => onToggle(g.id)}
          onDelete={() => onDelete(g.id)}
          onEditText={(text) => onEditText(g.id, text)}
          onEditNote={(note) => onEditNote(g.id, note)}
          onEditStartDate={(date) => onEditStartDate(g.id, date)}
        />
      ))}
      </div>

      <form onSubmit={submitAdd} style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="+ Add goal…"
          style={{ flex: 1, fontSize: 12, padding: 4, minWidth: 0 }}
        />
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          title="Start date"
          style={{ fontSize: 12, padding: 4, width: 118 }}
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

// `projectKey` is owned by the shell, because panel 1's Goals button is
// what changes it. Reading it once on mount (as this did) meant pressing
// Goals on another card updated the server and the button's highlight
// while this panel went on showing the previous project's goals.
export default function GoalsPanel({ projectKey }: { projectKey: ProjectKey | null }) {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [panel, setPanel] = useState<GoalPanel | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, paddingLeft: 22 }}>
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
          marginBottom: 10,
          paddingBottom: 4,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Whose goals these are. Without it the same three headings
            silently mean six different things depending on which card
            was pressed last, and nothing on screen says which. */}
        <span style={{ flex: 1, fontWeight: 'bold', color: activeEntry?.project.accent_color }}>
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
            glyph={glyph}
            weight={weight}
            accent={accent}
            goals={goals.filter((g) => g.horizon === key)}
            onAdd={(text, startDate) =>
              goalsApi.create(shownKey, key, text, startDate).then(() => refreshGoals(shownKey))
            }
            onToggle={(id) => goalsApi.toggle(id).then((g) => setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))))}
            onDelete={(id) => goalsApi.remove(id).then(() => setGoals((gs) => gs.filter((x) => x.id !== id)))}
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
