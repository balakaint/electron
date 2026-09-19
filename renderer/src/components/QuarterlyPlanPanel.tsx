import { useEffect, useRef, useState } from 'react';
import { Q90Area, Q90MajorChange, Q90Panel, Q90Status, quarterlyApi } from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { RADIUS, SPACE } from '../spacing';

// V2 "112-DAY TRANSFORMATION BOARD" — from Zahid's own detailed
// developer spec. The old 3-field form (Outcome / weekly Action /
// If-then) is replaced by a 7-step sequence per area, matching the
// spec's own conceptual model:
//
//   WHERE I AM -> WHERE I WANT TO GO -> THE GAP -> MAJOR CHANGES ->
//   WEEKLY EXECUTION -> RECOVERY -> RECALIBRATION
//
// This is NOT a bigger form — each step is one compact field or a
// short list, the accordion stays one page, and status is computed
// from what's actually there (engine.quarterly.compute_status), never
// stored or hand-set. See engine/quarterly.py for the field-by-field
// mapping and the status precedence.

function AutoGrowField({
  value,
  minRows,
  onSave,
  placeholder,
}: {
  value: string;
  minRows: number;
  onSave: (v: string) => void;
  placeholder?: string;
}) {
  const f = useAutosave(value, onSave);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [f.value]);

  return (
    <textarea
      ref={ref}
      value={f.value}
      onChange={(e) => f.setValue(e.target.value)}
      onBlur={f.flush}
      rows={minRows}
      placeholder={placeholder}
      style={{
        width: '100%',
        // Bumped from 13/normal to 14/600 — Zahid's own call ("more
        // energetic to see"): the typed content is what actually
        // matters in each step, and at the old weight it read fainter
        // than the all-caps step labels sitting right above it.
        fontSize: 14,
        fontWeight: 600,
        padding: SPACE.sm,
        boxSizing: 'border-box',
        resize: 'none',
        overflow: 'hidden',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.control,
        background: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'inherit',
        lineHeight: 1.45,
        ...savedFlashStyle(f.state),
      }}
    />
  );
}

function StepLabel({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: SPACE.xs }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)' }}>
        {n} · {title.toUpperCase()}
      </div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

const PRESETS = [30, 60, 90];
const CYCLE_MIN = 7;
const CYCLE_MAX = 365;

const STATUS_META: Record<Q90Status, { label: string; color: string }> = {
  not_started: { label: 'NOT STARTED', color: 'var(--text-faint)' },
  defined: { label: 'DEFINED', color: 'var(--text-muted)' },
  planned: { label: 'PLANNED', color: 'var(--accent)' },
  active: { label: 'ACTIVE', color: 'var(--warning)' },
  proven: { label: 'PROVEN', color: 'var(--success)' },
};

function StatusBadge({ status }: { status: Q90Status }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
        padding: '2px 8px',
        borderRadius: RADIUS.pill,
        color: meta.color,
        border: `1px solid ${meta.color}`,
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
    </span>
  );
}

function clip(text: string, max: number): string {
  const collapsed = text.split(/\s+/).filter(Boolean).join(' ');
  if (!collapsed) return '';
  return collapsed.length > max ? collapsed.slice(0, max - 1) + '…' : collapsed;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function CycleEditor({ panel, onSet, onClose }: { panel: Q90Panel; onSet: (start: string, days: number) => void; onClose: () => void }) {
  // UNCHANGED by the V2 rewrite — Zahid's spec doesn't touch cycle
  // length/anchor semantics at all, only the per-area answer shape.
  const [len, setLen] = useState(String(panel.cycle_days));
  const [start, setStart] = useState(panel.cycle_start);

  const submit = () => {
    const n = Math.max(CYCLE_MIN, Math.min(CYCLE_MAX, parseInt(len, 10) || 90));
    onSet(start, n);
    onClose();
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: SPACE.md, marginBottom: SPACE.md, background: 'var(--surface)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: SPACE.sm }}>HOW LONG IS ONE CYCLE?</div>
      <div style={{ display: 'flex', gap: SPACE.sm, marginBottom: SPACE.sm, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setLen(String(p))}
            style={{
              fontSize: 12,
              padding: '4px 12px',
              background: String(p) === len ? 'var(--accent)' : undefined,
              borderColor: String(p) === len ? 'var(--accent)' : undefined,
              color: String(p) === len ? 'var(--on-accent)' : undefined,
            }}
          >
            {p}
          </button>
        ))}
        <input
          type="number"
          value={len}
          onChange={(e) => setLen(e.target.value)}
          min={CYCLE_MIN}
          max={CYCLE_MAX}
          style={{ width: 70, fontSize: 12, padding: 4 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>days</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: SPACE.sm }}>STARTS ON</div>
      <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: 12, padding: 4 }} />
        <button onClick={submit} style={{ fontSize: 12, fontWeight: 700 }}>
          Set cycle
        </button>
        <button onClick={onClose} style={{ fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function MajorChangesEditor({ changes, onSave }: { changes: Q90MajorChange[]; onSave: (changes: Q90MajorChange[]) => void }) {
  // Local draft so typing in a not-yet-saved row doesn't round-trip on
  // every keystroke; commits the whole array on blur/toggle/remove —
  // matches the "whole-array replace" shape of the backend endpoint.
  const [rows, setRows] = useState(changes);
  useEffect(() => setRows(changes), [changes]);

  const commit = (next: Q90MajorChange[]) => {
    setRows(next);
    onSave(next);
  };

  return (
    <div>
      {rows.map((c, i) => (
        <div key={c.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.xs }}>
          <input
            type="checkbox"
            checked={c.done}
            onChange={(e) => commit(rows.map((r, ri) => (ri === i ? { ...r, done: e.target.checked } : r)))}
          />
          <input
            value={c.text}
            onChange={(e) => setRows(rows.map((r, ri) => (ri === i ? { ...r, text: e.target.value } : r)))}
            onBlur={() => commit(rows)}
            placeholder="A change that has to actually happen — not a wish"
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              padding: '4px 8px',
              textDecoration: c.done ? 'line-through' : undefined,
              color: c.done ? 'var(--text-faint)' : 'var(--text)',
            }}
          />
          <button
            onClick={() => commit(rows.filter((_, ri) => ri !== i))}
            title="Remove"
            style={{ fontSize: 12, padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      ))}
      {rows.length < 5 && (
        <button
          onClick={() => setRows([...rows, { id: 0, text: '', done: false }])}
          style={{ fontSize: 12, padding: '2px 8px', background: 'transparent' }}
        >
          + add a change
        </button>
      )}
    </div>
  );
}

function ChangeGoalPanel({
  currentDestination,
  onConfirm,
  onCancel,
}: {
  currentDestination: string;
  onConfirm: (newDestination: string, reason: string, evidence: string) => void;
  onCancel: () => void;
}) {
  const [dest, setDest] = useState('');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');

  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: RADIUS.control, padding: SPACE.sm, marginTop: SPACE.xs }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: SPACE.xs }}>
        Replacing: <span style={{ color: 'var(--text)' }}>{currentDestination || '—'}</span>
      </div>
      <input
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        placeholder="The new destination"
        style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '4px 8px', marginBottom: SPACE.xs, boxSizing: 'border-box' }}
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is it changing?"
        style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '4px 8px', marginBottom: SPACE.xs, boxSizing: 'border-box' }}
      />
      <input
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        placeholder="What evidence made this clear? (optional)"
        style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '4px 8px', marginBottom: SPACE.sm, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: SPACE.sm }}>
        <button
          disabled={!dest.trim()}
          onClick={() => onConfirm(dest.trim(), reason.trim(), evidence.trim())}
          style={{ fontSize: 12, fontWeight: 700 }}
        >
          Confirm new goal
        </button>
        <button onClick={onCancel} style={{ fontSize: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AreaAccordion({
  area,
  isOpen,
  onToggle,
  onSaveField,
  onSaveMajorChanges,
  onSetAchieved,
  onChangeGoal,
  onChangeStrategy,
}: {
  area: Q90Area;
  isOpen: boolean;
  onToggle: () => void;
  onSaveField: (field: string, text: string) => void;
  onSaveMajorChanges: (changes: Q90MajorChange[]) => void;
  onSetAchieved: (achieved: boolean) => void;
  onChangeGoal: (newDestination: string, reason: string, evidence: string) => void;
  onChangeStrategy: () => void;
}) {
  const [changingGoal, setChangingGoal] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: RADIUS.card,
        marginBottom: SPACE.sm,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          width: '100%',
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          border: 'none',
          borderRadius: 0,
          cursor: 'pointer',
          background: 'var(--surface)',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-faint)', width: 12 }}>{isOpen ? '▾' : '▸'}</span>
        <span style={{ fontSize: 14 }}>{area.glyph}</span>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{area.label}</span>
        {!isOpen && area.destination && (
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{clip(area.destination, 40)}</span>
        )}
        <StatusBadge status={area.status} />
      </button>
      {isOpen && (
        <div style={{ padding: `${SPACE.xs}px ${SPACE.md}px ${SPACE.md}px` }}>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: `0 0 ${SPACE.md}px` }}>{area.description}</p>

          <div style={{ marginBottom: SPACE.md }}>
            <StepLabel n={1} title="Where I am" hint="The current reality — a number or a fact, not a feeling." />
            <AutoGrowField value={area.current_reality} minRows={2} onSave={(v) => onSaveField('current_reality', v)} />
          </div>

          <div style={{ marginBottom: SPACE.md }}>
            <StepLabel n={2} title="Where I want to go" hint="The destination, and how you'll know it's real." />
            <AutoGrowField
              value={area.destination}
              minRows={2}
              onSave={(v) => onSaveField('destination', v)}
              placeholder="The destination"
            />
            <div style={{ marginTop: SPACE.xs, display: 'flex', gap: SPACE.sm, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <AutoGrowField
                  value={area.proof}
                  minRows={1}
                  onSave={(v) => onSaveField('proof', v)}
                  placeholder="Proof — what shows this actually happened"
                />
              </div>
              <button
                onClick={() => onSetAchieved(!area.achieved)}
                title={area.achieved ? 'Marked achieved' : 'Mark as achieved'}
                style={{
                  fontSize: 12,
                  padding: '4px 12px',
                  whiteSpace: 'nowrap',
                  color: area.achieved ? 'var(--success)' : 'var(--text-faint)',
                  borderColor: area.achieved ? 'var(--success)' : undefined,
                }}
              >
                {area.achieved ? '✓ achieved' : 'mark achieved'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: SPACE.md }}>
            <StepLabel n={3} title="The gap" hint="What stands between where I am and where I'm going." />
            <AutoGrowField value={area.gap} minRows={2} onSave={(v) => onSaveField('gap', v)} />
          </div>

          <div style={{ marginBottom: SPACE.md }}>
            <StepLabel n={4} title="Major changes" hint="Up to 5. Things that have to actually change, not tasks." />
            <MajorChangesEditor changes={area.major_changes} onSave={onSaveMajorChanges} />
          </div>

          <div style={{ marginBottom: SPACE.md }}>
            <StepLabel n={5} title="Weekly lead behavior" hint="The ONE thing you repeat every week, on your worst week too." />
            <AutoGrowField value={area.weekly_lead_behavior} minRows={2} onSave={(v) => onSaveField('weekly_lead_behavior', v)} />
          </div>

          <div style={{ marginBottom: SPACE.md }}>
            <StepLabel n={6} title="When the plan breaks" hint="Name what usually stops you, and decide the answer now." />
            <div style={{ display: 'flex', gap: SPACE.sm }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 2 }}>IF</div>
                <AutoGrowField value={area.obstacle_if} minRows={2} onSave={(v) => onSaveField('obstacle_if', v)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 2 }}>THEN</div>
                <AutoGrowField value={area.response_then} minRows={2} onSave={(v) => onSaveField('response_then', v)} />
              </div>
            </div>
          </div>

          <div>
            <StepLabel n={7} title="Review & recalibrate" />
            {!changingGoal ? (
              <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                <button style={{ fontSize: 12, padding: '4px 12px' }} title="Nothing to change — still the right goal">
                  Keep goal
                </button>
                <button onClick={onChangeStrategy} style={{ fontSize: 12, padding: '4px 12px' }} title="Same goal, clear the gap / major changes / weekly behavior and re-plan">
                  Change strategy
                </button>
                <button onClick={() => setChangingGoal(true)} style={{ fontSize: 12, padding: '4px 12px' }} title="The destination itself is wrong — replace it">
                  Change goal
                </button>
                {area.goal_version > 1 && (
                  <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>
                    v{area.goal_version} · {area.goal_history.length} earlier goal{area.goal_history.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            ) : (
              <ChangeGoalPanel
                currentDestination={area.destination}
                onCancel={() => setChangingGoal(false)}
                onConfirm={(dest, reason, evidence) => {
                  onChangeGoal(dest, reason, evidence);
                  setChangingGoal(false);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuarterlyPlanPanel() {
  const [panel, setPanel] = useState<Q90Panel | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [editingCycle, setEditingCycle] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  const refresh = () => quarterlyApi.getPanel().then(setPanel);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (panel && !autoOpened) {
      // Open the first area that isn't even defined yet — the next
      // thing to do, rather than always the first row.
      const first = panel.areas.find((a) => a.status === 'not_started');
      setOpenArea(first ? first.key : panel.areas[0].key);
      setAutoOpened(true);
    }
  }, [panel, autoOpened]);

  if (!panel) return <div>Loading…</div>;

  const when =
    panel.day === 0
      ? `starts in ${panel.days_left - panel.cycle_days} days`
      : `day ${panel.day} of ${panel.cycle_days}, ${panel.days_left} left`;

  const timePct = Math.min(100, Math.round((panel.day / panel.cycle_days) * 100));
  const areasPct = panel.areas_total ? Math.round((panel.areas_done / panel.areas_total) * 100) : 0;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SPACE.hair }}>
        <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 0.5 }}>{panel.cycle_days}-DAY TRANSFORMATION</h2>
        <button
          onClick={() => setEditingCycle((v) => !v)}
          style={{ fontSize: 12, opacity: 0.7, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}
          title="Change the start date or the length"
        >
          {formatDate(panel.cycle_start)} → {formatDate(panel.cycle_end)} ✎
        </button>
      </div>

      {editingCycle && (
        <CycleEditor
          panel={panel}
          onClose={() => setEditingCycle(false)}
          onSet={(start, days) => quarterlyApi.setCycle(start, days).then(setPanel)}
        />
      )}

      <div style={{ display: 'flex', gap: SPACE.lg, marginBottom: SPACE.lg }}>
        <div style={{ flex: 1 }} title={when}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>
            <span>TIME</span>
            <span>{when}</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: RADIUS.pill, overflow: 'hidden' }}>
            <div style={{ width: `${timePct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>
            <span>AREAS PROVEN</span>
            <span>
              {panel.areas_done}/{panel.areas_total}
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: RADIUS.pill, overflow: 'hidden' }}>
            <div style={{ width: `${areasPct}%`, height: '100%', background: 'var(--success)' }} />
          </div>
        </div>
      </div>

      {panel.areas.map((area) => (
        <AreaAccordion
          key={area.key}
          area={area}
          isOpen={openArea === area.key}
          onToggle={() => setOpenArea(openArea === area.key ? null : area.key)}
          onSaveField={(field, text) => quarterlyApi.setField(area.key, field as any, text).then(refresh)}
          onSaveMajorChanges={(changes) => quarterlyApi.setMajorChanges(area.key, changes).then(refresh)}
          onSetAchieved={(achieved) => quarterlyApi.setAchieved(area.key, achieved).then(refresh)}
          onChangeGoal={(dest, reason, evidence) => quarterlyApi.changeGoal(area.key, dest, reason, evidence).then(refresh)}
          onChangeStrategy={() => quarterlyApi.changeStrategy(area.key).then(refresh)}
        />
      ))}
    </div>
  );
}
