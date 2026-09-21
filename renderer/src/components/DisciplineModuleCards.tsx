import { useEffect, useState } from 'react';
import { MorningRitual, NightClosure, morningRitualApi, nightClosureApi } from '../services/api';
import { RADIUS } from '../spacing';
import RitualRing from './RitualRing';

// The card row for the 3 guided Discipline modules (Zahid's 2026-09-14
// brainstorm), embedded in the Discipline tab (PlanReview.tsx ->
// DisciplineTab).
//
// Zahid's own framing for putting these here: the old flat Money/Health/
// Relation/Mind checklist "mainly regular chek kora hoy na" (isn't
// actually checked regularly) — so it and the whole separate Life
// Execution Board it powered were removed outright (his own call, after
// confirming that would also delete today's Win/Reflection notes, which
// had no other home). These 3 cards are what replaced it in the same
// spot.
//
// Redesign (2026-09-15, Zahid: "world class design ... 10 on 10"): the
// original v1 drew all 3 cards at equal visual weight — same size, same
// border style, differing only by accent hue — which meant the one
// REAL, clickable module (Morning Ritual) competed for attention with
// two inert placeholders. This pass makes that hierarchy explicit: the
// active module gets a tinted card, a ring-shaped progress/streak
// indicator, and a filled primary button; the "Coming soon" modules are
// pulled down to a single quiet row each.
//
// Second pass, same day (Zahid: "theam er sathe miss match"): v1 of this
// redesign gave Morning Ritual a FIXED amber accent regardless of the
// active app theme — on Energy theme (red accent) that amber card read
// as visually unrelated to the rest of the app, not as "this app's own
// module." Fixed by dropping the fixed per-module hex entirely and
// using the theme's own `--accent`/`--accent-light`/`--on-accent`
// tokens (already defined per-theme in themes.ts, and already the
// contrast-correct pair for text-on-fill in every theme) — so this card
// now matches whichever theme is active, the same as every other accent
// element in the app, instead of carrying its own fixed identity color.
// Rebuilt 2026-09-15 for the "Morning Activation" continuous-page
// rebuild (see MorningRitualFlow.tsx) — there is no `step` field to
// count against 7 anymore, so status/progress are read off which
// sections have actually been touched instead of a step index.
//
// Used to also render full-size (compact=false) for MorningRitualPanel's
// own 3-card 'home' screen — that screen was removed (2026-09-18, Zahid:
// "eta kaj e ashbe na") once the Discipline tab's Resume/History buttons
// started deep-linking straight past it, leaving this the only caller.
// The full-size styling went with it rather than staying as a dead
// branch no one could reach.
const PROGRESS_FIELDS: (keyof MorningRitual)[] = [
  'today_outcome',
  'first_move',
  'energy',
  'mood',
  'reset_breathe',
  'reset_move',
  'reset_daylight',
  'journal_text',
];

export function statusLine(r: MorningRitual): string {
  if (r.completed) return 'Completed today';
  if (r.started_at === null) return 'Not started today';
  const modeLabel = r.energy ? { gentle: 'Gentle start', standard: 'Standard start', fast: 'Fast start' }[r.morning_mode] : null;
  return modeLabel ?? 'In progress';
}

function ringProgress(r: MorningRitual | null): number {
  if (!r || r.started_at === null) return 0;
  if (r.completed) return 1;
  const done = PROGRESS_FIELDS.filter((f) => !!r[f]).length;
  // Capped below 1 — only Start Now (r.completed) means "done".
  return Math.min(0.9, done / PROGRESS_FIELDS.length);
}

function ringGlyph(r: MorningRitual | null): string {
  if (!r || r.started_at === null) return '☀';
  if (r.completed) return '✓';
  return '☀';
}

export default function DisciplineModuleCards({
  onStart,
  onHistory,
  onOpenNightClosure,
}: {
  onStart: () => void;
  onHistory: () => void;
  onOpenNightClosure: () => void;
}) {
  const [today, setToday] = useState<MorningRitual | null>(null);
  const [streak, setStreak] = useState(0);
  const [tonight, setTonight] = useState<NightClosure | null>(null);

  useEffect(() => {
    morningRitualApi.today().then(setToday);
    morningRitualApi.trend().then((t) => setStreak(t.streak));
    nightClosureApi.today().then(setTonight);
  }, []);

  return (
    <div>
      <div
        className="card-elevated"
        style={{
          background: 'var(--accent-light)',
          border: '1px solid var(--accent)',
          borderRadius: RADIUS.card,
          padding: 12,
          marginBottom: 12,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <RitualRing progress={ringProgress(today)} size={40} stroke={3} accent="var(--accent)">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{ringGlyph(today)}</span>
          </RitualRing>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Morning Ritual</span>
              {streak > 0 && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--on-accent)',
                    background: 'var(--accent)',
                    borderRadius: RADIUS.pill,
                    padding: '0 8px',
                  }}
                >
                  {streak}d streak
                </span>
              )}
            </div>
            {today && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{statusLine(today)}</div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 'none' }}>
            <button
              onClick={onStart}
              disabled={!today}
              style={{
                background: 'var(--accent)',
                borderColor: 'var(--accent)',
                color: 'var(--on-accent)',
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 16px',
              }}
            >
              {today?.completed ? 'Review' : today?.started_at ? 'Resume' : 'Start'}
            </button>
            <button onClick={onHistory} className="btn-ghost" style={{ fontSize: 12 }}>
              History
            </button>
          </div>
        </div>
      </div>

      {/* Night Closure — live, same tinted-card treatment as Morning
          Ritual above, since it's a real module now (converted from
          Zahid's night-closure.html mockup), not a "Soon" placeholder. */}
      <div
        className="card-elevated"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          padding: 12,
          marginBottom: 8,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <span style={{ fontSize: 16, color: 'var(--text-faint)', flex: 'none' }}>☾</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Night Closure</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {tonight?.closed_at ? 'Closed tonight' : 'Not closed yet'}
          </div>
        </div>
        <button
          onClick={onOpenNightClosure}
          className="btn-ghost"
          style={{ fontSize: 12, fontWeight: 600, flex: 'none' }}
        >
          {tonight?.closed_at ? 'Review' : 'Open'}
        </button>
      </div>

      {[{ label: 'Exercise', icon: '◆', desc: "Today's set, logged and tracked." }].map((m) => (
        <div
          key={m.label}
          className="card-elevated"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            padding: 8,
            marginBottom: 8,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <span style={{ fontSize: 16, color: 'var(--text-faint)', flex: 'none' }}>{m.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{m.label}</div>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-faint)',
              border: '1px solid var(--border)',
              borderRadius: RADIUS.pill,
              padding: '0 8px',
              flex: 'none',
            }}
          >
            Soon
          </span>
        </div>
      ))}
    </div>
  );
}
