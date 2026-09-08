import { useEffect, useState } from 'react';
import { ListKey, PanelLayout, ProjectKey, exportApi, goalsApi, settingsApi } from './services/api';
import Panel3 from './components/Panel3';
import BusinessAnalysisCanvas from './components/BusinessAnalysisCanvas';
import ToolsMenu from './components/ToolsMenu';
import TitleBar from './components/TitleBar';
import HabitDashboard from './components/HabitDashboard';
import ProjectDashboard from './components/ProjectDashboard';
import GoalsPanel from './components/GoalsPanel';
import JourneyPanel from './components/JourneyPanel';
import BdpPanel from './components/BdpPanel';
import QuarterlyPlanPanel from './components/QuarterlyPlanPanel';
import OnboardingModal from './components/OnboardingModal';
import SettingsDialog from './components/SettingsDialog';
import ShortcutsHelp from './components/ShortcutsHelp';
import UndoToast from './components/UndoToast';
import { UndoProvider, useUndo } from './undo';
import { applyTheme, nextTheme, Theme, THEME_LABELS } from './themes';
import { Lang, LangProvider } from './i18n';

// Legacy's _PANEL3_W / _PANEL_GAP (task_tracker_v3_THEMES.py 1252-1253).
const PANEL3_W = 545;
const PANEL_GAP = 7;

// What is covering the three columns, if anything. Analysis and Journey
// belong to a project; the rest are whole-app screens off the Tools menu.
type Overlay =
  | { kind: 'analysis'; project: ProjectKey }
  | { kind: 'journey'; project: ProjectKey }
  | { kind: 'habits' }
  | { kind: 'bdp' }
  | { kind: 'quarterly' };

function AppShell() {
  // The focus task list is rendered by two panels at once: the project
  // cards' "+ STRIKE" chips in panel 1, and NOW / STRIKE / LIST in panel
  // 3. Each fetched its own copy and never heard about the other's
  // writes, so striking a task in panel 3 left panel 1 believing today
  // still had room — the chip stayed enabled, the server kept answering
  // 409, and clicking it did nothing visible except produce another
  // rejected request.
  //
  // Two counters rather than one, so neither panel can react to its own
  // write: each BUMPS the counter it owns and LISTENS to the other's. A
  // single shared number would have each panel re-fetching in response
  // to itself, which is a loop, not a sync.
  const [panel1Wrote, setPanel1Wrote] = useState(0);
  const [panel3Wrote, setPanel3Wrote] = useState(0);

  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // Which project panel 2 is showing. Persisted server-side already
  // (goalsApi.getPanel), so it survives a restart the way legacy's does.
  const [goalsProject, setGoalsProject] = useState<ProjectKey | null>(null);
  const [tab, setTab] = useState<ListKey>('classic');
  const [theme, setThemeState] = useState<Theme>('focus');
  const [lang, setLang] = useState<Lang>('en');
  // null until settings answer. Defaulting to 'full' meant every launch
  // mounted all three panels and fired ~30 requests (six projects ×
  // subtasks/circle/activity) before the real layout arrived and threw
  // two of them away — and in compact it did that inside a 420px window,
  // which is what "panel 1 and 2 are there but invisible" looked like.
  //
  // Legacy builds panel 3 synchronously and defers 1 and 2 for the same
  // reason, in its own words: panel 3 "is the one panel compact layout
  // actually shows on every launch — the only thing on the critical path
  // to a usable window."
  const [layout, setLayoutState] = useState<PanelLayout | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null); // null = not loaded yet
  // Stored as "when it was opened" rather than a boolean, so the stack
  // above can order them; null means closed.
  const [shortcutsOpenedAt, setShortcutsOpenedAt] = useState<number | null>(null);
  const [settingsOpenedAt, setSettingsOpenedAt] = useState<number | null>(null);
  const shortcutsOpen = shortcutsOpenedAt !== null;
  const settingsOpen = settingsOpenedAt !== null;
  const setShortcutsOpen = (v: boolean) => setShortcutsOpenedAt(v ? Date.now() : null);
  const setSettingsOpen = (v: boolean) => setSettingsOpenedAt(v ? Date.now() : null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const { undo, redo } = useUndo();

  const runExport = async () => {
    setExporting(true);
    try {
      const result = await exportApi.exportAll();
      if (result.ok) {
        setExportStatus(`Saved ${result.filenames?.length ?? 2} files to ${result.folder}`);
      } else if (!result.cancelled) {
        setExportStatus('Export failed');
      }
    } catch {
      setExportStatus('Export failed');
    } finally {
      setExporting(false);
      setTimeout(() => setExportStatus(null), 5000);
    }
  };

  useEffect(() => {
    // Retried for the same reason as every other startup fetch: a single
    // early failure used to latch "not responding" for the rest of the
    // session, on an app that was working perfectly by the time anyone
    // read it. Reporting a failure nobody has confirmed is worse than
    // reporting nothing.
    (async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          await window.api.healthCheck();
          setStatus('ok');
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      setStatus('error');
    })();

    settingsApi.get().then((s) => {
      setThemeState(s.theme);
      applyTheme(s.theme);
      setLang(s.lang);
      goalsApi.getPanel().then((gp) => setGoalsProject(gp.project_key));
      // AppState is the single source of truth for the layout, and this
      // asserts it on every load — including when it says "full".
      //
      // It used to fire only for 'compact', which left the two stores
      // able to disagree in one direction and never be corrected.
      // window-state.json carries its own `compact` flag so the main
      // process can dock before Python is even up (without it the window
      // visibly flashes full-size first), and the two can drift: the
      // geometry save is debounced 400ms, so toggling out of compact and
      // quitting inside that window persists panel_layout="full" while
      // the flag on disk still says compact. The next launch then docked
      // to 420px and rendered three columns into it, with nothing to
      // undock them.
      console.log(`[layout] settings say ${s.panel_layout}; asserting it`);
      setLayoutState(s.panel_layout);
      window.api.setPanelLayout(s.panel_layout);
      setOnboarded(s.onboarded);
    });
  }, []);

  // One place that commits a theme, so the header cycle button, Ctrl+T
  // and the Settings picker cannot drift out of sync — they all land
  // here rather than each doing its own setState/apply/persist trio.
  const selectTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    settingsApi.setTheme(next);
  };

  const cycleTheme = (direction: 1 | -1 = 1) => selectTheme(nextTheme(theme, direction));

  // Legacy's _set_panel_layout: change the mode, persist it, and resize
  // the window to match. Compact that doesn't narrow the window is the
  // failure legacy calls out by name — "empty space with a wandering
  // position" rather than a panel you can work beside.
  const setLayout = (next: PanelLayout) => {
    if (next === layout) return;
    console.log(`[layout] ${layout ?? 'unknown'} -> ${next}`);
    setLayoutState(next);
    window.api.setPanelLayout(next);
    settingsApi.update({ panel_layout: next });
  };

  // Legacy's _toggle_focus_mode (15802-15805) is exactly this: a real
  // toggle off the CURRENT state, not a fixed step. Its own comment
  // explains why — a fixed ±1 clamps at index 0 and the control dies in
  // the collapsed state.
  // Ctrl+F is NOT the same command, and legacy keeps them apart
  // (_toggle_focus_mode, 15803): it jumps between compact and full
  // only. From PARTIAL — panel 1 hidden, panel 2 showing — the
  // chevron's answer is "hide the rest too" and Ctrl+F's is "give me
  // everything back".
  const toggleFocusMode = () => setLayout(layout === 'full' ? 'compact' : 'full');

  // Panel 3's chevron: both side panels, at once. Legacy's
  // _toggle_panel2 (15786) — compact if either is showing, else full.
  //
  // I built this as a stepper — full, partial, compact, one rung a
  // click — after Zahid asked for one. He then showed me the original
  // running beside this port, and one click from collapsed opens BOTH
  // panels there. So this goes back. Partial is not lost: panel 2's own
  // chevron is the control for it, which is the division legacy draws —
  // one button per thing it hides, not one button that walks a ladder.
  const togglePanels = () => setLayout(layout === 'compact' ? 'full' : 'compact');

  const compact = layout === 'compact';
  // Unknown counts as hidden, so nothing mounts on a guess.
  const showP1 = layout === 'full';
  const showP2 = layout === 'full' || layout === 'partial';

  const selectGoalsProject = (key: ProjectKey) => {
    setGoalsProject(key);
    goalsApi.setPanelProject(key);
  };

  // Which dialogs are open, in the order they were opened. A plain
  // "is anything open" boolean can't answer "close the topmost", which
  // is what Escape and Ctrl+W are supposed to do — and dialogs here do
  // stack, since Settings can open Shortcuts.
  const dialogStack: ('settings' | 'shortcuts')[] = [];
  if (settingsOpenedAt !== null) dialogStack.push('settings');
  if (shortcutsOpenedAt !== null) dialogStack.push('shortcuts');
  dialogStack.sort(
    (a, b) =>
      (a === 'settings' ? settingsOpenedAt! : shortcutsOpenedAt!) -
      (b === 'settings' ? settingsOpenedAt! : shortcutsOpenedAt!),
  );

  const closeTopDialog = () => {
    const top = dialogStack[dialogStack.length - 1];
    if (top === 'shortcuts') setShortcutsOpen(false);
    else if (top === 'settings') setSettingsOpen(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inField = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);

      if (e.key === 'F1' || (e.key === '?' && !inField)) {
        e.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
        return;
      }
      // Escape and Ctrl+W both mean "close the topmost thing", which is
      // legacy's own arrangement (Ctrl+W is bound straight to
      // _handle_escape, line 2013). Closing the TOP one matters: the
      // previous version closed both dialogs at once, so opening
      // Shortcuts from Settings and pressing Escape dropped you all the
      // way back to the page instead of returning to Settings.
      if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w')) {
        if (dialogStack.length === 0) return;
        e.preventDefault();
        closeTopDialog();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      if (key === 't') {
        e.preventDefault();
        cycleTheme(e.shiftKey ? -1 : 1);
      } else if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === 'f') {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, shortcutsOpen, settingsOpen, dialogStack.length, layout]);

  return (
    <LangProvider lang={lang}>
    {/* The title bar is OUTSIDE the padded shell, flush to the window's
        own edges — an inset title bar is a strip of chrome floating in a
        margin, which reads as a widget rather than as the top of the
        window. */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
    <TitleBar />
    <div
      style={{
        fontFamily: 'sans-serif',
        padding: compact ? 8 : 12,
        background: 'var(--bg)',
        color: 'var(--text)',
        // Fixed to the viewport, not min-height: the three columns each
        // scroll independently, which is what keeps a long project list
        // from pushing the clock off screen.
        flex: 1,
        minHeight: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Three columns, legacy's own layout (_build_ui 3105-3150) ──
          Panel 1 projects · panel 2 the selected project's goals ·
          panel 3 the clock/PLAN/EXECUTE column, fixed width.

          Panel 3 is fixed and the other two are flexible because panel 3
          is the one compact mode keeps: it must not stretch to fill a
          window the others just left. Legacy's weights are 67:83:50 with
          a minsize on panel 3; the same shape falls out of two fr
          columns beside one fixed 545px. */}
      {/* LANDMARKS.
          axe reported no main, no h1, and 72 elements sitting outside
          any landmark — which is not a cosmetic complaint: a screen
          reader offers "jump to region" as its primary way around an
          app, and this one offered nothing to jump to. The three columns
          already ARE regions to anyone who can see them; this says so in
          markup. Each carries its own name, because "region" without a
          name is a landmark you cannot choose between. */}
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: [
            showP1 ? '67fr' : null,
            showP1 ? '1px' : null,
            showP2 ? '83fr' : null,
            showP2 ? '1px' : null,
            `${PANEL3_W}px`,
          ]
            .filter(Boolean)
            .join(' '),
          gap: PANEL_GAP,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* The app's one h1. Visually hidden rather than drawn: the
            title bar already says HABIT OS to anyone looking at it, and
            a second copy on screen would be the duplication this project
            keeps removing. Hidden with a clip rectangle, NOT
            display:none — the latter takes it out of the accessibility
            tree too, which is the whole point of having it. */}
        <h1
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            whiteSpace: 'nowrap',
          }}
        >
          Habit OS
        </h1>

        {showP1 && (
          // minWidth: 0 is not decoration. A grid item's default
          // min-width is `auto`, so these columns refuse to shrink below
          // their content and the fixed 545px track pushes them out of
          // the window instead — which reads as "panel 1 and 2 vanished"
          // rather than "the window is too narrow".
          <section aria-label="Projects" style={{ overflowY: 'auto', minHeight: 0, minWidth: 0 }}>
            <ProjectDashboard
              focusVersion={panel3Wrote}
              onFocusChanged={() => setPanel1Wrote((v) => v + 1)}
              onOpenAnalysis={(k) => setOverlay({ kind: 'analysis', project: k })}
              onOpenJourney={(k) => setOverlay({ kind: 'journey', project: k })}
              onSelectGoals={selectGoalsProject}
              goalsProject={goalsProject}
              openProject={overlay && 'project' in overlay ? overlay.project : null}
            />
          </section>
        )}
        {showP1 && <div style={{ background: 'var(--border)' }} />}

        {showP2 && (
          <section aria-label="Goals" style={{ overflowY: 'auto', minHeight: 0, minWidth: 0, position: 'relative' }}>
            {/* Panel 2's chevron hides panel 1 only — legacy's
                _toggle_panel1, the middle rung of the ladder. */}
            <button
              onClick={() => setLayout(layout === 'full' ? 'partial' : 'full')}
              title={layout === 'full' ? 'Hide the projects panel' : 'Show the projects panel'}
              style={{ position: 'absolute', top: 0, left: 0, zIndex: 2, fontSize: 12, padding: 0, width: 24, height: 24 }}
            >
              {/* Same direction rule as panel 3's: the panel this hides
                  is to the LEFT, so ▶ sends it away and ◀ brings it
                  back. Legacy's own glyph. */}
              {layout === 'full' ? '▶' : '◀'}
            </button>
            <GoalsPanel projectKey={goalsProject} />
          </section>
        )}
        {showP2 && <div style={{ background: 'var(--border)' }} />}

        <section aria-label="Plan and execute" style={{ minHeight: 0, position: 'relative' }}>
          {/* Legacy pins the gear to panel 3's top-right corner and has
              no app header bar of its own — the window's own title bar
              is the only chrome above the columns. */}
          <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 3 }}>
      <ToolsMenu
        entries={[
          {
            icon: '◈',
            label: 'Life Execution Board',
            desc: 'Habits, scores and daily journal',
            onSelect: () => setOverlay({ kind: 'habits' }),
          },
          {
            icon: '▤',
            label: 'Business Dev Plan',
            desc: 'Opportunity tracker and plan canvas',
            onSelect: () => setOverlay({ kind: 'bdp' }),
          },
          {
            icon: '◷',
            label: '90-Day Plan',
            desc: 'Quarterly outcomes, actions and if-then plans',
            onSelect: () => setOverlay({ kind: 'quarterly' }),
          },
          {
            icon: '◐',
            label: 'Next theme',
            desc: `Currently ${THEME_LABELS[theme]}  ·  Ctrl+T`,
            onSelect: () => cycleTheme(1),
          },
          {
            icon: '◎',
            label: 'Focus Mode',
            desc: 'Tasks only, docked to the screen edge  ·  Ctrl+F',
            onSelect: toggleFocusMode,
          },
          {
            icon: '⚙',
            label: 'Settings',
            desc: 'Language, work hours, export, about',
            onSelect: () => setSettingsOpen(true),
          },
        ]}
      />
          </div>
          <Panel3
            focusVersion={panel1Wrote}
            onFocusChanged={() => setPanel3Wrote((v) => v + 1)}
            view={tab}
            onSelectView={setTab}
            // The arrow is a DIRECTION, not a state and not an action.
            // The panels live to the LEFT of this one, so ◀ is "they
            // come back" and ▶ is "they go away" — which is exactly
            // what legacy draws (▶ while they are visible) and why the
            // original reads right even though the glyph matches the
            // state. I inverted both chevrons on the theory that an
            // arrow should show the action; it should show which way
            // the panels MOVE, and that is the opposite.
            stepGlyph={compact ? '◀' : '▶'}
            stepTitle={compact ? 'Show all panels (Ctrl+F)' : 'Focus mode — this panel only (Ctrl+F)'}
            onToggleLayout={togglePanels}
            onOpenQuarterly={() => setOverlay({ kind: 'quarterly' })}
          />
        </section>
      </main>

      {/* Overlays. Legacy opens every one of these in its own window;
          full-window here is the closest equivalent, and it is what the
          Business Analysis canvas and the Journey timeline need anyway —
          neither fits a column. */}
      {overlay && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg)',
            zIndex: 1500,
            overflowY: 'auto',
            padding: 24,
          }}
        >
          <button onClick={() => setOverlay(null)} style={{ fontSize: 12, marginBottom: 12 }}>
            ←  Back
          </button>
          {overlay.kind === 'analysis' && (
            <BusinessAnalysisCanvas projectKey={overlay.project} onClose={() => setOverlay(null)} />
          )}
          {overlay.kind === 'journey' && <JourneyPanel />}
          {overlay.kind === 'habits' && <HabitDashboard />}
          {overlay.kind === 'bdp' && <BdpPanel />}
          {overlay.kind === 'quarterly' && <QuarterlyPlanPanel />}
        </div>
      )}

      {/* Only shown when there is something to say. A permanent
          "Engine: ok" line is a strip of chrome that never changes,
          and in a fixed-height shell it costs a row of the task list. */}
      {exportStatus && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{exportStatus}</p>}
      {status !== 'ok' && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
          Engine: {status === 'checking' ? 'starting…' : 'not responding'}
        </p>
      )}

      {onboarded === false && <OnboardingModal onDone={() => setOnboarded(true)} />}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onExport={runExport}
          theme={theme}
          onSelectTheme={selectTheme}
          onLangChange={setLang}
        />
      )}
      <UndoToast />
    </div>
    </div>
    </LangProvider>
  );
}

export default function App() {
  return (
    <UndoProvider>
      <AppShell />
    </UndoProvider>
  );
}
