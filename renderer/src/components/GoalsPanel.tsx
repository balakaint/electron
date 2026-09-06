import { useEffect, useState } from 'react';
import { Goal, GoalHorizon, GoalPanel, ProjectKey, ProjectOrderEntry, goalsApi, projectsApi } from '../services/api';

const HORIZONS: { key: GoalHorizon; label: string; accent: string }[] = [
  { key: 'yearly', label: 'YEARLY', accent: '#4f8cff' },
  { key: 'monthly', label: 'MONTHLY', accent: '#B08900' },
  { key: 'weekly', label: 'WEEKLY', accent: '#2D6A4F' },
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
  const [note, setNote] = useState(goal.note);
  const [startDate, setStartDate] = useState(goal.start_date);

  useEffect(() => setText(goal.text), [goal.text]);
  useEffect(() => setNote(goal.note), [goal.note]);
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
        <button onClick={onToggle} style={{ width: 22 }}>
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
        <button onClick={onDelete}>✕</button>
      </div>

      <div
        title={barTooltip}
        style={{ height: 4, background: 'var(--border)', borderRadius: 2, margin: '6px 0', overflow: 'hidden', cursor: 'default' }}
      >
        <div style={{ width: `${barPct}%`, height: '100%', background: goal.done ? '#2D6A4F' : accent }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
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
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== goal.note && onEditNote(note)}
        placeholder="Notes…"
        rows={2}
        style={{ width: '100%', fontSize: 12, padding: 4, resize: 'vertical', boxSizing: 'border-box' }}
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
    <div style={{ flex: 1, minWidth: 240, background: 'var(--surface)', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <div style={{ width: 4, height: 14, background: accent, borderRadius: 2 }} />
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
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          {done}/{goals.length}
        </span>
      </div>

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

export default function GoalsPanel() {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [panel, setPanel] = useState<GoalPanel | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

  const refreshGoals = (key: ProjectKey) => goalsApi.list(key).then(setGoals);

  useEffect(() => {
    projectsApi.order().then(setOrder);
    goalsApi.getPanel().then((p) => {
      setPanel(p);
      refreshGoals(p.project_key);
    });
  }, []);

  if (!panel) return <div>Loading…</div>;

  const switchProject = (key: ProjectKey) => {
    if (key === panel.project_key) return;
    goalsApi.setPanelProject(key).then((p) => {
      setPanel(p);
      refreshGoals(key);
    });
  };

  const activeEntry = order.find((e) => e.project.key === panel.project_key);

  const sectionTitle: Record<GoalHorizon, string | null> = {
    yearly: panel.sec_title_yearly,
    monthly: panel.sec_title_monthly,
    weekly: panel.sec_title_weekly,
  };

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        {order.map((entry) => (
          <button
            key={entry.project.key}
            onClick={() => switchProject(entry.project.key)}
            disabled={entry.project.key === panel.project_key}
            style={{
              fontSize: 12,
              borderColor: entry.project.accent_color,
              background: entry.project.key === panel.project_key ? entry.project.accent_color : 'transparent',
              color: entry.project.key === panel.project_key ? '#fff' : 'var(--text)',
            }}
          >
            {entry.number}. {entry.project.name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
        {(activeEntry?.project.name || panel.project_key).toUpperCase()} — GOALS
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {HORIZONS.map(({ key, label, accent }) => (
          <GoalSection
            key={key}
            horizon={key}
            label={sectionTitle[key] || label}
            accent={accent}
            goals={goals.filter((g) => g.horizon === key)}
            onAdd={(text, startDate) =>
              goalsApi.create(panel.project_key, key, text, startDate).then(() => refreshGoals(panel.project_key))
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
