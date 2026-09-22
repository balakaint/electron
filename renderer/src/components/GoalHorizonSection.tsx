import { useEffect, useState, type ReactNode } from 'react';
import { Check, Circle } from 'lucide-react';
import { Goal, GoalHorizon, GoalOwnerKey, goalsApi } from '../services/api';
import AccordionSection from './AccordionSection';
import { SPACE } from '../spacing';

// A compact, read-mostly view onto the SAME Goal data Panel 2
// (GoalsPanel) owns and edits in full — the shared body for EXECUTE's
// WEEKLY/MONTHLY/YEARLY levels. One parameterized component rather than
// three near-duplicates, since all three are structurally identical: a
// list of that horizon's goals for the active owner, a checkbox, an
// accent rail. Editing a goal's note/deadline/checklist stays in Panel 2
// — this is a glance, not a second editor (toggling done is the only
// write this component makes).
//
// ⚠ `horizon` here must be the STORED key, not the label shown in Panel
// 2 — GoalsPanel.tsx's own HORIZONS array deliberately crosses them
// (stored "yearly" displays as "WEEKLY GOAL", etc). The caller is
// responsible for passing the horizon that matches what the user
// already understands as "weekly" from Panel 2, not the literal string
// "weekly" — see Panel3.tsx's own comment where this is wired up.
function weekRangeLabel(today = new Date()): string {
  const mondayOffset = (today.getDay() + 6) % 7; // days since Monday, Sun=0 wrapped to 6
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const day = (d: Date) => d.getDate();
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  const year = sunday.getFullYear();
  return monday.getMonth() === sunday.getMonth()
    ? `${day(monday)}–${day(sunday)} ${month(sunday)} ${year}`
    : `${day(monday)} ${month(monday)} – ${day(sunday)} ${month(sunday)} ${year}`;
}

function monthLabel(today = new Date()): string {
  return today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function yearLabel(today = new Date()): string {
  return String(today.getFullYear());
}

export default function GoalHorizonSection({
  horizon,
  ownerKey,
  accent,
  glyph,
  label,
  noun,
  periodKind,
  expanded,
  onToggle,
}: {
  horizon: GoalHorizon;
  ownerKey: GoalOwnerKey;
  accent: string;
  glyph: ReactNode;
  label: string;
  // "priorities" / "goals" / "milestones" — only used in the empty-state
  // copy, so each level still reads as its own thing at a glance.
  noun: string;
  periodKind: 'week' | 'month' | 'year';
  expanded: boolean;
  onToggle: () => void;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  // Distinct from "genuinely zero goals" — without this, a slow or
  // failed fetch rendered identically to a confirmed-empty horizon,
  // telling the user "you have nothing here" when the truth was "still
  // loading" or "couldn't reach the app" (ui-ux-audit, 2026-09-22; same
  // class of bug GoalsPanel.tsx's own loadError already fixed for this
  // exact Goal data — this component just hadn't inherited it).
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const refresh = () => {
    setLoadError(false);
    goalsApi
      .list(ownerKey, horizon)
      .then((gs) => {
        setGoals(gs);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError(true);
        setLoaded(true);
      });
  };

  useEffect(() => {
    setLoaded(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, horizon]);

  const done = goals.filter((g) => g.done).length;
  const period = periodKind === 'week' ? weekRangeLabel() : periodKind === 'month' ? monthLabel() : yearLabel();

  const toggleGoal = (id: number) =>
    goalsApi.toggle(id).then((updated) => setGoals((gs) => gs.map((g) => (g.id === updated.id ? updated : g))));

  return (
    <AccordionSection
      glyph={glyph}
      label={label}
      period={period}
      done={done}
      total={loaded ? goals.length : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: SPACE.sm,
            fontSize: 12,
            color: 'var(--danger)',
            padding: `${SPACE.sm}px 0`,
          }}
        >
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12, flex: 'none' }} onClick={refresh}>
            Retry
          </button>
        </div>
      ) : goals.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
          Nothing here yet — add a {noun} in the Goals panel.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {goals.map((g) => (
            <li key={g.id} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, padding: `${SPACE.xs}px 0` }}>
              <span style={{ width: 3, alignSelf: 'stretch', minHeight: 16, background: g.done ? 'var(--border)' : accent }} />
              <button
                onClick={() => toggleGoal(g.id)}
                title={g.done ? 'Mark not done' : 'Mark done'}
                aria-label={g.done ? 'Mark not done' : 'Mark done'}
                style={{
                  width: 24,
                  height: 24,
                  padding: 0,
                  flex: 'none',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: g.done ? 'var(--success)' : 'var(--text-faint)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {g.done ? <Check size={15} /> : <Circle size={15} />}
              </button>
              <span
                title={g.text}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textDecoration: g.done ? 'line-through' : 'none',
                  color: g.done ? 'var(--text-faint)' : 'var(--text)',
                }}
              >
                {g.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AccordionSection>
  );
}
