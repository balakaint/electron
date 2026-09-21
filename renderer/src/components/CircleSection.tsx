import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { CirclePerson, ProjectKey, circleApi } from '../services/api';
import { RADIUS } from '../spacing';

// The accountability circle for ONE project.
//
// This lived on the project card, which is not where legacy keeps it:
// _build_circle_section is called from _open_detail_window (11091), the
// project's Analysis page. Legacy's own docstring says it was
// "generalised out of the old PLAN tab so it can live on the project
// page" — so the card was never its home in either version, and having
// it there was a large part of why the cards were tall enough that only
// two fit on screen.

// Matches the legacy app's _CIRCLE_CADENCES exactly.
const CADENCE_PRESETS = [1, 3, 7, 14, 30];

function nextCadence(current: number): number {
  const i = CADENCE_PRESETS.indexOf(current);
  // A value that isn't one of the presets (older data, or a hand-edited
  // file) steps to 7 rather than staying stuck.
  return i === -1 ? 7 : CADENCE_PRESETS[(i + 1) % CADENCE_PRESETS.length];
}

export default function CircleSection({
  projectKey,
  onCount,
}: {
  projectKey: ProjectKey;
  /** Lets the card around this one show an empty rail when nobody is listed. */
  onCount?: (n: number) => void;
}) {
  const [people, setPeople] = useState<CirclePerson[]>([]);
  const [newPerson, setNewPerson] = useState('');

  const refresh = () =>
    circleApi.list(projectKey).then((rows) => {
      setPeople(rows);
      onCount?.(rows.length);
    });
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  const add = () => {
    const nm = newPerson.trim();
    if (!nm) return;
    circleApi.add(projectKey, nm).then(() => {
      setNewPerson('');
      refresh();
    });
  };

  // No heading of its own. Its only caller is the PEOPLE card on the
  // Business Analysis page, which is already titled — a "CIRCLE" label
  // inside a card called PEOPLE is the same thing named twice, and the
  // second name is the one nobody uses. The add row also goes FIRST, as
  // legacy has it: the list grows downward from the field that fills it.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flex: 'none' }}>
        <input
          aria-label="Add a person to this project"
          value={newPerson}
          onChange={(e) => setNewPerson(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add person…"
          style={{ flex: 1, fontSize: 13, padding: '0 8px', height: 32, borderRadius: RADIUS.control, border: '1px solid var(--border)' }}
        />
        <button
          onClick={add}
          title="Add person"
          style={{
            height: 32,
            padding: '0 16px',
            fontSize: 13,
            fontWeight: 700,
            borderRadius: RADIUS.control,
            border: 'none',
            background: 'var(--ba-decide)',
            color: '#000000',
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>
      {/* Real tile cards, not tiny pills — an avatar initial, the name,
          last-contacted, and the cadence/mark/remove controls on their
          own row, wrapping into a responsive grid so a couple of people
          don't look lost in a big empty card. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
          overflowY: 'auto',
          minHeight: 0,
          flex: 1,
          alignContent: 'flex-start',
        }}
      >
        {people.map((p) => (
          <div
            key={p.id}
            className="card-elevated"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: 12,
              borderRadius: RADIUS.card,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              minWidth: 0,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  flex: 'none',
                  borderRadius: RADIUS.pill,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ba-decide)',
                  background: 'color-mix(in srgb, var(--ba-decide) 16%, var(--surface))',
                }}
              >
                {(p.name.trim().charAt(0) || '?').toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {p.gap_days === null ? 'never contacted' : `${p.gap_days}d ago`}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => circleApi.update(p.id, { cadence_days: nextCadence(p.cadence_days) }).then(refresh)}
                title="Cadence — click to change"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 24,
                  padding: '0 8px',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: RADIUS.control,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: RADIUS.pill,
                    background: p.overdue ? 'var(--danger)' : 'var(--success)',
                  }}
                />
                every {p.cadence_days}d
              </button>
              <span style={{ flex: 1 }} />
              <button onClick={() => circleApi.markContacted(p.id).then(refresh)} title="Mark contacted today" aria-label="Mark contacted today" style={{ display: 'flex', padding: 4, color: 'var(--success)' }}>
                <Check size={14} />
              </button>
              <button onClick={() => circleApi.remove(p.id).then(refresh)} title="Remove" aria-label="Remove" style={{ display: 'flex', padding: 4, color: 'var(--text-muted)' }}>
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
