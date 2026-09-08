import { useEffect, useState } from 'react';
import { CirclePerson, ProjectKey, circleApi } from '../services/api';

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

export default function CircleSection({ projectKey }: { projectKey: ProjectKey }) {
  const [people, setPeople] = useState<CirclePerson[]>([]);
  const [newPerson, setNewPerson] = useState('');

  const refresh = () => circleApi.list(projectKey).then(setPeople);
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, flex: 'none' }}>
        <input
          aria-label="Add a person to this project"
          value={newPerson}
          onChange={(e) => setNewPerson(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add person…"
          style={{ flex: 1, fontSize: 12, padding: 4, height: 24 }}
        />
        <button onClick={add} title="Add person" style={{ height: 24, padding: '0 8px', fontSize: 12 }}>
          + add
        </button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, overflowY: 'auto', minHeight: 0, flex: 1 }}>
        {people.map((p) => (
          <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: p.overdue ? 'var(--danger)' : 'var(--success)',
              }}
            />
            <span style={{ flex: 1 }}>{p.name}</span>
            <span style={{ opacity: 0.6 }}>{p.gap_days === null ? 'never' : `${p.gap_days}d ago`}</span>
            <button
              onClick={() => circleApi.update(p.id, { cadence_days: nextCadence(p.cadence_days) }).then(refresh)}
              title="How often you want to be in touch — click to change"
              style={{ fontSize: 12, color: 'var(--text-muted)' }}
            >
              every {p.cadence_days}d
            </button>
            <button onClick={() => circleApi.markContacted(p.id).then(refresh)} title="Mark contacted today">
              ✓
            </button>
            <button onClick={() => circleApi.remove(p.id).then(refresh)} title="Remove">
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
