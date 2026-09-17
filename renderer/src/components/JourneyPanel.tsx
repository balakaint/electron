import { useEffect, useState } from 'react';
import { inkOn } from '../themes';
import { Journey, JourneyStage, ProjectKey, ProjectOrderEntry, journeyApi, projectsApi } from '../services/api';
import { useAutoTimer } from '../useAutoTimer';
import { RADIUS } from '../spacing';

function StatusDot({ status }: { status: string }) {
  const label = status === 'ok' ? '✓' : status === 'no' ? '✕' : '·';
  const color = status === 'ok' ? 'var(--success)' : status === 'no' ? 'var(--danger)' : 'var(--text)';
  return (
    <span style={{ color, fontWeight: 700, width: 14, display: 'inline-block', textAlign: 'center' }}>
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
    <div style={{ background: 'var(--surface)', borderRadius: RADIUS.card, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          aria-label="Stage name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() !== stage.name || description !== stage.description) && onRename(name, description)}
          style={{ fontWeight: 700, fontSize: 16, border: 'none', background: 'transparent', color: 'var(--text)', flex: 1 }}
        />
        {stage.done && <span style={{ color: 'var(--success)', fontSize: 12 }}>✓ DONE</span>}
        {isCurrent && !stage.done && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>CURRENT</span>}
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => description !== stage.description && onRename(name, description)}
        placeholder="Description…"
        rows={2}
        style={{ width: '100%', fontSize: 12, padding: 4, resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>
            TASKS {doneCount}/{stage.tasks.length}
          </div>
          {stage.tasks.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <button onClick={() => onToggleTask(t.id)} title="Toggle done" style={{ width: 20 }}>
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
              <button onClick={() => onDeleteTask(t.id)} title="Delete">✕</button>
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
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>LOG</div>
          {stage.logs.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
              <button onClick={() => onCycleLog(l.id)} title="Cycle status">
                <StatusDot status={l.status} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }}>{l.text}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{l.date}</div>
              </div>
              <button onClick={() => onDeleteLog(l.id)} title="Delete">✕</button>
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

function CoverImage({
  path,
  onPick,
  onRemove,
}: {
  path: string;
  onPick: () => void;
  onRemove: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    setDataUrl(null);
    if (!path) return undefined;
    let cancelled = false;
    journeyApi.readCoverImage(path).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path) {
    return (
      <button
        onClick={onPick}
        title="Add a cover image"
        style={{
          fontSize: 12,
          padding: '12px 12px',
          border: '1px dashed var(--border)',
          borderRadius: RADIUS.card,
          background: 'var(--surface)',
          color: 'var(--text)',
          width: '100%',
          marginBottom: 12,
        }}
      >
        + Add cover image
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        height: 120,
        borderRadius: RADIUS.card,
        overflow: 'hidden',
        marginBottom: 12,
        background: 'var(--surface)',
      }}
    >
      {dataUrl && (
        <img src={dataUrl} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to bottom, transparent 45%, var(--surface) 100%)',
        }}
      />
      <button onClick={onPick} title="Change cover image" style={{ position: 'absolute', bottom: 6, right: 34, fontSize: 12, padding: '4px 8px' }}>
        Change
      </button>
      <button onClick={onRemove} title="Remove cover image" style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 12, padding: '4px 8px' }}>
        ✕
      </button>
    </div>
  );
}

export default function JourneyPanel() {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [projectKey, setProjectKey] = useState<ProjectKey | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const refreshOrder = () => projectsApi.order().then(setOrder);

  useEffect(() => {
    projectsApi.order().then((o) => {
      setOrder(o);
      if (o.length) setProjectKey(o[0].project.key);
    });
  }, []);

  useAutoTimer(projectKey, order, refreshOrder);

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        {order.map((entry) => (
          <button
            key={entry.project.key}
            onClick={() => setProjectKey(entry.project.key)}
            disabled={entry.project.key === projectKey}
            style={{
              fontSize: 12,
              borderColor: entry.project.accent_color,
              background: entry.project.key === projectKey ? entry.project.accent_color : 'transparent',
              color: entry.project.key === projectKey ? inkOn(entry.project.accent_color) : 'var(--text)',
            }}
          >
            {entry.number}. {entry.project.name}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>
        {(activeEntry?.project.name || projectKey).toUpperCase()} — JOURNEY
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <input
          key={`${projectKey}-name`}
          defaultValue={journey.proj_name}
          onBlur={(e) => e.target.value !== journey.proj_name && apply(journeyApi.updateMeta(projectKey, { proj_name: e.target.value }))}
          placeholder="Project name…"
          style={{ fontSize: 16, fontWeight: 700, border: 'none', background: 'transparent', color: 'var(--text)', flex: 1 }}
        />
        {journey.launched && <span style={{ fontSize: 12, color: 'var(--success)' }}>🚀 LAUNCHED</span>}
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
          marginBottom: 8,
          padding: 0,
          boxSizing: 'border-box',
        }}
      />
      <CoverImage
        path={journey.cover_image}
        onPick={() =>
          journeyApi.pickCoverImage().then((path) => {
            if (path) apply(journeyApi.updateMeta(projectKey, { cover_image: path }));
          })
        }
        onRemove={() => apply(journeyApi.updateMeta(projectKey, { cover_image: '' }))}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {journey.attach_file ? (
          <button
            onClick={() => journeyApi.openAttachFile(journey.attach_file)}
            onDoubleClick={() => apply(journeyApi.updateMeta(projectKey, { attach_file: '' }))}
            title="Click to open · double-click to detach"
            style={{ fontSize: 12 }}
          >
            + {journey.attach_file.split(/[\\/]/).pop()?.slice(0, 24)}
          </button>
        ) : (
          <button
            onClick={() =>
              journeyApi.pickAttachFile().then((path) => {
                if (path) apply(journeyApi.updateMeta(projectKey, { attach_file: path }));
              })
            }
            title="Link a supporting Word/Excel/CSV file"
            style={{ fontSize: 12 }}
          >
            + Attach Word/Excel
          </button>
        )}
      </div>

      {toast && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            padding: '8px 12px',
            fontSize: 12,
            marginBottom: 12,
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
              fontSize: 12,
              padding: '4px 8px',
              opacity: s.done ? 1 : 0.8,
              fontWeight: s.stage_index === journey.current_stage ? 700 : 400,
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
