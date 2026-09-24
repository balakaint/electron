import { useEffect, useState } from 'react';
import { Check, Circle, Rocket, X } from 'lucide-react';
import { inkOn } from '../themes';
import { Journey, JourneyStage, ProjectKey, ProjectOrderEntry, journeyApi, projectsApi } from '../services/api';
import { useAutoTimer } from '../useAutoTimer';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

function StatusDot({ status }: { status: string }) {
  const color = status === 'ok' ? 'var(--success)' : status === 'no' ? 'var(--danger)' : 'var(--text)';
  return (
    <span style={{ color, width: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {status === 'ok' ? <Check size={12} /> : status === 'no' ? <X size={12} /> : <Circle size={4} fill="currentColor" />}
    </span>
  );
}

// A stage's state reads as ONE colour, everywhere at once — the number
// badge, the card's border, its faint background tint — so the eye
// sorts done/current/upcoming before it reads a single word. Same
// tinted-pill technique QuarterlyPlanPanel's StatusBadge already uses
// (colour AS the text/border, a color-mix() tint as the fill) rather
// than a solid fill needing a computed ink colour — one fewer thing
// that can go wrong on a seventh theme.
const STAGE_COLOR = { done: 'var(--success)', current: 'var(--accent)', upcoming: 'var(--border)' } as const;

function stageState(stage: JourneyStage, isCurrentStage: boolean): keyof typeof STAGE_COLOR {
  if (stage.done) return 'done';
  if (isCurrentStage) return 'current';
  return 'upcoming';
}

// The board's collapsed column: one stage's status at a glance — name,
// gate, task progress, first couple of tasks — so all 6 stages read
// side by side without opening any of them. Clicking it expands that
// stage in place (see JourneyPanel's `expandedStage`).
function StageColumn({
  stage,
  isCurrentStage,
  onExpand,
}: {
  stage: JourneyStage;
  isCurrentStage: boolean;
  onExpand: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const doneCount = stage.tasks.filter((t) => t.done).length;
  const total = stage.tasks.length;
  const preview = stage.tasks.slice(0, 2);
  const extra = total - preview.length;
  const state = stageState(stage, isCurrentStage);
  const color = STAGE_COLOR[state];
  const tinted = state !== 'upcoming';

  return (
    <button
      onClick={onExpand}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`Open ${stage.name}`}
      style={{
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.xs,
        // minWidth: 0 is load-bearing — a flex/grid item's default
        // min-width is its content's own (nowrap) width, which is what
        // was pushing every column to a different size and silently
        // defeating every ellipsis below.
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
        background: tinted ? `color-mix(in srgb, ${color} 6%, var(--surface))` : 'var(--surface)',
        border: `1px solid ${tinted ? color : 'var(--border)'}`,
        borderRadius: RADIUS.card,
        padding: SPACE.md,
        cursor: 'pointer',
        color: 'var(--text)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? `0 4px 12px color-mix(in srgb, ${color} 20%, transparent)` : 'var(--shadow-sm)',
        transition: 'transform 0.12s ease-out, box-shadow 0.12s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            flex: 'none',
            width: 22,
            height: 22,
            borderRadius: RADIUS.pill,
            border: `1px solid ${color}`,
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
            fontSize: TYPE_SIZE.xs,
            fontWeight: TYPE_WEIGHT.bold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {stage.done ? <Check size={14} /> : stage.stage_index + 1}
        </span>
        <div
          style={{
            fontSize: TYPE_SIZE.sm,
            fontWeight: TYPE_WEIGHT.bold,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {stage.name}
        </div>
      </div>

      {isCurrentStage && !stage.done && (
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: TYPE_SIZE.xs,
            fontWeight: TYPE_WEIGHT.bold,
            letterSpacing: TRACKING.label,
            color: 'var(--accent)',
          }}
        >
          CURRENT
        </span>
      )}

      {stage.gate && (
        <div
          style={{
            fontSize: TYPE_SIZE.xs,
            color: 'var(--text-faint)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {stage.gate_done ? <Check size={11} /> : <Circle size={11} />} {stage.gate}
        </div>
      )}

      {total > 0 && (
        <>
          <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
            {doneCount}/{total} tasks
          </div>
          <div style={{ height: SPACE.hair, borderRadius: RADIUS.pill, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(doneCount / total) * 100}%`,
                background: color,
              }}
            />
          </div>
          {preview.map((t) => (
            <div
              key={t.id}
              style={{
                fontSize: TYPE_SIZE.xs,
                color: 'var(--text-muted)',
                textDecoration: t.done ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {t.done ? <Check size={11} /> : <Circle size={11} />} {t.text}
            </div>
          ))}
          {extra > 0 && <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>+{extra} more</div>}
        </>
      )}

      {total === 0 && !stage.gate && (
        <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>Nothing here yet</div>
      )}
    </button>
  );
}

// The strip shown alongside an expanded stage: the other stages,
// shrunk to a name and a status colour, wrapping onto as many lines as
// the panel needs. A grid row with a 3fr/1fr split was tried first and
// dropped — at the panel's real width (one of three columns in the
// app, not a full browser tab) it hit its own floor and forced a
// horizontal scrollbar, which is never a "world-class" fix. Wrapping
// never needs a scrollbar at any width.
function MiniStagePill({
  stage,
  isCurrentStage,
  onExpand,
}: {
  stage: JourneyStage;
  isCurrentStage: boolean;
  onExpand: () => void;
}) {
  const color = STAGE_COLOR[stageState(stage, isCurrentStage)];
  return (
    <button
      onClick={onExpand}
      title={`Open ${stage.name}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE.xs,
        maxWidth: 150,
        background: 'var(--surface)',
        border: `1px solid ${color}`,
        borderRadius: RADIUS.pill,
        padding: '4px 8px',
        cursor: 'pointer',
        color: 'var(--text)',
      }}
    >
      <span
        aria-hidden
        style={{
          flex: 'none',
          width: 16,
          height: 16,
          borderRadius: RADIUS.pill,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
          fontSize: TYPE_SIZE.xs,
          fontWeight: TYPE_WEIGHT.bold,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {stage.done ? <Check size={12} /> : stage.stage_index + 1}
      </span>
      <span
        style={{
          fontSize: TYPE_SIZE.xs,
          fontWeight: TYPE_WEIGHT.medium,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {stage.name}
      </span>
    </button>
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
    <div style={{ background: 'var(--surface)', borderRadius: RADIUS.card, padding: 12, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <input
          aria-label="Stage name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (name.trim() !== stage.name || description !== stage.description) && onRename(name, description)}
          style={{ fontWeight: 700, fontSize: 16, border: 'none', background: 'transparent', color: 'var(--text)', flex: 1 }}
        />
        {stage.done && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--success)', fontSize: 12 }}><Check size={12} /> DONE</span>}
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
        <button
          onClick={onToggleGate}
          disabled={!gate.trim()}
          title={gate.trim() ? 'Toggle gate' : 'Write a gate first'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {stage.gate_done ? <Check size={13} /> : <Circle size={13} />}
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
              <button
                onClick={() => onToggleTask(t.id)}
                title="Toggle done"
                style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {t.done ? <Check size={13} /> : <Circle size={13} />}
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
              <button onClick={() => onDeleteTask(t.id)} title="Delete" aria-label="Delete task" style={{ display: 'flex', padding: 4 }}><X size={13} /></button>
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
              <button onClick={() => onDeleteLog(l.id)} title="Delete" aria-label="Delete log entry" style={{ display: 'flex', padding: 4 }}><X size={13} /></button>
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
      <button onClick={onRemove} title="Remove cover image" aria-label="Remove cover image" style={{ position: 'absolute', bottom: 6, right: 6, padding: '4px 8px', display: 'flex' }}>
        <X size={13} />
      </button>
    </div>
  );
}

export default function JourneyPanel() {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [projectKey, setProjectKey] = useState<ProjectKey | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [, setActiveStage] = useState(0);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [toast, setToast] = useState<React.ReactNode | null>(null);
  // Without these, a failed fetch left `order`/`journey` at their empty
  // defaults with nothing catching the rejection — the panel rendered
  // with no visible signal anything had gone wrong (ui-ux-audit verify
  // pass, 2026-09-22).
  const [loadError, setLoadError] = useState(false);

  const refreshOrder = () => projectsApi.order().then(setOrder).catch(() => setLoadError(true));

  useEffect(() => {
    projectsApi
      .order()
      .then((o) => {
        setOrder(o);
        if (o.length) setProjectKey(o[0].project.key);
      })
      .catch(() => setLoadError(true));
  }, []);

  useAutoTimer(projectKey, order, refreshOrder);

  useEffect(() => {
    if (!projectKey) return;
    journeyApi
      .get(projectKey)
      .then((j) => {
        setJourney(j);
        setActiveStage(j.current_stage);
        setExpandedStage(null);
      })
      .catch(() => setLoadError(true));
  }, [projectKey]);

  const apply = (p: Promise<Journey>) =>
    p.then((j) => {
      setJourney(j);
      if (j.event === 'launched') setToast(<><Rocket size={12} /> Launched!</>);
      else if (j.event === 'advanced') setToast('Stage advanced');
      if (j.event) setTimeout(() => setToast(null), 4000);
    });

  if (!journey || !projectKey) return <div>Loading…</div>;

  const activeEntry = order.find((e) => e.project.key === projectKey);

  // CSS Grid, not flexbox, for the collapsed board row: a `1fr` grid
  // track is sized from the AVAILABLE space, not from its content, so
  // all 6 columns come out genuinely equal width without each one
  // fighting its neighbour over its longest task line.
  // auto-fit (not a fixed repeat(N, …)) so a narrow panel wraps extra
  // stages onto a second row instead of forcing a scrollbar — the same
  // "never scroll, always wrap" call made for the expanded view below.
  const boardColumns = 'repeat(auto-fit, minmax(150px, 1fr))';

  return (
    <div style={{ maxWidth: 1200 }}>
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
          Couldn't load the journey — check the app is connected.
          <button
            className="btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => {
              setLoadError(false);
              refreshOrder();
              if (projectKey) journeyApi.get(projectKey).then(setJourney).catch(() => setLoadError(true));
            }}
          >
            Retry
          </button>
        </div>
      )}
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
        {journey.launched && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--success)' }}><Rocket size={12} /> LAUNCHED</span>}
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

      {expandedStage === null ? (
        // Nothing expanded: the full board, every stage as an equal-width
        // column — the "see the whole journey at a glance" view.
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: boardColumns,
            gap: SPACE.md,
            marginBottom: SPACE.lg,
            alignItems: 'start',
          }}
        >
          {journey.stages.map((s) => (
            <StageColumn
              key={s.stage_index}
              stage={s}
              isCurrentStage={s.stage_index === journey.current_stage}
              onExpand={() => {
                setActiveStage(s.stage_index);
                setExpandedStage(s.stage_index);
              }}
            />
          ))}
        </div>
      ) : (
        // One stage expanded: its full editor at a readable width, the
        // other stages shrunk to a wrapping strip of pills underneath —
        // still every stage, still one glance, never a scrollbar.
        <div style={{ marginBottom: SPACE.lg }}>
          <button
            onClick={() => setExpandedStage(null)}
            style={{ fontSize: TYPE_SIZE.xs, marginBottom: SPACE.md, padding: '4px 8px' }}
          >
            ▲ Collapse
          </button>
          {journey.stages
            .filter((s) => s.stage_index === expandedStage)
            .map((s) => (
              <div key={s.stage_index} style={{ maxWidth: 640 }}>
              <StageDetail
                stage={s}
                isCurrent={s.stage_index === journey.current_stage}
                onRename={(name, description) => apply(journeyApi.updateStageMeta(projectKey, s.stage_index, { name, description }))}
                onSetGate={(gate) => apply(journeyApi.setGate(projectKey, s.stage_index, gate))}
                onToggleGate={() => apply(journeyApi.toggleGate(projectKey, s.stage_index))}
                onAddTask={(text) => apply(journeyApi.addTask(projectKey, s.stage_index, text))}
                onToggleTask={(id) => apply(journeyApi.toggleTask(id))}
                onEditTask={(id, text) => apply(journeyApi.editTask(id, text))}
                onDeleteTask={(id) => apply(journeyApi.deleteTask(id))}
                onAddLog={(text) => apply(journeyApi.addLog(projectKey, s.stage_index, text))}
                onCycleLog={(id) => apply(journeyApi.cycleLog(id))}
                onDeleteLog={(id) => apply(journeyApi.deleteLog(id))}
              />
              </div>
            ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md }}>
            {journey.stages
              .filter((s) => s.stage_index !== expandedStage)
              .map((s) => (
                <MiniStagePill
                  key={s.stage_index}
                  stage={s}
                  isCurrentStage={s.stage_index === journey.current_stage}
                  onExpand={() => {
                    setActiveStage(s.stage_index);
                    setExpandedStage(s.stage_index);
                  }}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
