import { ArrowLeft } from 'lucide-react';
import NightClosureFlow, { NC } from './NightClosureFlow';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';

// Host for Night Closure, same shape as MorningRitualPanel.tsx — lives
// in Panel 2 (App.tsx's Goals column), App.tsx owns whether it's
// mounted at all, onBack asks it to unmount. Only one screen here (no
// trend/history view — none was asked for), so unlike MorningRitualPanel
// there's no `view` state to hold.
//
// Paints the full-bleed dark background here, not in NightClosureFlow —
// App.tsx's Panel 2 <section> carries no background of its own (it
// normally just shows through the app's live light/dark theme), so
// without this the scoped warm/dim palette only colored text and left
// it floating on the real theme's page background (caught from a
// screenshot: "Close the Day" rendering as near-invisible dim text on
// a cream page).
export default function NightClosurePanel({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ background: NC.bg, minHeight: '100%', width: '100%', boxSizing: 'border-box', padding: SPACE.xl }}>
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.xs,
          fontSize: TYPE_SIZE.xs,
          marginBottom: SPACE.md,
          background: 'transparent',
          border: `1px solid ${NC.border}`,
          borderRadius: RADIUS.control,
          color: NC.inkMuted,
          padding: `${SPACE.xs}px ${SPACE.sm}px`,
        }}
      >
        <ArrowLeft size={14} /> Back to Goals
      </button>
      <NightClosureFlow />
    </div>
  );
}
