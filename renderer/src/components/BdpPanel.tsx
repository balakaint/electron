import { useEffect, useState } from 'react';
import { BdpPlan, BdpPriority, BdpSort, BdpStatus, bdpApi } from '../services/api';

const STATUSES: BdpStatus[] = ['IDEA', 'OPPORTUNITY', 'RESEARCH', 'PLAN', 'ACTIVE', 'HOLD', 'DONE'];
const PRIORITIES: BdpPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
const MARKETS = ['Bangladesh', 'USA', 'Global', 'Other'];

const STATUS_COLOR: Record<BdpStatus, string> = {
  IDEA: '#5255EF',
  OPPORTUNITY: '#117B38',
  RESEARCH: '#0891B2',
  PLAN: '#A15904',
  ACTIVE: '#7C3AED',
  HOLD: '#78716C',
  DONE: '#64748B',
};
const PRIORITY_COLOR: Record<BdpPriority, string> = { HIGH: '#D02222', MEDIUM: '#A15904', LOW: '#64748B' };

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
      <button onClick={() => onChange(Math.max(1, value - 1))} style={{ width: 20 }}>
        −
      </button>
      <span style={{ fontFamily: 'monospace', minWidth: 60, textAlign: 'center' }}>
        {'★'.repeat(value)}
        {'·'.repeat(5 - value)}
      </span>
      <button onClick={() => onChange(Math.min(5, value + 1))} style={{ width: 20 }}>
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
            background: o === value ? colors[o] : 'var(--surface-2, #eee)',
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
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const common = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => v !== value && onSave(v),
    placeholder,
    style: { width: '100%', fontSize: 12, padding: 4, boxSizing: 'border-box' as const },
  };
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>{label}</div>
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
      <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
        NEXT ACTIONS {plan.next_actions.filter((a) => a.done).length}/{plan.next_actions.length}
      </div>
      {plan.next_actions.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <button onClick={() => onToggle(a.id)} style={{ width: 18 }}>
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
          <button onClick={() => onDelete(a.id)}>✕</button>
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

function PlanCard({
  plan,
  isFirst,
  isLast,
  sort,
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
            <button onClick={() => onMove(-1)} disabled={isFirst} style={{ width: 22, fontSize: 11 }}>
              ▲
            </button>
            <button onClick={() => onMove(1)} disabled={isLast} style={{ width: 22, fontSize: 11 }}>
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
            {plan.market && <span style={{ fontSize: 11, opacity: 0.6 }}>{plan.market}</span>}
            {plan.timeline && <span style={{ fontSize: 11, opacity: 0.6 }}>· {plan.timeline}</span>}
          </div>
          {plan.opportunity && <p style={{ fontSize: 13, margin: '0 0 6px' }}>{plan.opportunity}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <button onClick={() => setExpanded((v) => !v)} style={{ fontSize: 11 }}>
            {expanded ? 'Collapse ▲' : 'Details ▼'}
          </button>
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
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>STATUS</div>
            <ChoiceRow options={STATUSES} value={plan.status} colors={STATUS_COLOR} onChange={(v) => onPatch({ status: v })} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2 }}>PRIORITY</div>
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
        </div>
      )}
    </div>
  );
}

export default function BdpPanel() {
  const [plans, setPlans] = useState<BdpPlan[]>([]);
  const [sort, setSort] = useState<BdpSort>('manual');
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<BdpStatus | 'All'>('All');
  const [fPriority, setFPriority] = useState<BdpPriority | 'All'>('All');
  const [fMarket, setFMarket] = useState<string>('All');
  const [newTitle, setNewTitle] = useState('');
  const [loaded, setLoaded] = useState(false);

  const refresh = () => bdpApi.list({ status: fStatus, priority: fPriority, market: fMarket, q, sort }).then(setPlans);

  useEffect(() => {
    bdpApi.getSort().then((s) => setSort(s.sort));
  }, []);

  useEffect(() => {
    refresh().then(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fPriority, fMarket, q, sort]);

  const changeSort = (v: BdpSort) => {
    setSort(v);
    bdpApi.setSort(v);
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

  return (
    <div style={{ maxWidth: 820 }}>
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

      {plans.length === 0 && <p style={{ opacity: 0.6, fontSize: 13 }}>No plans match — try clearing filters.</p>}

      {plans.map((p, i) => (
        <PlanCard
          key={p.id}
          plan={p}
          isFirst={i === 0}
          isLast={i === plans.length - 1}
          sort={sort}
          onPatch={(patch) => bdpApi.edit(p.id, patch).then(refresh)}
          onMove={(direction) => bdpApi.move(p.id, direction).then(setPlans)}
          onDuplicate={() => bdpApi.duplicate(p.id).then(refresh)}
          onArchive={() => bdpApi.archive(p.id).then(refresh)}
          onDelete={() => bdpApi.remove(p.id).then(refresh)}
          onAddAction={(text) => bdpApi.addAction(p.id, text).then(refresh)}
          onToggleAction={(id) => bdpApi.toggleAction(id).then(refresh)}
          onEditAction={(id, text) => bdpApi.editAction(id, text).then(refresh)}
          onDeleteAction={(id) => bdpApi.deleteAction(id).then(refresh)}
        />
      ))}
    </div>
  );
}
