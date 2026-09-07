import { useEffect, useState } from 'react';
import { ProjectOrderEntry, TodayProgress, projectsApi } from '../services/api';
import ClockCard from './ClockCard';
import DeepWorkTrend from './DeepWorkTrend';
import PlanReview from './PlanReview';
import TaskList from './TaskList';
import TodayProgressBar from './TodayProgressBar';
import { useL } from '../i18n';

// Panel 3 — legacy's `_build_left` (the naming is legacy's own; it is the
// RIGHT-hand column). Fixed width, always visible, and the only panel
// compact mode keeps: it is the one thing on the critical path to a
// usable window.
//
// The PLAN / EXECUTE pair names the MODE, not the widgets. Legacy's own
// note on the labels is worth keeping: the stored keys stay
// "classic"/"focus" so no saved setting is invalidated, and "FOCUS"
// became "EXECUTE" because "focus" was already spoken for — Ctrl+F opens
// Focus Mode, which is the panel collapse, an unrelated thing that
// happened to share the word.
//
// PLAN's lower half is the review card, NOT a second copy of the task
// list. Legacy tried both and removed it: "having it on both tabs meant
// two places to look for the same four items, and PLAN is where you step
// back and look at the week, not where you tick things off."

type View = 'classic' | 'focus';

export default function Panel3({
  focusVersion,
  onFocusChanged,
  view,
  onSelectView,
  compact,
  onToggleLayout,
  onOpenQuarterly,
}: {
  focusVersion: number;
  onFocusChanged: () => void;
  view: View;
  onSelectView: (v: View) => void;
  compact: boolean;
  onToggleLayout: () => void;
  onOpenQuarterly: () => void;
}) {
  const L = useL();
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  const [progress, setProgress] = useState<TodayProgress | null>(null);

  // Only the EXECUTE view draws the progress bar, so only it pays for
  // the fetch — PLAN would otherwise poll two endpoints it never shows.
  useEffect(() => {
    if (view !== 'focus') return;
    projectsApi.order().then(setOrder);
    projectsApi.todayProgress().then(setProgress);
  }, [view]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      {/* Legacy pins a chevron to each collapsible panel's top-left
          corner, showing what THIS click would do next rather than the
          current state. Panel 3's toggles panels 1+2 together. */}
      <button
        onClick={onToggleLayout}
        title={compact ? 'Show all panels (Ctrl+F)' : 'Focus mode — this panel only (Ctrl+F)'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 2,
          fontSize: 11,
          padding: '0 4px',
          lineHeight: '18px',
        }}
      >
        {/* Legacy: `text="▶" if _shown else "◀"` — the arrow shows the
            state of the panels this button controls, so it reads ▶ while
            they are visible. Both chevrons were inverted. */}
        {compact ? '◀' : '▶'}
      </button>

      <div style={{ display: 'flex', gap: 4, marginBottom: 10, paddingLeft: 24 }}>
        {(
          [
            ['classic', L('PLAN', 'পরিকল্পনা')],
            ['focus', L('EXECUTE', 'কাজ')],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onSelectView(key)}
            aria-pressed={view === key}
            style={{
              flex: 1,
              padding: '6px 0',
              fontWeight: 'bold',
              fontSize: 12,
              letterSpacing: 0.5,
              // Selected: filled accent with its own contrast colour.
              // Unselected: the panel surface. Legacy uses exactly this
              // pair, and no icons — colour emoji ignore the theme's
              // foreground and render in their own fixed colours, which
              // was the single most visible "hobbyist" tell in the app.
              background: view === key ? 'var(--accent)' : 'var(--surface)',
              color: view === key ? 'var(--on-accent)' : 'var(--text)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
        <ClockCard />

        {view === 'classic' ? (
          <>
            <DeepWorkTrend />
            <PlanReview onOpenQuarterly={onOpenQuarterly} />
          </>
        ) : (
          <>
            {progress && <TodayProgressBar entries={order} progress={progress} />}
            <TaskList listKey="focus" focusVersion={focusVersion} onFocusChanged={onFocusChanged} />
          </>
        )}
      </div>
    </div>
  );
}
