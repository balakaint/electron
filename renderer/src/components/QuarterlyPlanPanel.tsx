import { useEffect, useRef, useState } from 'react';
import { Q90Area, Q90AreaKey, Q90MajorChange, Q90Panel, Q90Status, quarterlyApi } from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE, TYPE_WEIGHT } from '../typography';

// V3 visual pass (Zahid's own developer note, 2026-09-21): same 7-field
// data model and the same engine.quarterly.compute_status precedence as
// before — this only changes how it reads. The note's own complaint was
// information hierarchy, not the underlying steps: "gap" and "proof"
// still have to be real, fillable fields (compute_status requires both
// to ever reach "planned"/"proven"), so they stay as steps of their own
// rather than disappearing — they just lose the framework-y capitalized
// names ("THE GAP", "PROOF") in favor of plain language, and step 7
// (goal versioning) drops from its own numbered step to a quiet footer
// strip, since it's a recalibration tool a user reaches for
// occasionally, not part of the every-area define flow.

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

// The one numbered badge style for every step — a plain circle, one
// accent color, swapping to a check once the step actually has content.
// The old rainbow-per-status pill lived on the area row (below), not
// here, but the note's "single accent, no decoration" rule applies to
// both.
function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        flex: 'none',
        borderRadius: RADIUS.pill,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: TYPE_SIZE.sm,
        fontWeight: TYPE_WEIGHT.bold,
        background: done ? 'color-mix(in srgb, var(--success) 16%, transparent)' : 'var(--accent-light)',
        color: done ? 'var(--success)' : 'var(--accent)',
      }}
    >
      {done ? '✓' : String(n).padStart(2, '0')}
    </div>
  );
}

function StepHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: SPACE.sm }}>
      <h4 style={{ margin: 0, fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text)' }}>{title}</h4>
      {hint && <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-faint)', marginTop: SPACE.hair }}>{hint}</div>}
    </div>
  );
}

// A step is: badge, title/hint, field(s) — no per-step card, just a
// hairline divider above every step but the first. That divider is the
// only structure the note wants between sections.
function Step({ n, done, title, hint, children }: { n: number; done: boolean; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: SPACE.md,
        paddingTop: n === 1 ? 0 : SPACE.lg,
        marginTop: n === 1 ? 0 : SPACE.lg,
        borderTop: n === 1 ? 'none' : '1px solid var(--border)',
      }}
    >
      <StepBadge n={n} done={done} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <StepHeader title={title} hint={hint} />
        {children}
      </div>
    </div>
  );
}

const PRESETS = [30, 60, 90];
const CYCLE_MIN = 7;
const CYCLE_MAX = 365;

// A little color, not a rainbow — Zahid's own ask (2026-09-21): one
// glyph-sized hint of identity per area, not a wholesale departure
// from the app's "one accent, locked" rule (RADIUS/SPACE/TYPE_SIZE all
// get the same one-scale treatment). --habit-money/health/mind already
// existed for HabitDashboard.tsx's 4 categories; --habit-appearance/
// social are new alongside them (themes.ts has the contrast math).
// Keyed by Q90AreaKey, not by the token's own name — "relationship"
// (the area key) vs "relation" (the shorter token suffix) is the one
// place those two vocabularies actually diverge.
const AREA_COLOR_VAR: Record<Q90AreaKey, string> = {
  appearance: '--habit-appearance',
  money: '--habit-money',
  relationship: '--habit-relation',
  health: '--habit-health',
  social: '--habit-social',
  mind: '--habit-mind',
};

// Collapsed area rows no longer wear a bordered, colored pill for every
// status — "NOT STARTED" on all six rows before anything is filled in
// was exactly the kind of equal-weight noise the note is about. Only
// the two states worth calling out at a glance survive: a plain check
// for "proven", a plain muted word for anything mid-flight. Nothing
// renders for "not_started" — that's the default, and defaults don't
// need a badge.
function StatusIndicator({ status }: { status: Q90Status }) {
  if (status === 'proven') {
    return <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold, color: 'var(--success)' }}>✓</span>;
  }
  if (status === 'not_started') return null;
  const label = status === 'defined' ? 'defined' : status === 'planned' ? 'planned' : 'in progress';
  return <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>{label}</span>;
}

// The default view once an area has anything in it: a read-only,
// glanceable summary of what was promised — this is what "just to see
// what I promised" means, as opposed to the step form, which is only
// for the (rare) day it actually changes.
function AreaSummary({ area }: { area: Q90Area }) {
  const changes = area.major_changes.filter((c) => c.text.trim());

  if (area.status === 'not_started') {
    return (
      <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-faint)' }}>
        Nothing defined yet for this area — hit <strong>Edit</strong> above to set where you are and where you're going.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)' }}>WHERE I AM</div>
          <div style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text)', marginTop: SPACE.hair }}>
            {area.current_reality || '—'}
          </div>
        </div>
        <div style={{ fontSize: TYPE_SIZE.md, color: 'var(--accent)' }}>→</div>
        <div style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)' }}>WHERE I'M GOING</div>
          <div style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text)', marginTop: SPACE.hair }}>
            {area.destination || '—'}
          </div>
        </div>
      </div>

      {!!area.gap.trim() && (
        <div>
          <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)' }}>WHAT'S IN THE WAY</div>
          <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text)', marginTop: SPACE.hair }}>{area.gap}</div>
        </div>
      )}

      {changes.length > 0 && (
        <div>
          <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)', marginBottom: SPACE.xs }}>
            KEY CHANGES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
            {changes.map((c, i) => (
              <div key={c.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                <span style={{ fontSize: TYPE_SIZE.sm, color: c.done ? 'var(--success)' : 'var(--text-faint)' }}>
                  {c.done ? '✓' : '○'}
                </span>
                <span
                  style={{
                    fontSize: TYPE_SIZE.sm,
                    color: c.done ? 'var(--text-faint)' : 'var(--text)',
                    textDecoration: c.done ? 'line-through' : undefined,
                  }}
                >
                  {c.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!area.weekly_lead_behavior.trim() && (
        <div style={{ background: 'var(--accent-light)', borderRadius: RADIUS.card, padding: SPACE.md }}>
          <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--accent)' }}>EVERY WEEK</div>
          <div style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text)', marginTop: SPACE.hair }}>
            {area.weekly_lead_behavior}
          </div>
        </div>
      )}

      {(!!area.obstacle_if.trim() || !!area.response_then.trim()) && (
        <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text)' }}>
          <span style={{ color: 'var(--text-faint)' }}>IF </span>
          {area.obstacle_if || '—'}
          <span style={{ color: 'var(--text-faint)' }}> then </span>
          {area.response_then || '—'}
        </div>
      )}

      {area.achieved && !!area.proof.trim() && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, color: 'var(--success)' }}>
          <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold }}>✓</span>
          <span style={{ fontSize: TYPE_SIZE.sm, fontWeight: TYPE_WEIGHT.medium }}>Proven — {area.proof}</span>
        </div>
      )}
    </div>
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
            style={{ fontSize: TYPE_SIZE.xs, padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer' }}
          >
            ✕
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

function AreaAccordion({
  area,
  isOpen,
  onToggle,
  onSaveField,
  onSaveMajorChanges,
  onSetAchieved,
  onChangeGoal,
  onChangeStrategy,
  onSaveMeta,
}: {
  area: Q90Area;
  isOpen: boolean;
  onToggle: () => void;
  onSaveField: (field: string, text: string) => void;
  onSaveMajorChanges: (changes: Q90MajorChange[]) => void;
  onSetAchieved: (achieved: boolean) => void;
  onChangeGoal: (newDestination: string, reason: string, evidence: string) => void;
  onChangeStrategy: () => void;
  onSaveMeta: (field: 'label' | 'description', text: string) => void;
}) {
  const [changingGoal, setChangingGoal] = useState(false);
  const [confirmingStrategy, setConfirmingStrategy] = useState(false);
  const [justKept, setJustKept] = useState(false);
  // Every area opens into the read-only summary first, filled areas and
  // empty ones alike — Zahid's own call (2026-09-21): this panel is a
  // daily direction check, not a form he fills out every day, so
  // opening it should never force him into an editor he didn't ask
  // for. An empty area's summary just reads as dashes ("WHERE I AM —"),
  // which is itself the cue to hit Edit.
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const areaColor = `var(${AREA_COLOR_VAR[area.key]})`;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `1px solid ${isOpen ? areaColor : 'var(--border)'}`,
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
        <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', width: 12 }}>{isOpen ? '▾' : '▸'}</span>
        <span style={{ fontSize: TYPE_SIZE.base, color: areaColor }}>{area.glyph}</span>
        <span style={{ fontWeight: TYPE_WEIGHT.bold, fontSize: TYPE_SIZE.sm, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {area.label}
        </span>
        {!isOpen && area.destination && (
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>{clip(area.destination, 40)}</span>
        )}
        <StatusIndicator status={area.status} />
      </button>
      {isOpen && (
        <div style={{ padding: `0 ${SPACE.md}px ${SPACE.lg}px` }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: SPACE.md,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: RADIUS.card,
              padding: SPACE.lg,
              marginBottom: SPACE.lg,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {mode === 'edit' ? (
                <>
                  <LabelField value={area.label} onSave={(v) => onSaveMeta('label', v)} placeholder="Area name" />
                  <div style={{ marginTop: SPACE.xs }}>
                    <AutoGrowField
                      value={area.description}
                      minRows={1}
                      onSave={(v) => onSaveMeta('description', v)}
                      placeholder="What this area means to you"
                    />
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ margin: 0, fontSize: TYPE_SIZE.md, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text)' }}>{area.label}</h3>
                  <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-faint)', marginTop: SPACE.hair }}>{area.description}</div>
                </>
              )}
            </div>
            <button
              onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
              style={{
                fontSize: TYPE_SIZE.xs,
                fontWeight: TYPE_WEIGHT.medium,
                padding: '4px 12px',
                whiteSpace: 'nowrap',
                color: 'var(--accent)',
                borderColor: 'var(--accent)',
              }}
            >
              {mode === 'view' ? 'Edit ✎' : 'Done'}
            </button>
          </div>

          {mode === 'view' ? (
            <AreaSummary area={area} />
          ) : (
            <>
              <Step n={1} done={!!area.current_reality.trim()} title="Where I am now" hint="The current reality — a number or a fact, not a feeling.">
                <AutoGrowField value={area.current_reality} minRows={2} onSave={(v) => onSaveField('current_reality', v)} />
              </Step>

              <Step n={2} done={!!area.destination.trim()} title="Where I want to go" hint="The destination, and how you'll know it's real.">
                <AutoGrowField
                  value={area.destination}
                  minRows={2}
                  onSave={(v) => onSaveField('destination', v)}
                  placeholder="The destination"
                />
                <div style={{ marginTop: SPACE.sm, display: 'flex', gap: SPACE.sm, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <AutoGrowField
                      value={area.proof}
                      minRows={1}
                      onSave={(v) => onSaveField('proof', v)}
                      placeholder="What will prove this actually happened"
                    />
                  </div>
                  <button
                    onClick={() => onSetAchieved(!area.achieved)}
                    title={area.achieved ? 'Marked achieved' : 'Mark as achieved'}
                    style={{
                      fontSize: TYPE_SIZE.xs,
                      padding: '4px 12px',
                      whiteSpace: 'nowrap',
                      color: area.achieved ? 'var(--success)' : 'var(--text-faint)',
                      borderColor: area.achieved ? 'var(--success)' : undefined,
                    }}
                  >
                    {area.achieved ? '✓ achieved' : 'mark achieved'}
                  </button>
                </div>
              </Step>

              <Step n={3} done={!!area.gap.trim()} title="What's in the way" hint="The gap between where I am and where I'm going.">
                <AutoGrowField value={area.gap} minRows={2} onSave={(v) => onSaveField('gap', v)} />
              </Step>

              <Step n={4} done={area.major_changes.some((c) => c.text.trim())} title="Key changes" hint="Up to 5. Things that have to actually change, not tasks.">
                <MajorChangesEditor changes={area.major_changes} onSave={onSaveMajorChanges} />
              </Step>

              <Step n={5} done={!!area.weekly_lead_behavior.trim()} title="My routine" hint="The ONE thing you repeat every week, on your worst week too.">
                <AutoGrowField value={area.weekly_lead_behavior} minRows={2} onSave={(v) => onSaveField('weekly_lead_behavior', v)} />
              </Step>

              <Step
                n={6}
                done={!!area.obstacle_if.trim() && !!area.response_then.trim()}
                title="If I get stuck"
                hint="Name what usually stops you, and decide the answer now."
              >
                <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)', marginBottom: 2 }}>IF</div>
                    <AutoGrowField value={area.obstacle_if} minRows={2} onSave={(v) => onSaveField('obstacle_if', v)} />
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <div style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.medium, color: 'var(--text-faint)', marginBottom: 2 }}>THEN</div>
                    <AutoGrowField value={area.response_then} minRows={2} onSave={(v) => onSaveField('response_then', v)} />
                  </div>
                </div>
              </Step>

              <div style={{ marginTop: SPACE.lg, paddingTop: SPACE.lg, borderTop: '1px solid var(--border)' }}>
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
                    <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>Still the plan?</span>
                    <button
                      onClick={() => {
                        setJustKept(true);
                        setTimeout(() => setJustKept(false), 1200);
                      }}
                      style={{
                        fontSize: TYPE_SIZE.xs,
                        padding: '4px 12px',
                        color: justKept ? 'var(--success)' : undefined,
                        borderColor: justKept ? 'var(--success)' : undefined,
                      }}
                      title="Nothing to change — still the right goal"
                    >
                      {justKept ? 'Kept ✓' : 'Keep goal'}
                    </button>
                    <button
                      onClick={() => setConfirmingStrategy(true)}
                      style={{ fontSize: TYPE_SIZE.xs, padding: '4px 12px' }}
                      title="Same goal, clear the gap / major changes / weekly behavior and re-plan"
                    >
                      Change strategy
                    </button>
                    <button onClick={() => setChangingGoal(true)} style={{ fontSize: TYPE_SIZE.xs, padding: '4px 12px' }} title="The destination itself is wrong — replace it">
                      Change goal
                    </button>
                    {area.goal_version > 1 && (
                      <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', alignSelf: 'center' }}>
                        v{area.goal_version} · {area.goal_history.length} earlier goal{area.goal_history.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuarterlyPlanPanel() {
  const [panel, setPanel] = useState<Q90Panel | null>(null);
  // Nothing auto-opens — Zahid's own call (2026-09-21): the panel's
  // whole point now is the collapsed row list read as one glance at
  // all six directions, so landing on it already expanded into one
  // area (however read-only) fights that. A closed accordion is one
  // click away either way.
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [editingCycle, setEditingCycle] = useState(false);
  // Drag-to-reorder — Zahid's own call (2026-09-21): no grip icon, no
  // "reorder" label sitting on every row; the only sign this is
  // possible is the grab cursor and native title tooltip a mouse-over
  // reveals, plus the dragged row dimming and its landing spot getting
  // a rule while a drag is actually in flight (that feedback is
  // transient, tied to the gesture itself, not a standing indicator).
  // Only collapsed rows are draggable — dragging a row that's open
  // mid-edit would fight text selection inside its own textareas.
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

  // Keyboard equivalent of the drag gesture above — a mouse user drags,
  // a keyboard user tabs to these and presses Enter. Same reorderAreas
  // call either way, so the two paths can never drift into different
  // orderings.
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

  const dayLine = panel.day === 0 ? `Starts in ${panel.days_left - panel.cycle_days} days` : `Day ${panel.day} of ${panel.cycle_days}`;
  const daysLeftLine = panel.day === 0 ? '' : `${panel.days_left} days left`;
  const timePct = Math.min(100, Math.round((panel.day / panel.cycle_days) * 100));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.xl }}>
        <div>
          <h2 style={{ margin: 0, fontSize: TYPE_SIZE.display, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text)' }}>
            {panel.cycle_days}-Day Transformation
          </h2>
          <div style={{ fontSize: TYPE_SIZE.sm, color: 'var(--text-faint)', marginTop: SPACE.xs }}>
            Turn one area of your life into a measurable {panel.cycle_days}-day result.
          </div>
        </div>
        <button
          onClick={() => setEditingCycle((v) => !v)}
          style={{
            fontSize: TYPE_SIZE.sm,
            fontWeight: TYPE_WEIGHT.medium,
            color: 'var(--text)',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Change the start date or the length"
        >
          {formatDate(panel.cycle_start)} → {formatDate(panel.cycle_end)}{' '}
          <span style={{ color: 'var(--text-faint)', fontWeight: TYPE_WEIGHT.normal }}>✎</span>
        </button>
      </div>

      {editingCycle && (
        <CycleEditor
          panel={panel}
          onClose={() => setEditingCycle(false)}
          onSet={(start, days) => quarterlyApi.setCycle(start, days).then(setPanel)}
        />
      )}

      <div style={{ marginBottom: SPACE.xl }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: SPACE.xs }}>
          <span style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold, color: 'var(--text)' }}>{dayLine}</span>
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>
            {panel.areas_done} / {panel.areas_total} areas
          </span>
        </div>
        <div style={{ height: 5, background: 'var(--border)', borderRadius: RADIUS.pill, overflow: 'hidden' }}>
          <div style={{ width: `${timePct}%`, height: '100%', background: 'var(--accent)' }} />
        </div>
        {daysLeftLine && (
          <div style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', marginTop: SPACE.xs, textAlign: 'right' }}>{daysLeftLine}</div>
        )}
      </div>

      {panel.areas.map((area, idx) => {
        const isOpen = openArea === area.key;
        return (
          <div key={area.key} style={{ display: 'flex', alignItems: 'stretch', gap: SPACE.xs }}>
            <div
              draggable={!isOpen}
              title={!isOpen ? 'Drag to reorder' : undefined}
              className={isOpen ? undefined : 'card-elevated'}
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
                flex: 1,
                minWidth: 0,
                cursor: isOpen ? undefined : 'grab',
                opacity: dragKey === area.key ? 0.5 : 1,
                borderTop: dragOverKey === area.key && dragKey && dragKey !== area.key ? '2px solid var(--accent)' : '2px solid transparent',
                borderRadius: RADIUS.card,
                boxShadow: isOpen ? undefined : 'var(--shadow-sm)',
              }}
            >
              <AreaAccordion
                area={area}
                isOpen={isOpen}
                onToggle={() => setOpenArea(isOpen ? null : area.key)}
                onSaveField={(field, text) => quarterlyApi.setField(area.key, field as any, text).then(refresh)}
                onSaveMajorChanges={(changes) => quarterlyApi.setMajorChanges(area.key, changes).then(refresh)}
                onSetAchieved={(achieved) => quarterlyApi.setAchieved(area.key, achieved).then(refresh)}
                onChangeGoal={(dest, reason, evidence) => quarterlyApi.changeGoal(area.key, dest, reason, evidence).then(refresh)}
                onChangeStrategy={() => quarterlyApi.changeStrategy(area.key).then(refresh)}
                onSaveMeta={(field, text) => quarterlyApi.setAreaMeta(area.key, field, text).then(refresh)}
              />
            </div>
            {!isOpen && (
              // Keyboard-reachable equivalent of the drag gesture on the
              // card to the left — a keyboard user can't drag, so
              // reordering needs a real focusable, always-present control
              // here, not something that only appears on hover.
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: SPACE.hair, flex: 'none' }}>
                <button
                  onClick={() => moveArea(area.key, -1)}
                  disabled={idx === 0}
                  title="Move up"
                  aria-label={`Move ${area.label} up`}
                  style={{ width: 24, height: 20, padding: 0, fontSize: TYPE_SIZE.xs, lineHeight: 1, color: 'var(--text-faint)' }}
                >
                  ▲
                </button>
                <button
                  onClick={() => moveArea(area.key, 1)}
                  disabled={idx === panel.areas.length - 1}
                  title="Move down"
                  aria-label={`Move ${area.label} down`}
                  style={{ width: 24, height: 20, padding: 0, fontSize: TYPE_SIZE.xs, lineHeight: 1, color: 'var(--text-faint)' }}
                >
                  ▼
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
