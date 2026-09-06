import { useEffect, useState } from 'react';
import { Journey, JourneyStage, ProjectKey, ProjectOrderEntry, journeyApi, projectsApi } from '../services/api';

function StatusDot({ status }: { status: string }) {
  const label = status === 'ok' ? '✓' : status === 'no' ? '✕' : '·';
  const color = status === 'ok' ? '#2D6A4F' : status === 'no' ? '#B03A2E' : 'var(--text)';
  return (
    <span style={{ color, fontWeight: 'bold', width: 14, display: 'inline-block', textAlign: 'center' }}>
      {label}
    </span>
  );
}

function StageDetail({
  stage,
  isCurrent,
  onRename,
  onSetGate,
  onToggleGate,
  onAddTask,
  onToggleTask,
  onEditTask,
  onDeleteTask,
  onAddLog,
  onCycleLog,
  onDeleteLog,
}: {
  stage: JourneyStage;
  isCurrent: boolean;
  onRename: (name: string, description: string) => void;
  onSetGate: (gate: string) => void;
  onToggleGate: () => void;
  onAddTask: (text: string) => void;
  onToggleTask: (id: number) => void;
  onEditTask: (id: number, text: string) => void;
  onDeleteTask: (id: number) => void;
  onAddLog: (text: string) => void;
  onCycleLog: (id: number) => void;
  onDeleteLog: (id: number) => void;
}) {
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description);
  const [gate, setGate] = useState(stage.gate);
  const [newTask, setNewTask] = useState('');
  const [newLog, setNewLog] = useState('');

  useEffect(() => setName(stage.name), [stage.name]);
  useEffect(() => setDescription(stage.description), [stage.description]);
  useEffect(() => setGate(stage.gate), [stage.gate]);

  const doneCount = stage.tasks.filter((t) => t.done).length;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() !== stage.name || description !== stage.description) && onRename(name, description)}
          style={{ fontWeight: 'bold', fontSize: 15, border: 'none', background: 'transparent', color: 'var(--text)', flex: 1 }}
        />
        {stage.done && <span style={{ color: '#2D6A4F', fontSize: 12 }}>✓ DONE</span>}
        {isCurrent && !stage.done && <span style={{ fontSize: 11, opacity: 0.7 }}>CURRENT</span>}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== stage.description && onRename(name, description)}
        placeholder="Description…"
        rows={2}
        style={{ width: '100%', fontSize: 12, padding: 4, resize: 'vertical', boxSizing: 'border-box', marginBottom: 10 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <button onClick={onToggleGate} disabled={!gate.trim()} title={gate.trim() ? 'Toggle gate' : 'Write a gate first'}>
          {stage.gate_done ? '✓' : '○'}
        </button>
        <input
          value={gate}
          onChange={(e) => setGate(e.target.value)}
          onBlur={() => gate !== stage.gate && onSetGate(gate)}
          placeholder="Exit gate — this stage is over when…"
          style={{ flex: 1, fontSize: 12, padding: 4 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
            TASKS {doneCount}/{stage.tasks.length}
          </div>
          {stage.tasks.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <button onClick={() => onToggleTask(t.id)} style={{ width: 20 }}>
                {t.done ? '✓' : '○'}
              </button>
              <input
                defaultValue={t.text}
                onBlur={(e) => e.target.value.trim() && e.target.value !== t.text && onEditTask(t.id, e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                  textDecoration: t.done ? 'line-through' : 'none',
                }}
              />
              <button onClick={() => onDeleteTask(t.id)}>✕</button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = newTask.trim();
              if (!t) return;
              onAddTask(t);
              setNewTask('');
            }}
            style={{ display: 'flex', gap: 4, marginTop: 4 }}
          >
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="+ Add task…"
              style={{ flex: 1, fontSize: 12, padding: 4, minWidth: 0 }}
            />
            <button type="submit">Add</button>
          </form>
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>LOG</div>
          {stage.logs.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
              <button onClick={() => onCycleLog(l.id)} title="Cycle status">
                <StatusDot status={l.status} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }}>{l.text}</div>
                <div style={{ fontSize: 10, opacity: 0.5 }}>{l.date}</div>
              </div>
              <button onClick={() => onDeleteLog(l.id)}>✕</button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = newLog.trim();
              if (!t) return;
              onAddLog(t);
              setNewLog('');
            }}
            style={{ display: 'flex', gap: 4, marginTop: 4 }}
          >
            <input
              value={newLog}
              onChange={(e) => setNewLog(e.target.value)}
              placeholder="+ What did you find out…"
              style={{ flex: 1, fontSize: 12, padding: 4, minWidth: 0 }}
            />
            <button type="submit">Add</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function JourneyPanel() {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [projectKey, setProjectKey] = useState<ProjectKey | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    projectsApi.order().then((o) => {
      setOrder(o);
      if (o.length) setProjectKey(o[0].project.key);
    });
  }, []);

  useEffect(() => {
    if (!projectKey) return;
    journeyApi.get(projectKey).then((j) => {
      setJourney(j);
      setActiveStage(j.current_stage);
    });
  }, [projectKey]);

  const apply = (p: Promise<Journey>) =>
    p.then((j) => {
      setJourney(j);
      if (j.event === 'launched') setToast('🚀 Launched!');
      else if (j.event === 'advanced') setToast('Stage advanced');
      if (j.event) setTimeout(() => setToast(null), 4000);
    });

  if (!journey || !projectKey) return <div>Loading…</div>;

  const activeEntry = order.find((e) => e.project.key === projectKey);
  const stage = journey.stages[activeStage];

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        {order.map((entry) => (
          <button
            key={entry.project.key}
            onClick={() => setProjectKey(entry.project.key)}
            disabled={entry.project.key === projectKey}
            style={{
              fontSize: 12,
              borderColor: entry.project.accent_color,
              background: entry.project.key === projectKey ? entry.project.accent_color : 'transparent',
              color: entry.project.key === projectKey ? '#fff' : 'var(--text)',
            }}
          >
            {entry.number}. {entry.project.name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
        {(activeEntry?.project.name || projectKey).toUpperCase()} — JOURNEY
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <input
          key={`${projectKey}-name`}
          defaultValue={journey.proj_name}
          onBlur={(e) => e.target.value !== journey.proj_name && apply(journeyApi.updateMeta(projectKey, { proj_name: e.target.value }))}
          placeholder="Project name…"
          style={{ fontSize: 18, fontWeight: 'bold', border: 'none', background: 'transparent', color: 'var(--text)', flex: 1 }}
        />
        {journey.launched && <span style={{ fontSize: 12, color: '#2D6A4F' }}>🚀 LAUNCHED</span>}
      </div>
      <input
        key={`${projectKey}-tagline`}
        defaultValue={journey.tagline}
        onBlur={(e) => e.target.value !== journey.tagline && apply(journeyApi.updateMeta(projectKey, { tagline: e.target.value }))}
        placeholder="Tagline…"
        style={{
          width: '100%',
          fontSize: 12,
          opacity: 0.7,
          border: 'none',
          background: 'transparent',
          color: 'var(--text)',
          marginBottom: 6,
          padding: 0,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          key={`${projectKey}-cover`}
          defaultValue={journey.cover_image}
          onBlur={(e) => e.target.value !== journey.cover_image && apply(journeyApi.updateMeta(projectKey, { cover_image: e.target.value }))}
          placeholder="Cover image path…"
          style={{ flex: 1, fontSize: 11, padding: 4 }}
        />
        <input
          key={`${projectKey}-attach`}
          defaultValue={journey.attach_file}
          onBlur={(e) => e.target.value !== journey.attach_file && apply(journeyApi.updateMeta(projectKey, { attach_file: e.target.value }))}
          placeholder="Attached file path…"
          style={{ flex: 1, fontSize: 11, padding: 4 }}
        />
      </div>

      {toast && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            marginBottom: 10,
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {journey.stages.map((s) => (
          <button
            key={s.stage_index}
            onClick={() => setActiveStage(s.stage_index)}
            disabled={s.stage_index === activeStage}
            style={{
              fontSize: 11,
              padding: '4px 8px',
              opacity: s.done ? 1 : 0.8,
              fontWeight: s.stage_index === journey.current_stage ? 'bold' : 'normal',
            }}
            title={s.name}
          >
            {s.done ? '✓' : s.stage_index + 1}. {s.name}
          </button>
        ))}
      </div>

      {stage && (
        <StageDetail
          stage={stage}
          isCurrent={stage.stage_index === journey.current_stage}
          onRename={(name, description) => apply(journeyApi.updateStageMeta(projectKey, stage.stage_index, { name, description }))}
          onSetGate={(gate) => apply(journeyApi.setGate(projectKey, stage.stage_index, gate))}
          onToggleGate={() => apply(journeyApi.toggleGate(projectKey, stage.stage_index))}
          onAddTask={(text) => apply(journeyApi.addTask(projectKey, stage.stage_index, text))}
          onToggleTask={(id) => apply(journeyApi.toggleTask(id))}
          onEditTask={(id, text) => apply(journeyApi.editTask(id, text))}
          onDeleteTask={(id) => apply(journeyApi.deleteTask(id))}
          onAddLog={(text) => apply(journeyApi.addLog(projectKey, stage.stage_index, text))}
          onCycleLog={(id) => apply(journeyApi.cycleLog(id))}
          onDeleteLog={(id) => apply(journeyApi.deleteLog(id))}
        />
      )}
    </div>
  );
}
