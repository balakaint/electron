import { useEffect, useState } from 'react';
import { Archive, Check, ChevronDown, ChevronUp, Circle, Copy, ExternalLink, LayoutGrid, List, Table2, X } from 'lucide-react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { BdpPlan, BdpPriority, BdpSort, BdpStatus, BdpView, bdpApi } from '../services/api';
import { RADIUS } from '../spacing';

const STATUSES: BdpStatus[] = ['IDEA', 'OPPORTUNITY', 'RESEARCH', 'PLAN', 'ACTIVE', 'HOLD', 'DONE'];
const PRIORITIES: BdpPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
const MARKETS = ['Bangladesh', 'USA', 'Global', 'Other'];

// Matches legacy's _SC_LIGHT/_SC_DARK and _PRI_LIGHT/_PRI_DARK — a
// light/dark split (not a per-theme one; see themes.ts's --bdp-* comment)
// baked into the CSS vars themselves, so no "night" check is needed here.
const STATUS_COLOR: Record<BdpStatus, string> = {
  IDEA: 'var(--bdp-idea)',
  OPPORTUNITY: 'var(--bdp-opportunity)',
  RESEARCH: 'var(--bdp-research)',
  PLAN: 'var(--bdp-plan)',
  ACTIVE: 'var(--bdp-active)',
  HOLD: 'var(--bdp-hold)',
  DONE: 'var(--bdp-done)',
};
const PRIORITY_COLOR: Record<BdpPriority, string> = {
  HIGH: 'var(--bdp-priority-high)',
  MEDIUM: 'var(--bdp-priority-medium)',
  LOW: 'var(--bdp-priority-low)',
};

function Chip({ label, color, onClick }: { label: string; color: string; onClick?: () => void }) {
  // Hardcoded white read fine on the light bdp palette's darker entries
  // and was actually unreadable on most of the dark one: measured at
  // 1.67-2.98:1 against BDP_DARK's colours (warroom/journey), and even
  // BDP_LIGHT's own --bdp-research fell short at 3.68:1 — a real
  // contrast bug on every theme, worst on two of them. Each --bdp-*
  // colour now has a matching -ink token (themes.ts), computed once
  // against its own fixed value the same way inkOn() would, so this
  // just asks for the ink that belongs to the colour it was given.
  const ink = color.replace(/\)$/, '-ink)');
  const style = {
    display: 'inline-block',
    fontSize: 12,
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: RADIUS.card,
    color: ink,
    background: color,
    cursor: onClick ? 'pointer' : 'default',
  } as const;
  // A pure display chip (no onClick) stays a <span> — a focusable
  // <button> with nothing to activate is its own trap. Only the
  // clickable ones need to be reachable and operable by keyboard.
  if (!onClick) return <span style={style}>{label}</span>;
  return (
    <button onClick={onClick} style={{ ...style, border: 'none' }}>
      {label}
    </button>
  );
}

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ opacity: 0.6, width: 70 }}>{label}</span>
      <button onClick={() => onChange(Math.max(1, value - 1))} title={`Decrease ${label}`} style={{ width: 20 }}>
        −
      </button>
      <span style={{ fontFamily: 'monospace', minWidth: 60, textAlign: 'center' }}>
        {'★'.repeat(value)}
        {'·'.repeat(5 - value)}
      </span>
      <button onClick={() => onChange(Math.min(5, value + 1))} title={`Increase ${label}`} style={{ width: 20 }}>
        +
      </button>
    </div>
  );
}

function ChoiceRow<T extends string>({
  options,
  value,
  colors,
  onChange,
}: {
  options: T[];
  value: T;
  colors: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          disabled={o === value}
          style={{
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: RADIUS.card,
            border: 'none',
            background: o === value ? colors[o] : 'var(--surface-2)',
            color: o === value ? '#fff' : 'var(--text)',
            cursor: o === value ? 'default' : 'pointer',
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function TextField({
  label,
  value,
  onSave,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { value: v, setValue: setV, flush, state } = useAutosave(value, onSave);
  const common = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    // Blur commits immediately rather than waiting out the debounce —
    // leaving a field is a stronger "I'm done" signal than a pause.
    onBlur: flush,
    placeholder,
    style: {
      width: '100%',
      fontSize: 12,
      padding: 4,
      boxSizing: 'border-box' as const,
      ...savedFlashStyle(state),
    },
  };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>
      {multiline ? <textarea {...common} rows={2} /> : <input {...common} />}
    </div>
  );
}

function ActionsChecklist({
  plan,
  onAdd,
  onToggle,
  onEdit,
  onDelete,
}: {
  plan: BdpPlan;
  onAdd: (text: string) => void;
  onToggle: (id: number) => void;
  onEdit: (id: number, text: string) => void;
  onDelete: (id: number) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>
        NEXT ACTIONS {plan.next_actions.filter((a) => a.done).length}/{plan.next_actions.length}
      </div>
      {plan.next_actions.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <button
            onClick={() => onToggle(a.id)}
            title="Toggle done"
            aria-label={a.done ? 'Mark not done' : 'Mark done'}
            style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {a.done ? <Check size={14} /> : <Circle size={14} />}
          </button>
          <input
            defaultValue={a.text}
            onBlur={(e) => e.target.value.trim() && e.target.value !== a.text && onEdit(a.id, e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 12,
              textDecoration: a.done ? 'line-through' : 'none',
            }}
          />
          <button onClick={() => onDelete(a.id)} title="Delete" aria-label="Delete" style={{ display: 'flex', padding: 4 }}><X size={14} /></button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          onAdd(t);
          setText('');
        }}
        style={{ display: 'flex', gap: 4, marginTop: 4 }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="+ Add next action…"
          style={{ flex: 1, fontSize: 12, padding: 4 }}
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}

type DetailHandlers = {
  onPatch: (patch: Partial<BdpPlan>) => void;
  onAddAction: (text: string) => void;
  onToggleAction: (id: number) => void;
  onEditAction: (id: number, text: string) => void;
  onDeleteAction: (id: number) => void;
};

// Every editable field of one plan. Shared verbatim by the card's inline
// expand and the full-page view, so the two cannot drift into disagreeing
// about which fields a plan has — legacy had one `_fields` builder for
// the same reason.
function PlanDetail({
  plan,
  onPatch,
  onAddAction,
  onToggleAction,
  onEditAction,
  onDeleteAction,
}: { plan: BdpPlan } & DetailHandlers) {
  return (
    <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>STATUS</div>
            <ChoiceRow options={STATUSES} value={plan.status} colors={STATUS_COLOR} onChange={(v) => onPatch({ status: v })} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>PRIORITY</div>
            <ChoiceRow options={PRIORITIES} value={plan.priority} colors={PRIORITY_COLOR} onChange={(v) => onPatch({ priority: v })} />
          </div>
          <TextField label="Opportunity — why is this worth your time?" value={plan.opportunity} multiline onSave={(v) => onPatch({ opportunity: v })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <TextField label="Market" value={plan.market} onSave={(v) => onPatch({ market: v })} />
            <TextField label="Target customer" value={plan.target} onSave={(v) => onPatch({ target: v })} />
            <TextField label="Niche" value={plan.niche} onSave={(v) => onPatch({ niche: v })} />
            <TextField label="Business model" value={plan.model} onSave={(v) => onPatch({ model: v })} />
            <TextField label="Product" value={plan.product} onSave={(v) => onPatch({ product: v })} />
            <TextField label="Service" value={plan.service} onSave={(v) => onPatch({ service: v })} />
            <TextField label="Supplier" value={plan.supplier} onSave={(v) => onPatch({ supplier: v })} />
            <TextField label="Timeline (e.g. 3 Months)" value={plan.timeline} onSave={(v) => onPatch({ timeline: v })} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
            <Stars label="Potential" value={plan.potential} onChange={(v) => onPatch({ potential: v })} />
            <Stars label="Difficulty" value={plan.difficulty} onChange={(v) => onPatch({ difficulty: v })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <TextField label="Investment (৳)" value={plan.cost_amount} onSave={(v) => onPatch({ cost_amount: v })} />
            <TextField label="Yearly profit (৳)" value={plan.yearly_profit} onSave={(v) => onPatch({ yearly_profit: v })} />
          </div>
          <TextField label="Notes" value={plan.notes} multiline onSave={(v) => onPatch({ notes: v })} />
          <ActionsChecklist
            plan={plan}
            onAdd={onAddAction}
            onToggle={onToggleAction}
            onEdit={onEditAction}
            onDelete={onDeleteAction}
          />
    </>
  );
}

function PlanCard({
  plan,
  isFirst,
  isLast,
  sort,
  onOpen,
  onPatch,
  onMove,
  onDuplicate,
  onArchive,
  onDelete,
  onAddAction,
  onToggleAction,
  onEditAction,
  onDeleteAction,
}: {
  plan: BdpPlan;
  isFirst: boolean;
  isLast: boolean;
  sort: BdpSort;
  onOpen: () => void;
  onPatch: (patch: Partial<BdpPlan>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onAddAction: (text: string) => void;
  onToggleAction: (id: number) => void;
  onEditAction: (id: number, text: string) => void;
  onDeleteAction: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(plan.title);
  useEffect(() => setTitle(plan.title), [plan.title]);

  return (
    <div
      className="card-elevated"
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${STATUS_COLOR[plan.status]}`,
        borderRadius: RADIUS.card,
        padding: 12,
        marginBottom: 12,
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {sort === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => onMove(-1)} disabled={isFirst} title="Move up" style={{ width: 22, fontSize: 12 }}>
              ▲
            </button>
            <button onClick={() => onMove(1)} disabled={isLast} title="Move down" style={{ width: 22, fontSize: 12 }}>
              ▼
            </button>
          </div>
        )}
        <div style={{ flex: 1 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== plan.title && onPatch({ title: title.trim() })}
            style={{
              width: '100%',
              fontSize: 16,
              fontWeight: 700,
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              marginBottom: 4,
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <Chip label={plan.status} color={STATUS_COLOR[plan.status]} />
            <Chip label={plan.priority} color={PRIORITY_COLOR[plan.priority]} />
            {plan.market && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{plan.market}</span>}
            {plan.timeline && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>· {plan.timeline}</span>}
          </div>
          {plan.opportunity && <p style={{ fontSize: 13, margin: '0 0 8px' }}>{plan.opportunity}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setExpanded((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {expanded ? (
                <>
                  Collapse <ChevronUp size={12} />
                </>
              ) : (
                <>
                  Details <ChevronDown size={12} />
                </>
              )}
            </button>
            <button onClick={onOpen} title="Open full page" aria-label="Open full page" style={{ display: 'flex', padding: 4 }}>
              <ExternalLink size={13} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onDuplicate} title="Duplicate" aria-label="Duplicate" style={{ display: 'flex', padding: 4 }}>
              <Copy size={14} />
            </button>
            <button onClick={onArchive} title="Archive" aria-label="Archive" style={{ display: 'flex', padding: 4 }}>
              <Archive size={14} />
            </button>
            <button onClick={onDelete} title="Delete" aria-label="Delete" style={{ display: 'flex', padding: 4 }}>
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <PlanDetail
            plan={plan}
            onPatch={onPatch}
            onAddAction={onAddAction}
            onToggleAction={onToggleAction}
            onEditAction={onEditAction}
            onDeleteAction={onDeleteAction}
          />
        </div>
      )}
    </div>
  );
}

// ── Full-page project view ──────────────────────────────────────────
// One plan, the whole panel, every field editable in place. Legacy's own
// note on why this exists beside the card's inline expand
// (task_tracker_v3_THEMES.py 13724-13730): the compact view is for
// capturing something fast, this is for sitting with a project and
// working it out — which is why nothing here is behind a Save button.
// Each field commits on focus-out, the way a document does.
function PlanPage({
  plan,
  index,
  total,
  onGo,
  onClose,
  ...handlers
}: {
  plan: BdpPlan;
  index: number;
  total: number;
  onGo: (step: -1 | 1) => void;
  onClose: () => void;
} & DetailHandlers) {
  const [title, setTitle] = useState(plan.title);
  useEffect(() => setTitle(plan.title), [plan.id, plan.title]);

  // Escape returns to the list. Legacy rebinds Escape on the window and
  // has to hand it back on close; here the listener simply unmounts with
  // the page, so there is nothing to restore.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    // Legacy caps the column at 980px and centres it: "a field stretched
    // across a 1900px monitor is unreadable — the eye loses the line."
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingBottom: 8,
          borderBottom: '1px solid var(--border)',
          marginBottom: 16,
        }}
      >
        <button onClick={onClose} style={{ fontSize: 12 }}>
          ←  All plans
        </button>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--text-faint)' }}>
          {index + 1} of {total}
        </span>
        {/* Prev/Next wrap, as legacy's _sibling does with its modulo —
            reaching the end of a short list and finding the button dead
            is worse than looping. */}
        <button onClick={() => onGo(-1)} disabled={total < 2} style={{ fontSize: 12 }}>
          ‹  Prev
        </button>
        <button onClick={() => onGo(1)} disabled={total < 2} style={{ fontSize: 12 }}>
          Next  ›
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const t = title.trim();
          if (t && t !== plan.title) handlers.onPatch({ title: t });
          else if (!t) setTitle(plan.title);
        }}
        style={{
          width: '100%',
          fontSize: 24,
          fontWeight: 700,
          border: 'none',
          borderBottom: `2px solid ${STATUS_COLOR[plan.status]}`,
          background: 'transparent',
          color: 'var(--text)',
          padding: '0 0 8px',
          marginBottom: 16,
        }}
      />

      <PlanDetail plan={plan} {...handlers} />
    </div>
  );
}

// ── Shared row bits ─────────────────────────────────────────────────
// What a plan's "next action" cell says: the first open action, or why
// there isn't one — finished plans say so, the rest invite adding one.
function nextAction(plan: BdpPlan): { text: string; color: string } {
  const open = plan.next_actions.find((a) => !a.done);
  if (open) return { text: open.text, color: 'var(--text)' };
  if (plan.status === 'DONE') return { text: 'Finished ✓', color: 'var(--success)' };
  if (plan.next_actions.length > 0) return { text: 'All actions done ✓', color: 'var(--success)' };
  return { text: '+ Add a next action', color: 'var(--accent)' };
}

function ActionBar({ plan }: { plan: BdpPlan }) {
  const acts = plan.next_actions;
  const pct = acts.length ? (100 * acts.filter((a) => a.done).length) / acts.length : 0;
  return (
    <div style={{ height: 4, borderRadius: RADIUS.pill, background: 'var(--surface-2)', overflow: 'hidden' }}>
      <div style={{ height: 4, width: `${pct}%`, background: STATUS_COLOR[plan.status] }} />
    </div>
  );
}

const rowKeys = (onOpen: () => void) => ({
  onClick: onOpen,
  role: 'button' as const,
  tabIndex: 0,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  },
  title: 'Open this plan',
});

const ellipsis = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

// ── Table view ──────────────────────────────────────────────────────
// Legacy's dense summary row (13256-13624), widened: stage and priority
// get their own column as chips, the roadmap carries the action
// progress, and NEXT ACTION says what to do without opening the plan.
const TBL_GRID = '24px 3fr 1.3fr 1.4fr 1.6fr 2.2fr 16px';

function TableHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: TBL_GRID,
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.5,
        color: 'var(--text-faint)',
      }}
    >
      <span />
      <span>PLAN</span>
      <span>STAGE</span>
      <span>SUPPLIER</span>
      <span>ROADMAP</span>
      <span>NEXT ACTION</span>
      <span />
    </div>
  );
}

function TableRow({ plan, draggable, onOpen }: { plan: BdpPlan; draggable: boolean; onOpen: () => void }) {
  const acts = plan.next_actions;
  const done = acts.filter((a) => a.done).length;
  const next = nextAction(plan);
  const faint = { color: 'var(--text-faint)' };
  return (
    <div
      {...rowKeys(onOpen)}
      style={{
        display: 'grid',
        gridTemplateColumns: TBL_GRID,
        gap: 8,
        alignItems: 'center',
        padding: 12,
        borderBottom: '1px solid var(--border)',
        boxShadow: `inset 3px 0 0 ${STATUS_COLOR[plan.status]}`,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <span aria-hidden style={{ color: 'var(--text-faint)', cursor: draggable ? 'grab' : 'pointer', opacity: draggable ? 1 : 0.25 }}>
        ⋮⋮
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 700, ...ellipsis }}>{plan.title}</span>
        <span style={{ ...faint, ...ellipsis }}>
          {plan.market || 'No market'}
          {plan.timeline ? ` · ${plan.timeline}` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: 0 }}>
        <Chip label={plan.status} color={STATUS_COLOR[plan.status]} />
        <span style={{ fontWeight: 700, color: PRIORITY_COLOR[plan.priority] }}>{plan.priority}</span>
      </div>
      <span style={{ ...ellipsis, ...(plan.supplier ? {} : faint) }}>{plan.supplier || 'No supplier yet'}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ ...ellipsis, ...(plan.timeline ? {} : faint) }}>{plan.timeline || 'No timeline'}</span>
        <ActionBar plan={plan} />
        <span style={faint}>{acts.length ? `${done} of ${acts.length} actions done` : 'No actions yet'}</span>
      </div>
      <span style={{ ...ellipsis, color: next.color }}>{next.text}</span>
      <span aria-hidden style={{ fontSize: 16, color: 'var(--text-faint)' }}>
        ›
      </span>
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────────
// Legacy's compact one-line row (13668-13723): index and title, then
// stage, priority, market and action count, with the status stripe.
function ListRow({ plan, index, onOpen }: { plan: BdpPlan; index: number; onOpen: () => void }) {
  const acts = plan.next_actions;
  const muted = { fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' } as const;
  return (
    <div
      {...rowKeys(onOpen)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 40,
        padding: '0 12px',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.control,
        boxShadow: `inset 3px 0 0 ${STATUS_COLOR[plan.status]}`,
        background: 'var(--surface)',
        marginBottom: 4,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--text-faint)', width: 16 }}>{index}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, ...ellipsis }}>{plan.title}</span>
      <Chip label={plan.status} color={STATUS_COLOR[plan.status]} />
      <span style={{ fontWeight: 700, color: PRIORITY_COLOR[plan.priority], width: 64 }}>{plan.priority}</span>
      <span style={{ ...muted, width: 96, overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.market || '—'}</span>
      <span style={{ ...muted, width: 40, textAlign: 'right' }}>
        {acts.length ? `${acts.filter((a) => a.done).length}/${acts.length}` : '—'}
      </span>
    </div>
  );
}

// ── Toolbar bits ────────────────────────────────────────────────────
// The pipeline strip: every stage with its count, doubling as the
// status filter. Counts ignore the stage filter itself (a count of 0
// under every other stage would say nothing) but honour the rest.
function StageStrip({
  plans,
  value,
  onChange,
}: {
  plans: BdpPlan[];
  value: BdpStatus | 'All';
  onChange: (v: BdpStatus | 'All') => void;
}) {
  const items: [BdpStatus | 'All', string][] = [['All', 'var(--text)'], ...STATUSES.map((s) => [s, STATUS_COLOR[s]] as [BdpStatus, string])];
  return (
    <div
      role="radiogroup"
      aria-label="Stage"
      style={{
        display: 'flex',
        gap: 4,
        padding: 4,
        marginBottom: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
      }}
    >
      {items.map(([s, color]) => {
        const n = s === 'All' ? plans.length : plans.filter((p) => p.status === s).length;
        const on = value === s;
        return (
          <button
            key={s}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && s !== 'All' ? 'All' : s)}
            title={s === 'All' ? 'Show every stage' : `Show only ${s} — click again to show all`}
            style={{
              flex: s === 'OPPORTUNITY' ? 1.5 : 1,
              minWidth: 0,
              height: 44,
              padding: '0 8px',
              border: 'none',
              borderRadius: RADIUS.control,
              background: on ? 'var(--accent-light)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--text)',
              opacity: n || on ? 1 : 0.45,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'center',
              gap: 2,
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, ...ellipsis, maxWidth: '100%' }}>
              <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: RADIUS.pill, background: color }} />
              {s === 'All' ? 'ALL' : s}
            </span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: [T, React.ReactNode, string?][];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: RADIUS.control, overflow: 'hidden', background: 'var(--surface)' }}
    >
      {options.map(([v, text, title], i) => {
        const on = value === v;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={on}
            title={title}
            onClick={() => onChange(v)}
            style={{
              height: 30,
              padding: '0 12px',
              border: 'none',
              borderLeft: i ? '1px solid var(--border)' : 'none',
              borderRadius: 0,
              background: on ? 'var(--accent)' : 'var(--surface)',
              color: on ? 'var(--on-accent)' : 'var(--text)',
              fontSize: 12,
              fontWeight: on ? 700 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

export default function BdpPanel() {
  const [plans, setPlans] = useState<BdpPlan[]>([]);
  const [sort, setSort] = useState<BdpSort>('manual');
  const [view, setView] = useState<BdpView>('card');
  // Which plan the full-page view is showing, by id rather than index —
  // an index would point at a different plan the moment a filter or the
  // sort mode changed underneath it.
  const [openId, setOpenId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<BdpStatus | 'All'>('All');
  const [fPriority, setFPriority] = useState<BdpPriority | 'All'>('All');
  const [fMarket, setFMarket] = useState<string>('All');
  const [newTitle, setNewTitle] = useState('');
  const [loaded, setLoaded] = useState(false);

  // The stage filter is applied here rather than by the engine, so the
  // stage strip can count every stage from the same fetch.
  const refresh = () => bdpApi.list({ status: 'All', priority: fPriority, market: fMarket, q, sort }).then(setPlans);

  useEffect(() => {
    bdpApi.getSort().then((s) => setSort(s.sort));
    bdpApi.getView().then((v) => setView(v.view));
  }, []);

  useEffect(() => {
    refresh().then(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fPriority, fMarket, q, sort]);

  const changeSort = (v: BdpSort) => {
    setSort(v);
    bdpApi.setSort(v);
  };

  const changeView = (v: BdpView) => {
    setView(v);
    bdpApi.setView(v);
  };

  const shown = fStatus === 'All' ? plans : plans.filter((p) => p.status === fStatus);
  const filtered = fStatus !== 'All' || fPriority !== 'All' || fMarket !== 'All' || q.trim() !== '';
  const clearFilters = () => {
    setFStatus('All');
    setFPriority('All');
    setFMarket('All');
    setQ('');
  };

  // Handlers a plan needs wherever it is rendered — the card's inline
  // expand and the full page both take the same set.
  const handlersFor = (p: BdpPlan) => ({
    onPatch: (patch: Partial<BdpPlan>) => bdpApi.edit(p.id, patch).then(refresh),
    onAddAction: (text: string) => bdpApi.addAction(p.id, text).then(refresh),
    onToggleAction: (id: number) => bdpApi.toggleAction(id).then(refresh),
    onEditAction: (id: number, text: string) => bdpApi.editAction(id, text).then(refresh),
    onDeleteAction: (id: number) => bdpApi.deleteAction(id).then(refresh),
  });

  // Drag-to-reorder: manual sort, and only while nothing is filtered —
  // the engine's to_index counts the whole list, so a drop position in
  // a filtered subset would land the plan somewhere else. The dragged
  // row is not moved on screen; the position it would land in is marked
  // instead and the list re-renders once on drop (legacy 13280-13300).
  const canDrag = sort === 'manual' && !filtered;
  const dragProps = (p: BdpPlan, i: number) =>
    !canDrag
      ? {}
      : {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            setDragId(p.id);
            e.dataTransfer.effectAllowed = 'move';
          },
          onDragOver: (e: React.DragEvent) => {
            if (dragId === null) return;
            e.preventDefault();
            setDropIndex(i);
          },
          onDragEnd: () => {
            setDragId(null);
            setDropIndex(null);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const id = dragId;
            setDragId(null);
            setDropIndex(null);
            if (id !== null && shown.findIndex((x) => x.id === id) !== i) {
              bdpApi.reorder(id, i).then(refresh);
            }
          },
          style: {
            opacity: dragId === p.id ? 0.4 : 1,
            // The drop marker is a line, not a gap: a gap reflows every
            // row below it and the list appears to jump while dragging.
            boxShadow: dropIndex === i && dragId !== p.id ? 'inset 0 2px 0 0 var(--accent)' : undefined,
          },
        };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    bdpApi.create(t).then(() => {
      setNewTitle('');
      refresh();
    });
  };

  if (!loaded) return <div>Loading…</div>;

  const openPlan = openId === null ? null : shown.find((p) => p.id === openId) ?? null;
  if (openPlan) {
    const idx = shown.findIndex((p) => p.id === openPlan.id);
    return (
      <PlanPage
        plan={openPlan}
        index={idx}
        total={shown.length}
        // Wraps, matching legacy's modulo in _sibling.
        onGo={(step) => setOpenId(shown[(idx + step + shown.length) % shown.length].id)}
        onClose={() => setOpenId(null)}
        {...handlersFor(openPlan)}
      />
    );
  }
  // A plan that was open but has since been filtered out (or deleted)
  // leaves openId pointing at nothing; fall through to the list rather
  // than rendering a blank panel.

  const high = plans.filter((p) => p.priority === 'HIGH').length;
  const openActs = plans.reduce((n, p) => n + p.next_actions.filter((a) => !a.done).length, 0);
  const control = {
    height: 32,
    padding: '0 12px',
    fontSize: 12,
    border: '1px solid var(--border)',
    borderRadius: RADIUS.control,
    background: 'var(--surface)',
    color: 'var(--text)',
  } as const;

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>Business Plans</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {plans.length} {plans.length === 1 ? 'plan' : 'plans'} · {high} high priority · {openActs} next{' '}
            {openActs === 1 ? 'action' : 'actions'} open
          </span>
        </div>
        <Segmented<BdpView>
          label="View"
          value={view}
          onChange={changeView}
          options={[
            ['table', <><Table2 size={14} /> Table</>, 'Table view — dense summary rows'],
            ['list', <><List size={14} /> List</>, 'List view — one line per plan'],
            ['card', <><LayoutGrid size={14} /> Cards</>, 'Card view — one plan at a time, editable in place'],
          ]}
        />
      </div>

      <StageStrip plans={plans} value={fStatus} onChange={setFStatus} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search plans, suppliers, notes…"
          aria-label="Search plans"
          style={{ ...control, flex: 1, minWidth: 160, fontSize: 13 }}
        />
        <Segmented<BdpPriority | 'All'>
          label="Priority"
          value={fPriority}
          onChange={setFPriority}
          options={[['All', 'All'], ['HIGH', 'High'], ['MEDIUM', 'Medium'], ['LOW', 'Low']]}
        />
        <select value={fMarket} onChange={(e) => setFMarket(e.target.value)} aria-label="Market" style={control}>
          <option value="All">All markets</option>
          {MARKETS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          onClick={() => changeSort(sort === 'manual' ? 'priority' : 'manual')}
          title="Switch between your own order and priority order"
          style={{ ...control, cursor: 'pointer' }}
        >
          ⇅ {sort === 'manual' ? 'Manual order' : 'By priority'}
        </button>
      </div>

      <form onSubmit={submitNew} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="+ New plan — type a business name and press Enter"
          aria-label="New plan name"
          style={{ ...control, flex: 1, height: 40, fontSize: 13, border: '1px dashed var(--border)', borderRadius: RADIUS.card }}
        />
        <button
          type="submit"
          disabled={!newTitle.trim()}
          style={{
            height: 40,
            padding: '0 16px',
            border: 'none',
            borderRadius: RADIUS.card,
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontSize: 13,
            fontWeight: 700,
            opacity: newTitle.trim() ? 1 : 0.5,
            cursor: newTitle.trim() ? 'pointer' : 'default',
          }}
        >
          Add plan
        </button>
      </form>

      {shown.length === 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: 32,
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: RADIUS.card,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>{filtered ? 'No plans match' : 'No plans yet'}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {filtered ? 'Nothing fits these filters.' : 'Type a business name above to add your first plan.'}
          </span>
          {filtered && (
            <button onClick={clearFilters} style={{ ...control, height: 28, cursor: 'pointer' }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {view === 'table' && shown.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: RADIUS.card, overflow: 'hidden' }}>
          <TableHeader />
          {shown.map((p, i) => (
            <div key={p.id} {...dragProps(p, i)}>
              <TableRow plan={p} draggable={canDrag} onOpen={() => setOpenId(p.id)} />
            </div>
          ))}
        </div>
      )}

      {view === 'list' &&
        shown.map((p, i) => (
          <div key={p.id} {...dragProps(p, i)}>
            <ListRow plan={p} index={i + 1} onOpen={() => setOpenId(p.id)} />
          </div>
        ))}

      {view === 'card' &&
        shown.map((p, i) => (
          // Cards keep their narrower reading width under the wider toolbar.
          <div key={p.id} {...dragProps(p, i)}>
            <div style={{ maxWidth: 820 }}>
              <PlanCard
                plan={p}
                isFirst={i === 0}
                isLast={i === shown.length - 1}
                // Up/down swaps with the neighbour in the whole list, so it
                // is only offered where that neighbour is the one on screen.
                sort={canDrag ? sort : 'priority'}
                onOpen={() => setOpenId(p.id)}
                onMove={(direction) => bdpApi.move(p.id, direction).then(refresh)}
                onDuplicate={() => bdpApi.duplicate(p.id).then(refresh)}
                onArchive={() => bdpApi.archive(p.id).then(refresh)}
                onDelete={() => bdpApi.remove(p.id).then(refresh)}
                {...handlersFor(p)}
              />
            </div>
          </div>
        ))}

      {shown.length > 0 && view !== 'card' && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>
          {canDrag
            ? 'Drag ⋮⋮ to reorder · click a row to open the plan · click a stage above to filter'
            : sort !== 'manual'
              ? 'Sorted by priority — switch to Manual order to drag rows'
              : 'Clear the filters to drag rows into a new order'}
        </div>
      )}
    </div>
  );
}
