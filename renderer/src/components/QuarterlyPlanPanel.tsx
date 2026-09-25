import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Pencil, Star, X } from 'lucide-react';
import { Q90Area, Q90AreaKey, Q90MajorChange, Q90Panel, Q90Status, quarterlyApi } from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// The Transformation page (2026-09-25 redesign, from Zahid's approved
// mockup). Same 7-step data model and the same engine.quarterly
// compute_status precedence as before; what changed is how it reads:
//   - a day grid for the cycle, so "Day 4 of 30" is a place, not a bar;
//   - ONE starred focus area on top (the page's own promise is "turn one
//     area into a result"), with where-I-am → where-I'm-going, the status
//     ladder and the single next step to take;
//   - every row says how far it got (step dots + a coloured status chip);
//   - an open area shows its steps straight away, the next unfilled one
//     marked, plus a weekly check of the routine (W1, W2, …).

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
        fontSize: TYPE_SIZE.base,
        fontWeight: TYPE_WEIGHT.medium,
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

// Single-line autosave input for the area's own name — same autosave/
// flash behavior as AutoGrowField, just one row and bold, since this is
// a title, not a paragraph. Only rendered while the area is in Edit
// mode (see AreaAccordion): renaming the area is a "little modify"
// action the user reaches for rarely, not a control that should sit in
// the way of the daily read-only glance.
function LabelField({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const f = useAutosave(value, onSave);
  return (
    <input
      value={f.value}
      onChange={(e) => f.setValue(e.target.value)}
      onBlur={f.flush}
      placeholder={placeholder}
      style={{
        width: '100%',
        fontSize: TYPE_SIZE.md,
        fontWeight: TYPE_WEIGHT.bold,
        padding: '4px 8px',
        boxSizing: 'border-box',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.control,
        background: 'var(--surface)',
        color: 'var(--text)',
        fontFamily: 'inherit',
        ...savedFlashStyle(f.state),
      }}
    />
  );
}

// The one numbered badge style for every step: a plain circle, a check
// once the step has content, and the next step to fill ringed in the
// area's colour.
function StepBadge({ n, done, current, color }: { n: number; done: boolean; current: boolean; color: string }) {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        flex: 'none',
        boxSizing: 'border-box',
        borderRadius: RADIUS.pill,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: TYPE_SIZE.sm,
        fontWeight: TYPE_WEIGHT.bold,
        background: done ? color : 'var(--surface)',
        color: done ? 'var(--on-accent)' : current ? color : 'var(--text-muted)',
        border: `1.5px solid ${done || current ? color : 'var(--border)'}`,
      }}
    >
      {done ? <Check size={14} strokeWidth={3} /> : n}
    </div>
  );
}

function Step({
  id,
  n,
  done,
  current,
  color,
  title,
  hint,
  children,
}: {
  id: string;
  n: number;
  done: boolean;
  current: boolean;
  color: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} style={{ display: 'flex', gap: SPACE.md, scrollMarginTop: SPACE.lg }}>
      <StepBadge n={n} done={done} current={current} color={color} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <div style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text)' }}>
          {title}
          {hint && <span style={{ fontWeight: TYPE_WEIGHT.normal, color: 'var(--text-muted)' }}> · {hint}</span>}
          {current && <span style={{ fontWeight: TYPE_WEIGHT.bold, color }}> · write this next</span>}
        </div>
        {children}
      </div>
    </div>
  );
}

const PRESETS = [30, 60, 90];
const CYCLE_MIN = 7;
const CYCLE_MAX = 365;

// A little colour per area, not a rainbow: one glyph-sized hint of
// identity, from the theme's own --habit-* tokens.
const AREA_COLOR_VAR: Record<Q90AreaKey, string> = {
  appearance: '--habit-appearance',
  money: '--habit-money',
  relationship: '--habit-relation',
  health: '--habit-health',
  social: '--habit-social',
  mind: '--habit-mind',
};
const areaColor = (key: Q90AreaKey) => `var(${AREA_COLOR_VAR[key]})`;

// Status, in the order compute_status climbs it.
const STATUS_ORDER: Q90Status[] = ['not_started', 'defined', 'planned', 'active', 'proven'];
const STATUS_STYLE: Record<Q90Status, { label: string; fg: string }> = {
  not_started: { label: 'Not started', fg: 'var(--text-muted)' },
  defined: { label: 'Defined', fg: 'var(--accent)' },
  planned: { label: 'Planned', fg: 'var(--habit-mind)' },
  active: { label: 'Active', fg: 'var(--warning)' },
  proven: { label: 'Proven', fg: 'var(--success)' },
};

function StatusChip({ status }: { status: Q90Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        fontSize: TYPE_SIZE.xs,
        fontWeight: TYPE_WEIGHT.bold,
        padding: `${SPACE.hair}px ${SPACE.sm}px`,
        borderRadius: RADIUS.pill,
        whiteSpace: 'nowrap',
        color: s.fg,
        background: status === 'not_started' ? 'var(--surface-2)' : `color-mix(in srgb, ${s.fg} 14%, var(--surface))`,
      }}
    >
      {s.label}
    </span>
  );
}

// Which of the seven steps have content: 1 where I am, 2 where I'm
// going, 3 the gap, 4 key changes, 5 routine, 6 if/then, 7 proven.
function stepsDone(a: Q90Area): boolean[] {
  return [
    !!a.current_reality.trim(),
    !!a.destination.trim(),
    !!a.gap.trim(),
    a.major_changes.some((c) => c.text.trim()),
    !!a.weekly_lead_behavior.trim(),
    !!a.obstacle_if.trim() && !!a.response_then.trim(),
    a.status === 'proven',
  ];
}

// The one thing to do next in an area, and the step it lives in (null
// when there's nothing to fill — only the weekly tick or the proof).
function nextStep(a: Q90Area, currentWeek: number): { step: number | null; text: string } {
  const d = stepsDone(a);
  const lines = [
    'Write where you are now, as a number or a fact.',
    "Set where you're going by the end of the cycle.",
    "Name what's in the way.",
    'List the key changes that have to happen.',
    "Pick the one routine you'll repeat every week.",
    'Decide what you will do when you get stuck.',
  ];
  const i = d.slice(0, 6).indexOf(false);
  if (i >= 0) return { step: i + 1, text: `${lines[i]} (step ${i + 1})` };
  if (a.status === 'proven') return { step: null, text: 'Proven. Review it, then plan the next cycle.' };
  if (currentWeek > 0 && !a.week_checks.includes(currentWeek)) {
    return { step: null, text: `Tick week ${currentWeek} once this week's routine has happened.` };
  }
  if (!a.proof.trim()) return { step: 2, text: 'Write what will prove it happened (step 2).' };
  return { step: 2, text: 'Keep going. Mark it achieved when the proof is in (step 2).' };
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
  const [len, setLen] = useState(String(panel.cycle_days));
  const [start, setStart] = useState(panel.cycle_start);

  const submit = () => {
    const n = Math.max(CYCLE_MIN, Math.min(CYCLE_MAX, parseInt(len, 10) || 90));
    onSet(start, n);
    onClose();
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: RADIUS.card, padding: SPACE.md, marginBottom: SPACE.md, background: 'var(--surface)' }}>
      <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginBottom: SPACE.sm }}>HOW LONG IS ONE CYCLE?</div>
      <div style={{ display: 'flex', gap: SPACE.sm, marginBottom: SPACE.sm, flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setLen(String(p))}
            style={{
              fontSize: TYPE_SIZE.xs,
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
          style={{ width: 70, fontSize: TYPE_SIZE.xs, padding: 4 }}
        />
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', alignSelf: 'center' }}>days</span>
      </div>
      <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginBottom: SPACE.sm }}>STARTS ON</div>
      <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ fontSize: TYPE_SIZE.xs, padding: 4 }} />
        <button onClick={submit} style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold }}>
          Set cycle
        </button>
        <button onClick={onClose} style={{ fontSize: TYPE_SIZE.xs }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function MajorChangesEditor({ changes, onSave }: { changes: Q90MajorChange[]; onSave: (changes: Q90MajorChange[]) => void }) {
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
              fontSize: TYPE_SIZE.sm,
              fontWeight: TYPE_WEIGHT.medium,
              padding: '4px 8px',
              textDecoration: c.done ? 'line-through' : undefined,
              color: c.done ? 'var(--text-faint)' : 'var(--text)',
            }}
          />
          <button
            onClick={() => commit(rows.filter((_, ri) => ri !== i))}
            aria-label={c.text.trim() ? `Remove change: ${c.text}` : 'Remove change'}
            title="Remove"
            style={{ padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {rows.length < 5 && (
        <button
          onClick={() => setRows([...rows, { id: 0, text: '', done: false }])}
          style={{ fontSize: TYPE_SIZE.xs, padding: '2px 8px', background: 'transparent' }}
        >
          + Add a change
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
      <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginBottom: SPACE.xs }}>
        Replacing: <span style={{ color: 'var(--text)' }}>{currentDestination || '—'}</span>
      </div>
      <label htmlFor="change-goal-dest" style={{ display: 'block', fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>
        New destination
      </label>
      <input
        id="change-goal-dest"
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        placeholder="The new destination"
        style={{ width: '100%', fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium, padding: '4px 8px', marginBottom: SPACE.xs, boxSizing: 'border-box' }}
      />
      <label htmlFor="change-goal-reason" style={{ display: 'block', fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>
        Reason for changing
      </label>
      <input
        id="change-goal-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is it changing?"
        style={{ width: '100%', fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium, padding: '4px 8px', marginBottom: SPACE.xs, boxSizing: 'border-box' }}
      />
      <label htmlFor="change-goal-evidence" style={{ display: 'block', fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>
        Evidence (optional)
      </label>
      <input
        id="change-goal-evidence"
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        placeholder="What evidence made this clear?"
        style={{ width: '100%', fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium, padding: '4px 8px', marginBottom: SPACE.sm, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: SPACE.sm }}>
        <button
          disabled={!dest.trim()}
          onClick={() => onConfirm(dest.trim(), reason.trim(), evidence.trim())}
          style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold }}
        >
          Confirm new goal
        </button>
        <button onClick={onCancel} style={{ fontSize: TYPE_SIZE.xs }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function WeekChecks({
  area,
  weeksTotal,
  currentWeek,
  onToggle,
}: {
  area: Q90Area;
  weeksTotal: number;
  currentWeek: number;
  onToggle: (week: number, done: boolean) => void;
}) {
  const color = areaColor(area.key);
  const noRoutine = !area.weekly_lead_behavior.trim();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, flexWrap: 'wrap', paddingTop: SPACE.md, borderTop: '1px dashed var(--border)' }}>
      <span style={{ flex: '1 1 160px', fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
        {noRoutine ? 'Weekly check: set your routine in step 5 first.' : 'Weekly check: did the routine happen?'}
      </span>
      {Array.from({ length: weeksTotal }, (_, i) => i + 1).map((w) => {
        const on = area.week_checks.includes(w);
        const future = w > currentWeek;
        return (
          <button
            key={w}
            disabled={future || noRoutine}
            aria-pressed={on}
            onClick={() => onToggle(w, !on)}
            title={future ? "This week hasn't started yet" : on ? `Week ${w}: done` : `Mark week ${w} done`}
            style={{
              minWidth: 44,
              height: 28,
              padding: `0 ${SPACE.xs}px`,
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
              borderRadius: RADIUS.control,
              border: `1px solid ${on ? color : 'var(--border)'}`,
              background: on ? color : 'var(--surface)',
              color: on ? 'var(--on-accent)' : future ? 'var(--text-faint)' : 'var(--text)',
              cursor: future || noRoutine ? 'default' : 'pointer',
            }}
          >
            W{w}
            {on ? ' ✓' : ''}
          </button>
        );
      })}
    </div>
  );
}

function AreaAccordion({
  area,
  isOpen,
  isFocus,
  weeksTotal,
  currentWeek,
  onToggle,
  onStar,
  onMove,
  onSaveField,
  onSaveMajorChanges,
  onSetAchieved,
  onChangeGoal,
  onChangeStrategy,
  onSaveMeta,
  onWeek,
}: {
  area: Q90Area;
  isOpen: boolean;
  isFocus: boolean;
  weeksTotal: number;
  currentWeek: number;
  onToggle: () => void;
  onStar: () => void;
  onMove: (direction: -1 | 1) => void;
  onSaveField: (field: string, text: string) => void;
  onSaveMajorChanges: (changes: Q90MajorChange[]) => void;
  onSetAchieved: (achieved: boolean) => void;
  onChangeGoal: (newDestination: string, reason: string, evidence: string) => void;
  onChangeStrategy: () => void;
  onSaveMeta: (field: 'label' | 'description', text: string) => void;
  onWeek: (week: number, done: boolean) => void;
}) {
  const [changingGoal, setChangingGoal] = useState(false);
  const [confirmingStrategy, setConfirmingStrategy] = useState(false);
  const [justKept, setJustKept] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const color = areaColor(area.key);
  const done = stepsDone(area);
  const current = done.slice(0, 6).indexOf(false) + 1; // 0 = every step filled
  const sid = (n: number) => `q90-${area.key}-step-${n}`;

  return (
    <div
      style={{
        border: `1px solid ${isFocus || isOpen ? color : 'var(--border)'}`,
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, padding: `${SPACE.xs}px ${SPACE.sm}px` }}>
        <button
          onClick={onStar}
          aria-pressed={isFocus}
          aria-label={isFocus ? `${area.label} is this cycle's focus` : `Make ${area.label} this cycle's focus`}
          title={isFocus ? "This cycle's focus" : "Make this the cycle's focus"}
          style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isFocus ? color : 'var(--text-faint)', cursor: 'pointer' }}
        >
          <Star size={16} fill={isFocus ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={onToggle}
          onKeyDown={(e) => {
            // Keyboard reorder, the equivalent of dragging the row.
            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault();
              onMove(e.key === 'ArrowUp' ? -1 : 1);
            }
          }}
          aria-expanded={isOpen}
          title="Open · drag, or Alt+↑/↓, to reorder"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.sm,
            padding: `${SPACE.xs}px 0`,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ width: 20, textAlign: 'center', fontSize: TYPE_SIZE.base, color }}>{area.glyph}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{area.label}</span>
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {area.destination.trim() ? clip(area.destination, 60) : 'No destination yet'}
            </span>
          </span>
          <span title={`${done.filter(Boolean).length} of 7 steps`} style={{ display: 'flex', gap: SPACE.hair, flex: 'none' }}>
            {done.map((d, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: d ? color : 'var(--border)' }} />
            ))}
          </span>
          <StatusChip status={area.status} />
          <span style={{ color: 'var(--text-faint)', display: 'flex' }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        </button>
      </div>

      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.sm }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {renaming ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                  <LabelField value={area.label} onSave={(v) => onSaveMeta('label', v)} placeholder="Area name" />
                  <AutoGrowField value={area.description} minRows={1} onSave={(v) => onSaveMeta('description', v)} placeholder="What this area means to you" />
                </div>
              ) : (
                <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>{area.description}</div>
              )}
            </div>
            <button onClick={() => setRenaming((v) => !v)} style={{ fontSize: TYPE_SIZE.xs, padding: `${SPACE.xs}px ${SPACE.sm}px`, display: 'inline-flex', alignItems: 'center', gap: SPACE.xs, whiteSpace: 'nowrap' }}>
              {renaming ? 'Done' : <><Pencil size={12} /> Rename</>}
            </button>
          </div>

          <Step id={sid(1)} n={1} done={done[0]} current={current === 1} color={color} title="Where I am now" hint="a number or a fact, not a feeling">
            <AutoGrowField value={area.current_reality} minRows={1} onSave={(v) => onSaveField('current_reality', v)} />
          </Step>

          <Step id={sid(2)} n={2} done={done[1]} current={current === 2} color={color} title="Where I'm going" hint="and how you'll prove it">
            <AutoGrowField value={area.destination} minRows={1} onSave={(v) => onSaveField('destination', v)} placeholder="The destination" />
            <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <AutoGrowField value={area.proof} minRows={1} onSave={(v) => onSaveField('proof', v)} placeholder="What will prove this actually happened" />
              </div>
              <button
                onClick={() => onSetAchieved(!area.achieved)}
                title={area.achieved ? 'Marked achieved' : 'Mark as achieved'}
                style={{
                  fontSize: TYPE_SIZE.xs,
                  padding: `${SPACE.xs}px ${SPACE.md}px`,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: SPACE.xs,
                  color: area.achieved ? 'var(--success)' : 'var(--text-muted)',
                  borderColor: area.achieved ? 'var(--success)' : undefined,
                }}
              >
                {area.achieved ? <><Check size={12} /> achieved</> : 'mark achieved'}
              </button>
            </div>
          </Step>

          <Step id={sid(3)} n={3} done={done[2]} current={current === 3} color={color} title="What's in the way" hint="the gap">
            <AutoGrowField value={area.gap} minRows={1} onSave={(v) => onSaveField('gap', v)} />
          </Step>

          <Step id={sid(4)} n={4} done={done[3]} current={current === 4} color={color} title="Key changes" hint="up to 5, not tasks">
            <MajorChangesEditor changes={area.major_changes} onSave={onSaveMajorChanges} />
          </Step>

          <Step id={sid(5)} n={5} done={done[4]} current={current === 5} color={color} title="My routine" hint="the ONE thing you repeat every week">
            <AutoGrowField value={area.weekly_lead_behavior} minRows={1} onSave={(v) => onSaveField('weekly_lead_behavior', v)} />
          </Step>

          <Step id={sid(6)} n={6} done={done[5]} current={current === 6} color={color} title="If I get stuck" hint="decide the answer now">
            <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>IF</div>
                <AutoGrowField value={area.obstacle_if} minRows={1} onSave={(v) => onSaveField('obstacle_if', v)} />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)', marginBottom: SPACE.hair }}>THEN</div>
                <AutoGrowField value={area.response_then} minRows={1} onSave={(v) => onSaveField('response_then', v)} />
              </div>
            </div>
          </Step>

          <Step id={sid(7)} n={7} done={done[6]} current={false} color={color} title="Still the plan?" hint="review before the cycle ends">
            {changingGoal ? (
              <ChangeGoalPanel
                currentDestination={area.destination}
                onCancel={() => setChangingGoal(false)}
                onConfirm={(dest, reason, evidence) => {
                  onChangeGoal(dest, reason, evidence);
                  setChangingGoal(false);
                }}
              />
            ) : confirmingStrategy ? (
              <div style={{ border: '1px solid var(--warning)', borderRadius: RADIUS.control, padding: SPACE.sm }}>
                <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text)', marginBottom: SPACE.sm }}>
                  Clear the gap, key changes, and weekly routine for <strong>{area.label}</strong>? The destination stays; everything else resets so you can re-plan.
                </div>
                <div style={{ display: 'flex', gap: SPACE.sm }}>
                  <button
                    onClick={() => {
                      onChangeStrategy();
                      setConfirmingStrategy(false);
                    }}
                    style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, color: 'var(--warning)', borderColor: 'var(--warning)' }}
                  >
                    Clear and re-plan
                  </button>
                  <button onClick={() => setConfirmingStrategy(false)} style={{ fontSize: TYPE_SIZE.xs }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    setJustKept(true);
                    setTimeout(() => setJustKept(false), 1200);
                  }}
                  style={{
                    fontSize: TYPE_SIZE.xs,
                    padding: `${SPACE.xs}px ${SPACE.md}px`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: SPACE.xs,
                    color: justKept ? 'var(--success)' : undefined,
                    borderColor: justKept ? 'var(--success)' : undefined,
                  }}
                  title="Nothing to change — still the right goal"
                >
                  {justKept ? <><Check size={12} /> Kept</> : 'Keep goal'}
                </button>
                <button onClick={() => setConfirmingStrategy(true)} style={{ fontSize: TYPE_SIZE.xs, padding: `${SPACE.xs}px ${SPACE.md}px` }} title="Same goal, clear the gap / major changes / weekly behavior and re-plan">
                  Change strategy
                </button>
                <button onClick={() => setChangingGoal(true)} style={{ fontSize: TYPE_SIZE.xs, padding: `${SPACE.xs}px ${SPACE.md}px` }} title="The destination itself is wrong — replace it">
                  Change goal
                </button>
                {area.goal_version > 1 && (
                  <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>
                    v{area.goal_version} · {area.goal_history.length} earlier goal{area.goal_history.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
          </Step>

          <WeekChecks area={area} weeksTotal={weeksTotal} currentWeek={currentWeek} onToggle={onWeek} />
        </div>
      )}
    </div>
  );
}

// The cycle as a grid of days: past days filled, today outlined, the
// rest empty; weeks labelled underneath when the cycle is short enough
// for the labels to fit.
function DayGrid({ panel }: { panel: Q90Panel }) {
  const n = panel.cycle_days;
  const cols = Math.min(n, 30);
  const weekLabels = n <= 35;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: SPACE.hair }}>
        {Array.from({ length: n }, (_, i) => {
          const day = i + 1;
          const past = day < panel.day;
          const today = day === panel.day;
          return (
            <span
              key={i}
              title={`Day ${day}`}
              style={{
                height: 12,
                borderRadius: SPACE.hair,
                background: past ? 'var(--accent)' : today ? 'var(--surface)' : 'var(--surface-2)',
                outline: today ? '2px solid var(--text)' : 'none',
                outlineOffset: -1,
              }}
            />
          );
        })}
      </div>
      {weekLabels && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: SPACE.hair }}>
          {Array.from({ length: Math.ceil(n / 7) }, (_, w) => {
            const span = Math.min(7, n - w * 7);
            return (
              <span key={w} style={{ gridColumn: `span ${span}`, fontSize: TYPE_SIZE.xs, color: w + 1 === panel.current_week ? 'var(--text)' : 'var(--text-muted)', fontWeight: w + 1 === panel.current_week ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {span < 7 ? `+${span}` : `Week ${w + 1}`}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FocusCard({ area, panel, onContinue }: { area: Q90Area; panel: Q90Panel; onContinue: (step: number | null) => void }) {
  const color = areaColor(area.key);
  const at = STATUS_ORDER.indexOf(area.status);
  const next = nextStep(area, panel.current_week);
  return (
    <div style={{ border: `2px solid ${color}`, borderRadius: RADIUS.card, background: 'var(--surface)', padding: SPACE.lg, display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide, color }}>★ THIS CYCLE'S FOCUS</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>Star another area below to switch</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ fontSize: TYPE_SIZE.lg, color }}>{area.glyph}</span>
        <span style={{ fontSize: TYPE_SIZE.lg, fontWeight: TYPE_WEIGHT.bold }}>{area.label}</span>
        <StatusChip status={area.status} />
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: SPACE.sm, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px', background: 'var(--surface-2)', borderRadius: RADIUS.control, padding: SPACE.sm, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>Where I am now</span>
          <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.medium, color: area.current_reality.trim() ? 'var(--text)' : 'var(--text-faint)' }}>
            {area.current_reality.trim() ? clip(area.current_reality, 90) : 'Not written yet'}
          </span>
        </div>
        <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>→</span>
        <div style={{ flex: '1 1 180px', background: 'var(--surface-2)', borderRadius: RADIUS.control, padding: SPACE.sm, display: 'flex', flexDirection: 'column', gap: SPACE.hair }}>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>Where I'm going · by {formatDate(panel.cycle_end)}</span>
          <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold, color: area.destination.trim() ? 'var(--text)' : 'var(--text-faint)' }}>
            {area.destination.trim() ? clip(area.destination, 90) : 'Not set yet'}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>Status moves on as you fill the steps in</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: SPACE.xs }}>
          {STATUS_ORDER.map((st, i) => (
            <div key={st} style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, minWidth: 0 }}>
              <span style={{ height: 6, borderRadius: RADIUS.pill, background: i <= at ? color : 'var(--border)' }} />
              <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: i === at ? TYPE_WEIGHT.bold : TYPE_WEIGHT.normal, color: i <= at ? 'var(--text)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {STATUS_STYLE[st].label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, background: 'var(--accent-light)', borderRadius: RADIUS.control, padding: `${SPACE.sm}px ${SPACE.md}px` }}>
        <span style={{ flex: 1, fontSize: TYPE_SIZE.sm, color: 'var(--text)' }}>
          <b>Next:</b> {next.text}
        </span>
        <button onClick={() => onContinue(next.step)} className="btn-primary" style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, padding: `${SPACE.xs}px ${SPACE.md}px`, whiteSpace: 'nowrap' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}

export default function QuarterlyPlanPanel() {
  const [panel, setPanel] = useState<Q90Panel | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [editingCycle, setEditingCycle] = useState(false);
  // Drag-to-reorder on the rows (collapsed ones only — dragging an open
  // area would fight text selection in its fields). Alt+↑/↓ on a row is
  // the keyboard equivalent.
  const [dragKey, setDragKey] = useState<Q90AreaKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<Q90AreaKey | null>(null);

  const reorder = (targetKey: Q90AreaKey) => {
    if (!panel || !dragKey || dragKey === targetKey) return;
    const keys = panel.areas.map((a) => a.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(targetKey);
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    quarterlyApi.reorderAreas(keys).then(setPanel);
  };

  const moveArea = (key: Q90AreaKey, direction: -1 | 1) => {
    if (!panel) return;
    const keys = panel.areas.map((a) => a.key);
    const from = keys.indexOf(key);
    const to = from + direction;
    if (to < 0 || to >= keys.length) return;
    [keys[from], keys[to]] = [keys[to], keys[from]];
    quarterlyApi.reorderAreas(keys).then(setPanel);
  };

  const refresh = () => quarterlyApi.getPanel().then(setPanel);

  useEffect(() => {
    refresh();
  }, []);

  if (!panel) return <div>Loading…</div>;

  const focus = panel.areas.find((a) => a.key === panel.focus_area) ?? null;
  const started = panel.areas.filter((a) => a.status !== 'not_started').length;

  // Continue: open the focus area and put the cursor in the step to fill.
  const goToStep = (key: Q90AreaKey, step: number | null) => {
    setOpenArea(key);
    setTimeout(() => {
      const el = document.getElementById(step ? `q90-${key}-step-${step}` : `q90-${key}-step-7`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('textarea, input')?.focus();
    }, 60);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SPACE.md, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          <h2 style={{ margin: 0, fontSize: TYPE_SIZE.xl, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text)', lineHeight: 1.15 }}>
            {panel.cycle_days}-Day Transformation
          </h2>
          <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>Turn one area of your life into a measurable {panel.cycle_days}-day result.</div>
        </div>
        <button
          onClick={() => setEditingCycle((v) => !v)}
          style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, padding: `${SPACE.xs}px ${SPACE.sm}px`, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: SPACE.xs }}
          title="Change the start date or the length"
          aria-label="Change the cycle's start date or length"
        >
          {formatDate(panel.cycle_start)} → {formatDate(panel.cycle_end)} · {panel.cycle_days} days
          <Pencil size={12} />
        </button>
      </div>

      {editingCycle && (
        <CycleEditor panel={panel} onClose={() => setEditingCycle(false)} onSet={(start, days) => quarterlyApi.setCycle(start, days).then(setPanel)} />
      )}

      <div className="card-elevated" style={{ border: '1px solid var(--border)', borderRadius: RADIUS.card, background: 'var(--surface)', padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold }}>
            {panel.day === 0 ? `Starts in ${panel.days_left - panel.cycle_days} days` : `Day ${panel.day} of ${panel.cycle_days}`}
          </span>
          {panel.day > 0 && (
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
              Week {panel.current_week} · {panel.days_left} days left
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>Ends {formatDate(panel.cycle_end)}</span>
        </div>
        <DayGrid panel={panel} />
      </div>

      {focus ? (
        <FocusCard area={focus} panel={panel} onContinue={(step) => goToStep(focus.key, step)} />
      ) : (
        <div style={{ border: '1px dashed var(--border)', borderRadius: RADIUS.card, padding: SPACE.md, fontSize: TYPE_SIZE.sm, color: 'var(--text-muted)' }}>
          Pick the one area this cycle is about: press its <Star size={12} style={{ verticalAlign: 'middle' }} /> below. It moves up here with its next step.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.wide }}>ALL {panel.areas_total} AREAS</span>
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)' }}>
          {started} started · {panel.areas_done} proven · drag to reorder
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
        {panel.areas.map((area) => {
          const isOpen = openArea === area.key;
          return (
            <div
              key={area.key}
              draggable={!isOpen}
              onDragStart={() => setDragKey(area.key)}
              onDragOver={(e) => {
                if (!dragKey) return;
                e.preventDefault();
                if (dragOverKey !== area.key) setDragOverKey(area.key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                reorder(area.key);
                setDragKey(null);
                setDragOverKey(null);
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDragOverKey(null);
              }}
              style={{
                cursor: isOpen ? undefined : 'grab',
                opacity: dragKey === area.key ? 0.5 : 1,
                borderTop: dragOverKey === area.key && dragKey && dragKey !== area.key ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <AreaAccordion
                area={area}
                isOpen={isOpen}
                isFocus={panel.focus_area === area.key}
                weeksTotal={panel.weeks_total}
                currentWeek={panel.current_week}
                onToggle={() => setOpenArea(isOpen ? null : area.key)}
                onStar={() => quarterlyApi.setFocus(panel.focus_area === area.key ? null : area.key).then(setPanel)}
                onMove={(d) => moveArea(area.key, d)}
                onSaveField={(field, text) => quarterlyApi.setField(area.key, field as any, text).then(refresh)}
                onSaveMajorChanges={(changes) => quarterlyApi.setMajorChanges(area.key, changes).then(refresh)}
                onSetAchieved={(achieved) => quarterlyApi.setAchieved(area.key, achieved).then(refresh)}
                onChangeGoal={(dest, reason, evidence) => quarterlyApi.changeGoal(area.key, dest, reason, evidence).then(refresh)}
                onChangeStrategy={() => quarterlyApi.changeStrategy(area.key).then(refresh)}
                onSaveMeta={(field, text) => quarterlyApi.setAreaMeta(area.key, field, text).then(refresh)}
                onWeek={(week, done) => quarterlyApi.setWeekCheck(area.key, week, done).then(setPanel)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
