import { useEffect, useState } from 'react';
import { FocusTab, ProjectOrderEntry, TodayProgress, projectsApi, settingsApi } from '../services/api';
import ClockCard from './ClockCard';
import HourPlanTab from './HourPlan';
import NowCard from './NowCard';
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

// Level 2, and it must not look like level 1. PLAN|EXECUTE is a filled
// segmented control; these are underlined text tabs. Legacy's reason
// (5199-5207): both strips drew the selected item as a full accent block
// of the same height and weight, so nothing on screen said which strip
// contained the other. The unselected tabs carry a transparent rule of
// the same height, so switching does not shift the row.
//
// Order is the order of the day, left to right: the hours you have, the
// few things that matter in them, then everything else you wrote down.
// HOURS leads because it is the one you open the app inside — the
// question at the start of a block is "what hour am I in".
const FOCUS_TABS: [FocusTab, string, string][] = [
  ['hours', 'HOURS', 'ঘণ্টা'],
  ['mit', 'MIT', 'MIT'],
  ['list', 'TASK LIST', 'টাস্ক লিস্ট'],
];

function FocusTabs({ tab, onSelect }: { tab: FocusTab; onSelect: (t: FocusTab) => void }) {
  const L = useL();
  return (
    <div role="tablist" style={{ display: 'flex', marginBottom: 10 }}>
      {FOCUS_TABS.map(([key, en, bn]) => {
        const on = tab === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(key)}
            style={{
              flex: 1,
              padding: '6px 0 5px',
              fontSize: 12,
              letterSpacing: 0.5,
              fontWeight: on ? 'bold' : 'normal',
              color: on ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {L(en, bn)}
          </button>
        );
      })}
    </div>
  );
}

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
  // Null until settings answer, so the strip does not paint HOURS and
  // then jump to the tab the user actually left it on.
  const [tab, setTabState] = useState<FocusTab | null>(null);
  const [nowBump, setNowBump] = useState(0);

  useEffect(() => {
    settingsApi.get().then((s) => setTabState(s.focus_tab));
  }, []);

  const selectTab = (next: FocusTab) => {
    setTabState(next);
    settingsApi.update({ focus_tab: next });
  };

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

      {/* paddingLeft clears the collapse chevron pinned top-left; the
          RIGHT padding clears the gear pinned top-right by App.tsx, and
          was missing. Measured: the gear ran 1461-1488 and the EXECUTE
          button 1230-1488 — identical right edges, so the gear sat on
          top of the selected button's fill. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10, paddingLeft: 24, paddingRight: 30 }}>
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
        {view === 'classic' ? (
          <>
            {/* The wall clock, the day-phase bars and the TODAY / MONTH
                / YEAR cards belong to PLAN and only PLAN. They were
                rendering on both screens here. Legacy is explicit
                (4996-5045): on EXECUTE the date is "deliberately demoted
                to one quiet header line", the stat cards "moved to the
                PLAN screen entirely", and the wall clock is dropped
                outright because TODAY EXECUTION already prints the live
                time inside the hour you are in — "the same number doing
                more work". Two bold clocks made both read as less
                trustworthy. */}
            <ClockCard />
            <DeepWorkTrend />
            <PlanReview onOpenQuarterly={onOpenQuarterly} />
          </>
        ) : (
          <>
            {/* One card, not two: "what day is it" and "how much of it
                have you spent" are one thought, and a second bordered
                card for two short rows would cost ~14px of chrome to say
                so (legacy 5023-5027). */}
            <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 6 }}>
                {/* "Tuesday, 8 Sep 2026" — legacy's own order
                    (f"{dayname}, {now.day} {now.strftime('%b %Y')}",
                    5020). toLocaleDateString with the default locale
                    gives "Tuesday, Sep 8, 2026" on a US machine, which
                    is a different reading order in the one line that
                    tells you what day it is. Assembled from parts so it
                    reads the same wherever it runs. */}
                {(() => {
                  const d = new Date();
                  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
                  const month = d.toLocaleDateString(undefined, { month: 'short' });
                  return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`;
                })()}
              </div>
              {progress && <TodayProgressBar entries={order} progress={progress} />}
            </div>

            {/* NOW stays ABOVE the tabs, never inside one. It is the
                single thing you are doing; hiding it behind a tab would
                make the answer to "what now" depend on which tab you
                last clicked (legacy 5177-5180). */}
            <NowCard
              refreshSignal={nowBump}
              onChanged={() => setNowBump((b) => b + 1)}
              // An empty NOW with a real choice to make hands you over
              // to the tab where that choice is made, rather than
              // reprinting the list here.
              onGoToMit={() => selectTab('mit')}
            />

            {tab && (
              <FocusTabs tab={tab} onSelect={selectTab} />
            )}

            {tab === 'hours' && <HourPlanTab />}
            {tab === 'mit' && (
              <TaskList
                listKey="focus"
                dayView="today"
                focusVersion={focusVersion}
                onFocusChanged={onFocusChanged}
              />
            )}
            {tab === 'list' && (
              <TaskList
                listKey="focus"
                dayView="tomorrow"
                focusVersion={focusVersion}
                onFocusChanged={onFocusChanged}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
