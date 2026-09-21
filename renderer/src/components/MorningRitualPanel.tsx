import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import MorningRitualFlow from './MorningRitualFlow';
import MorningRitualTrend from './MorningRitualTrend';

// Host for the two guided-module screens (Zahid's 2026-09-14
// brainstorm). Only reachable from the Discipline tab's own Resume/
// History buttons (PlanReview.tsx -> DisciplineTab -> DisciplineModuleCards)
// now — the Tools menu's old "Morning Ritual" entry and this panel's own
// 3-card 'home' screen were removed outright (Zahid, 2026-09-18: "eta
// kaj e ashbe na", after the Discipline tab grew the same card row and
// Resume/History started deep-linking past it — a page nothing could
// reach anymore).
//
// Second pass, same day (Zahid: opening this blanked the whole window,
// wanted it "in panel 2" instead): moved from a full-window overlay
// into Panel 2 (App.tsx's Goals column) — that column is already wider
// than a fixed-width overlay's chrome left room for, and Panel 1/3
// stay visible on either side instead of the app disappearing. App.tsx
// now owns whether this panel is mounted at all; onBack is this
// panel's own way to ask it to unmount (back to GoalsPanel), replacing
// the old full-window "← Back" bar this panel relied on entirely.
//
// initialView is always the concrete screen the caller wants; there is
// no neutral landing state to fall back to.
type View = 'flow' | 'trend';

export default function MorningRitualPanel({ initialView, onBack }: { initialView: View; onBack: () => void }) {
  const [view, setView] = useState<View>(initialView);

  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back to Goals
      </button>
      {view === 'flow' ? (
        <MorningRitualFlow onViewTrend={() => setView('trend')} />
      ) : (
        <MorningRitualTrend accent="var(--accent)" />
      )}
    </div>
  );
}
