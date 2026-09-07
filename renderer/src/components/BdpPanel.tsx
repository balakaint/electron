import { useEffect, useState } from 'react';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { BdpPlan, BdpPriority, BdpSort, BdpStatus, BdpView, bdpApi } from '../services/api';

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
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 'bold',
        padding: '2px 8px',
        borderRadius: 10,
        color: '#fff',
        background: color,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {label}
    </span>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
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
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 10,
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
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
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
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>
        NEXT ACTIONS {plan.next_actions.filter((a) => a.done).length}/{plan.next_actions.length}
      </div>
      {plan.next_actions.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <button onClick={() => onToggle(a.id)} title="Toggle done" style={{ width: 18 }}>
            {a.done ? '✓' : '○'}
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
          <button onClick={() => onDelete(a.id)} title="Delete">✕</button>
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
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>STATUS</div>
            <ChoiceRow options={STATUSES} value={plan.status} colors={STATUS_COLOR} onChange={(v) => onPatch({ status: v })} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>PRIORITY</div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0' }}>
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
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${STATUS_COLOR[plan.status]}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        background: 'var(--surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {sort === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => onMove(-1)} disabled={isFirst} title="Move up" style={{ width: 22, fontSize: 11 }}>
              ▲
            </button>
            <button onClick={() => onMove(1)} disabled={isLast} title="Move down" style={{ width: 22, fontSize: 11 }}>
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
              fontSize: 15,
              fontWeight: 'bold',
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              marginBottom: 4,
            }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <Chip label={plan.status} color={STATUS_COLOR[plan.status]} />
            <Chip label={plan.priority} color={PRIORITY_COLOR[plan.priority]} />
            {plan.market && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{plan.market}</span>}
            {plan.timeline && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>· {plan.timeline}</span>}
          </div>
          {plan.opportunity && <p style={{ fontSize: 13, margin: '0 0 6px' }}>{plan.opportunity}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setExpanded((v) => !v)} style={{ fontSize: 11 }}>
              {expanded ? 'Collapse ▲' : 'Details ▼'}
            </button>
            <button onClick={onOpen} title="Open full page" style={{ fontSize: 11 }}>
              ⤢
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={onDuplicate} title="Duplicate" style={{ fontSize: 11 }}>
              ⧉
            </button>
            <button onClick={onArchive} title="Archive" style={{ fontSize: 11 }}>
              🗄
            </button>
            <button onClick={onDelete} title="Delete" style={{ fontSize: 11 }}>
              ✕
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
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
        <span style={{ flex: 1, fontSize: 11, color: 'var(--text-faint)' }}>
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
          fontWeight: 'bold',
          border: 'none',
          borderBottom: `2px solid ${STATUS_COLOR[plan.status]}`,
          background: 'transparent',
          color: 'var(--text)',
          padding: '0 0 6px',
          marginBottom: 16,
        }}
      />

      <PlanDetail plan={plan} {...handlers} />
    </div>
  );
}

// ── Table view ──────────────────────────────────────────────────────
// Legacy's dense per-project summary row (13256-13624). Its three
// columns are PROJECT NAME / SUPPLIER / ROADMAP, weighted 56/24/20 —
// kept here, because the point of this view is scanning many plans at
// once and a column set chosen per-view would defeat the comparison.
const TBL_COLS: [string, number][] = [
  ['PROJECT NAME', 56],
  ['SUPPLIER', 24],
  ['ROADMAP', 20],
];

function TableHeader() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: TBL_COLS.map(([, w]) => `${w}fr`).join(' '),
        // Legacy: 2px rules above and below the header, 1px between
        // rows — "the weight difference is what makes the header read as
        // a header without needing a fill colour behind it."
        borderTop: '2px solid var(--text)',
        borderBottom: '2px solid var(--text)',
      }}
    >
      {TBL_COLS.map(([label], i) => (
        <div
          key={label}
          style={{
            // Muted, not full strength: a column header is read once to
            // learn the layout and should never again compete with the
            // plan titles under it.
            fontSize: 10,
            letterSpacing: 0.5,
            color: 'var(--text-faint)',
            padding: '4px 8px',
            borderLeft: i ? '1px solid var(--border)' : undefined,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function TableRow({ plan, onOpen }: { plan: BdpPlan; onOpen: () => void }) {
  const acts = plan.next_actions;
  const done = acts.filter((a) => a.done).length;
  return (
    <div
      onClick={onOpen}
      title="Open this plan"
      style={{
        display: 'grid',
        gridTemplateColumns: TBL_COLS.map(([, w]) => `${w}fr`).join(' '),
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${STATUS_COLOR[plan.status]}`,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <div style={{ padding: '6px 8px', minWidth: 0 }}>
        <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {plan.title}
        </div>
        <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
          {plan.status} · {plan.priority}
          {plan.market ? ` · ${plan.market}` : ''}
        </div>
      </div>
      <div style={{ padding: '6px 8px', borderLeft: '1px solid var(--border)', opacity: plan.supplier ? 1 : 0.4, minWidth: 0 }}>
        {plan.supplier || '—'}
      </div>
      <div style={{ padding: '6px 8px', borderLeft: '1px solid var(--border)', minWidth: 0 }}>
        <span style={{ opacity: plan.timeline ? 1 : 0.4 }}>{plan.timeline || '—'}</span>
        {acts.length > 0 && (
          <span style={{ opacity: 0.6 }}>
            {' '}· {done}/{acts.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────────
// Legacy's compact one-line row (13668-13723): index and title on the
// left, then market | status | priority | timeline | actions on the
// right, with the status colour as a 3px stripe.
function ListRow({ plan, index, onOpen }: { plan: BdpPlan; index: number; onOpen: () => void }) {
  const acts = plan.next_actions;
  const bits = [plan.market || '—', plan.status, plan.priority, plan.timeline || '—'];
  if (acts.length > 0) bits.push(`${acts.filter((a) => a.done).length}/${acts.length}`);
  return (
    <div
      onClick={onOpen}
      title="Open this plan"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${STATUS_COLOR[plan.status]}`,
        background: 'var(--surface)',
        padding: '5px 8px',
        marginBottom: 2,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {index}. {plan.title}
      </span>
      <span style={{ color: 'var(--text-faint)', fontSize: 11, whiteSpace: 'nowrap' }}>{bits.join('   |   ')}</span>
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

  const refresh = () => bdpApi.list({ status: fStatus, priority: fPriority, market: fMarket, q, sort }).then(setPlans);

  useEffect(() => {
    bdpApi.getSort().then((s) => setSort(s.sort));
    bdpApi.getView().then((v) => setView(v.view));
  }, []);

  useEffect(() => {
    refresh().then(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fPriority, fMarket, q, sort]);

  const changeSort = (v: BdpSort) => {
    setSort(v);
    bdpApi.setSort(v);
  };

  const changeView = (v: BdpView) => {
    setView(v);
    bdpApi.setView(v);
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

  // Drag-to-reorder, manual sort only. The dragged row is not moved on
  // screen; the position it would land in is marked instead and the list
  // re-renders once on drop — legacy's own reasoning (13280-13300), and
  // it holds here too: reordering live under the cursor fights the
  // scroll position for no extra clarity.
  const dragProps = (p: BdpPlan, i: number) =>
    sort !== 'manual'
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
            if (id !== null && plans.findIndex((x) => x.id === id) !== i) {
              bdpApi.reorder(id, i).then(setPlans);
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

  const openPlan = openId === null ? null : plans.find((p) => p.id === openId) ?? null;
  if (openPlan) {
    const idx = plans.findIndex((p) => p.id === openPlan.id);
    return (
      <PlanPage
        plan={openPlan}
        index={idx}
        total={plans.length}
        // Wraps, matching legacy's modulo in _sibling.
        onGo={(step) => setOpenId(plans[(idx + step + plans.length) % plans.length].id)}
        onClose={() => setOpenId(null)}
        {...handlersFor(openPlan)}
      />
    );
  }
  // A plan that was open but has since been filtered out (or deleted)
  // leaves openId pointing at nothing; fall through to the list rather
  // than rendering a blank panel.

  return (
    <div style={{ maxWidth: view === 'card' ? 820 : 980 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="⌕ Search plans…"
          style={{ fontSize: 12, padding: 5, minWidth: 160 }}
        />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as BdpStatus | 'All')} style={{ fontSize: 12 }}>
          <option value="All">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value as BdpPriority | 'All')} style={{ fontSize: 12 }}>
          <option value="All">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={fMarket} onChange={(e) => setFMarket(e.target.value)} style={{ fontSize: 12 }}>
          <option value="All">All markets</option>
          {MARKETS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button onClick={() => changeSort(sort === 'manual' ? 'priority' : 'manual')} style={{ fontSize: 12 }}>
          ⇅ {sort === 'manual' ? 'Manual' : 'Priority'}
        </button>
        <div role="radiogroup" aria-label="View" style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          {(['card', 'table', 'list'] as BdpView[]).map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={view === v}
              onClick={() => changeView(v)}
              title={
                v === 'card'
                  ? 'Card view — one plan at a time, editable in place'
                  : v === 'table'
                    ? 'Table view — dense summary rows'
                    : 'List view — one line per plan'
              }
              style={{
                fontSize: 12,
                fontWeight: view === v ? 'bold' : 'normal',
                background: view === v ? 'var(--accent-light)' : undefined,
              }}
            >
              {v === 'card' ? '▤' : v === 'table' ? '▦' : '☰'}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submitNew} style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="+ New plan — business name…"
          style={{ flex: 1, fontSize: 13, padding: 6 }}
        />
        <button type="submit">Add</button>
      </form>

      {plans.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No plans match — try clearing filters.</p>}

      {view === 'table' && plans.length > 0 && <TableHeader />}

      {plans.map((p, i) =>
        view === 'card' ? (
          <div key={p.id} {...dragProps(p, i)}>
            <PlanCard
              plan={p}
              isFirst={i === 0}
              isLast={i === plans.length - 1}
              sort={sort}
              onOpen={() => setOpenId(p.id)}
              onMove={(direction) => bdpApi.move(p.id, direction).then(setPlans)}
              onDuplicate={() => bdpApi.duplicate(p.id).then(refresh)}
              onArchive={() => bdpApi.archive(p.id).then(refresh)}
              onDelete={() => bdpApi.remove(p.id).then(refresh)}
              {...handlersFor(p)}
            />
          </div>
        ) : view === 'table' ? (
          <div key={p.id} {...dragProps(p, i)}>
            <TableRow plan={p} onOpen={() => setOpenId(p.id)} />
          </div>
        ) : (
          <div key={p.id} {...dragProps(p, i)}>
            <ListRow plan={p} index={i + 1} onOpen={() => setOpenId(p.id)} />
          </div>
        ),
      )}
    </div>
  );
}
