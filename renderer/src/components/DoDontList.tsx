import { useEffect, useState } from 'react';
import { Check, Flame, X } from 'lucide-react';
import { HabitItem, HabitKind, HabitPriority, habitsApi } from '../services/api';
import { RADIUS } from '../spacing';
import { useAutofocus } from '../hooks/useAutofocus';

// Daily DO/DON'T commitments — "wake up early" (do), "stop smoking"
// (don't) — checked off fresh every day, with a running streak.
// Panel-wide on Morning Ritual (not the 90-Day Plan/Transformation
// screen — see docs/superpowers/specs/2026-09-22-daily-dos-donts-
// design.md for why): this is the screen actually opened daily, unlike
// the 90-Day Plan, and DisciplineModuleCards.tsx's own history records
// that a flat checklist on an infrequently-opened screen already failed
// once here.

const PRIORITY_COLOR: Record<HabitPriority, string> = {
  high: 'var(--danger)',
  normal: 'var(--text-muted)',
  low: 'var(--text-faint)',
};

const NEXT_PRIORITY: Record<HabitPriority, HabitPriority> = {
  normal: 'high',
  high: 'low',
  low: 'normal',
};

function todayIso(): string {
  // NOT toISOString().slice(0, 10) — that's UTC, and this app's
  // backend computes "today" from the server's LOCAL date (Python's
  // date.today()). East of UTC, toISOString() names yesterday between
  // midnight and sunrise local time, silently checking habits into the
  // wrong day. Same local-date construction MorningRitualTrend.tsx
  // already uses correctly.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function PriorityPill({ priority, onCycle }: { priority: HabitPriority; onCycle: () => void }) {
  return (
    <button
      onClick={onCycle}
      title={`Priority: ${priority} — click to change to ${NEXT_PRIORITY[priority]}`}
      style={
        priority === 'normal'
          ? {
              width: 8,
              height: 8,
              flex: 'none',
              border: `1px solid ${PRIORITY_COLOR[priority]}`,
              borderRadius: RADIUS.pill,
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
            }
          : {
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: PRIORITY_COLOR[priority],
              background: `color-mix(in srgb, ${PRIORITY_COLOR[priority]} 14%, transparent)`,
              border: 'none',
              borderRadius: RADIUS.pill,
              padding: '2px 8px',
              cursor: 'pointer',
              flex: 'none',
            }
      }
    >
      {priority === 'normal' ? '' : priority}
    </button>
  );
}

function HabitRow({ item, onChanged }: { item: HabitItem; onChanged: (items: HabitItem[]) => void }) {
  const [name, setName] = useState(item.name);
  const [time, setTime] = useState(item.time);
  const [trackingBasis, setTrackingBasis] = useState(item.tracking_basis);
  useEffect(() => setName(item.name), [item.name]);
  useEffect(() => setTime(item.time), [item.time]);
  useEffect(() => setTrackingBasis(item.tracking_basis), [item.tracking_basis]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${item.done_today ? 'var(--success)' : 'transparent'}`,
        borderRadius: RADIUS.control,
        padding: '8px 12px',
        background: 'var(--surface)',
      }}
    >
      <button
        onClick={() => habitsApi.checkin(item.id, todayIso(), !item.done_today).then(onChanged)}
        aria-pressed={item.done_today}
        aria-label={item.done_today ? `Mark ${item.name} not done today` : `Mark ${item.name} done today`}
        title={item.done_today ? 'Done today' : 'Mark done today'}
        style={{
          width: 20,
          height: 20,
          flex: 'none',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: RADIUS.pill,
          border: `1px solid ${item.done_today ? 'var(--success)' : 'var(--text-faint)'}`,
          background: item.done_today ? 'var(--success)' : 'transparent',
          color: item.done_today ? 'var(--on-accent)' : 'transparent',
        }}
      >
        <Check size={12} />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && habitsApi.edit(item.id, { name: name.trim() }).then(onChanged)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{
            width: '100%',
            fontSize: 14,
            fontWeight: 600,
            border: 'none',
            background: 'transparent',
            padding: 0,
            textDecoration: item.done_today ? 'line-through' : undefined,
            color: item.done_today ? 'var(--text-muted)' : 'var(--text)',
          }}
        />
        <input
          value={trackingBasis}
          onChange={(e) => setTrackingBasis(e.target.value)}
          onBlur={() => trackingBasis !== item.tracking_basis && habitsApi.edit(item.id, { tracking_basis: trackingBasis }).then(onChanged)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="How you'll know this counts — optional"
          style={{ width: '100%', fontSize: 12, color: 'var(--text-faint)', border: 'none', background: 'transparent', padding: 0, marginTop: 2 }}
        />
      </div>

      <input
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onBlur={() => time !== item.time && habitsApi.edit(item.id, { time }).then(onChanged)}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="Time"
        style={{ width: 64, flex: 'none', fontSize: 12, color: 'var(--text-faint)', padding: '2px 4px' }}
      />

      <PriorityPill
        priority={item.priority}
        onCycle={() => habitsApi.edit(item.id, { priority: NEXT_PRIORITY[item.priority] }).then(onChanged)}
      />

      <div
        title={`${item.streak}-day streak`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          fontSize: 12,
          fontWeight: 600,
          color: item.streak > 0 ? 'var(--warning)' : 'var(--text-faint)',
          flex: 'none',
          width: 28,
        }}
      >
        <Flame size={12} />
        {item.streak}
      </div>

      <button
        onClick={() => habitsApi.remove(item.id).then(onChanged)}
        aria-label={`Remove ${item.name}`}
        title="Remove"
        style={{ padding: '2px 4px', border: 'none', background: 'transparent', color: 'var(--text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', flex: 'none' }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

function HabitSection({
  kind,
  label,
  items,
  onChanged,
}: {
  kind: HabitKind;
  label: string;
  items: HabitItem[];
  onChanged: (items: HabitItem[]) => void;
}) {
  const [composing, setComposing] = useState(false);
  const [newName, setNewName] = useState('');
  const newNameRef = useAutofocus<HTMLInputElement>(composing);

  const submit = () => {
    const text = newName.trim();
    if (!text) return;
    habitsApi.create(kind, text).then((items) => {
      onChanged(items);
      setNewName('');
      setComposing(false);
    });
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--text-faint)', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <HabitRow key={item.id} item={item} onChanged={onChanged} />
        ))}
      </div>
      {composing ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          <input
            ref={newNameRef}
            value={newName}
            aria-label={label === 'DO' ? 'New do' : "New don't"}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') {
                setNewName('');
                setComposing(false);
              }
            }}
            placeholder={kind === 'do' ? 'e.g. Wake up early' : 'e.g. Stop smoking'}
            style={{ flex: 1, fontSize: 13, padding: 4 }}
          />
        </div>
      ) : (
        <button onClick={() => setComposing(true)} className="link" style={{ fontSize: 12, marginTop: 8 }}>
          + Add
        </button>
      )}
    </div>
  );
}

export default function DoDontList() {
  const [items, setItems] = useState<HabitItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    habitsApi.list().then(setItems).catch(() => setLoadError(true));
  }, []);

  if (loadError) {
    return (
      <div
        style={{
          fontSize: 12,
          color: 'var(--danger)',
          background: 'var(--surface)',
          border: '1px solid var(--danger)',
          borderRadius: RADIUS.control,
          padding: '8px 12px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        Couldn't load your do's and don'ts — check the app is connected.
        <button
          className="btn-ghost"
          style={{ fontSize: 12 }}
          onClick={() => {
            setLoadError(false);
            habitsApi.list().then(setItems).catch(() => setLoadError(true));
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (items === null) return null;

  const dos = items.filter((i) => i.kind === 'do');
  const donts = items.filter((i) => i.kind === 'dont');

  return (
    <div style={{ marginBottom: 32 }}>
      <HabitSection kind="do" label="DO" items={dos} onChanged={setItems} />
      <HabitSection kind="dont" label="DON'T" items={donts} onChanged={setItems} />
    </div>
  );
}
