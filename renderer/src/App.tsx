import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { GoalOwnerKey, ListKey, PanelLayout, ProjectKey, exportApi, goalsApi, settingsApi } from './services/api';
import Panel3 from './components/Panel3';
import BusinessAnalysisCanvas from './components/BusinessAnalysisCanvas';
import ToolsMenu from './components/ToolsMenu';
import CaptureDialog from './components/CaptureDialog';
import TitleBar from './components/TitleBar';
import ProjectDashboard from './components/ProjectDashboard';
import GoalsPanel from './components/GoalsPanel';
import GoalBoardOverlay from './components/GoalBoardOverlay';
import JourneyPanel from './components/JourneyPanel';
import BdpPanel from './components/BdpPanel';
import QuarterlyPlanPanel from './components/QuarterlyPlanPanel';
import MorningRitualPanel from './components/MorningRitualPanel';
import NightClosurePanel from './components/NightClosurePanel';
import HealthPanel from './components/HealthPanel';
import HealthReminderRunner from './components/HealthReminderRunner';
import OnboardingModal from './components/OnboardingModal';
import SettingsDialog from './components/SettingsDialog';
import ShortcutsHelp from './components/ShortcutsHelp';
import UndoToast from './components/UndoToast';
import ErrorBoundary from './components/ErrorBoundary';
import { UndoProvider, useUndo } from './undo';
import { applyTheme, nextTheme, Theme, THEME_LABELS } from './themes';
import { useFocusTrap } from './hooks/useFocusTrap';
import { Lang, LangProvider } from './i18n';

// Legacy's _PANEL3_W / _PANEL_GAP (task_tracker_v3_THEMES.py 1252-1253).
const PANEL3_W = 545;
const PANEL_GAP = 7;

// What is covering the three columns, if anything. Analysis and Journey
// belong to a project; the rest are whole-app screens off the Tools menu.
type Overlay =
  | { kind: 'analysis'; project: ProjectKey }
  | { kind: 'journey'; project: ProjectKey }
  | { kind: 'bdp' }
  | { kind: 'quarterly' }
  // A Goal's "→ BOARD" button (GoalsPanel/GoalRow) opens this — the
  // Goal -> Task -> Individual Task Board hierarchy the user asked
  // for, as a full-window overlay per their own explicit choice
  // ("full-window overlay (Recommended)") over cramming it into
  // Panel 2's narrow column.
  | { kind: 'goalBoard'; project: GoalOwnerKey; goalId: number };

// This whole overlay container sat outside <main> with no role at all —
// the original page stays mounted underneath (this is a fixed-position
// cover, not a route change), so a screen reader saw its content as
// belonging to no landmark, axe's own "region" rule, moderate, on both
// Business Analysis and Journey. role="dialog" is the correct shape
// (content still exists behind it, same as OnboardingModal), and a
// dialog needs a name — one per overlay kind, not a generic "Overlay"
// that would say nothing useful to whichever of these six is showing.
const OVERLAY_LABEL: Record<Overlay['kind'], string> = {
  analysis: 'Business Analysis',
  journey: 'Journey',
  bdp: 'Income Opportunities',
  quarterly: '90-Day Plan',
  goalBoard: 'Goal Board',
};

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
  // Panel 2's own goal-task "+ STRIKE" chips (GoalsPanel) are a third
  // writer of the same shared Focus list — same counter-per-writer
  // shape as panel1Wrote/panel3Wrote, extended from two panels to
  // three: each panel bumps the one counter it owns and listens to the
  // SUM of the other two (never its own), so no panel ever reacts to
  // its own write.
  const [panel2Wrote, setPanel2Wrote] = useState(0);
  const [panel3Wrote, setPanel3Wrote] = useState(0);
  const [captureOpen, setCaptureOpen] = useState(false);

  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const overlayDialogRef = useFocusTrap<HTMLDivElement>(overlay !== null);
  const mainRef = useRef<HTMLElement>(null);
  // Morning Ritual renders IN Panel 2 (the Goals column), not as a
  // full-window overlay — that column is already the wider of the two
  // flexible panels, with Panel 1/Panel 3 staying visible on either
  // side (Zahid, 2026-09-18: wanted it findable in context, not a
  // screen that blanks the rest of the app).
  const [morningRitualView, setMorningRitualView] = useState<'flow' | 'trend' | null>(null);
  // Night Closure — same slot, same reasoning, mutually exclusive with
  // morningRitualView above (see the Panel 2 render below).
  const [nightClosureOpen, setNightClosureOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  // Bumped by a project card's "This week's goal" tile: GoalsPanel goes
  // to that project's Weekly Goal (see 'open-week-goal' below).
  const [weekGoalFocus, setWeekGoalFocus] = useState<{ key: string; n: number } | null>(null);
  // Which project panel 2 is showing. Persisted server-side already
  // (goalsApi.getPanel), so it survives a restart the way legacy's does.
  const [goalsProject, setGoalsProject] = useState<ProjectKey | null>(null);
  // True once ProjectDashboard reports every project in panel 1 is
  // collapsed — panel 2 then shows the Life Plan headline instead of
  // goalsProject's goals (see the section below). Starts false so a
  // fresh load shows GoalsPanel until ProjectDashboard's first report
  // arrives, matching goalsProject's own "unknown until loaded" shape.
  const [allProjectsCollapsed, setAllProjectsCollapsed] = useState(false);
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
  // A calendar day clicked in Panel 3's WEEKLY/MONTHLY (GoalHorizonSection)
  // asks Panel 2 to open that same goal. `token` (not just the id) forces
  // GoalsPanel's effect to re-fire even when the SAME goal is clicked
  // twice in a row — an id alone wouldn't change and the effect wouldn't
  // re-run the second time.
  const [jumpToGoal, setJumpToGoal] = useState<{ id: number; token: number } | null>(null);
  // Panel 3's WEEKLY/MONTHLY/YEARLY sections aggregate across every
  // project now (2026-09-23), so a calendar deadline-dot click can name
  // an owner that ISN'T whatever Panel 1/2 currently has active.
  // `goalsProject`/`allProjectsCollapsed` can't represent "show life"
  // as an explicit choice — only as a side effect of every project card
  // being collapsed — so a real-project jump reuses `selectGoalsProject`
  // below (exactly what clicking that project in Panel 1 already does),
  // while a life-owner jump needs this one-shot override since there's
  // no existing action that means "show Life Plan while a project card
  // stays expanded." Cleared the moment the user picks a project
  // themselves, so it can never outlive the jump that set it.
  const [jumpOwnerOverride, setJumpOwnerOverride] = useState<'life' | null>(null);
  const [onboarded, setOnboarded] = useState<boolean | null>(null); // null = not loaded yet
  // The overlay dialog and OnboardingModal are fixed-position covers, not
  // route changes — <main> stays mounted (and, without this, reachable by
  // Tab) underneath them. `inert` isn't in this @types/react version yet,
  // so it's toggled imperatively rather than as a JSX prop.
  useEffect(() => {
    mainRef.current?.toggleAttribute('inert', overlay !== null || onboarded === false);
  }, [overlay, onboarded]);
  // Stored as "when it was opened" rather than a boolean, so the stack
  // above can order them; null means closed.
  const [shortcutsOpenedAt, setShortcutsOpenedAt] = useState<number | null>(null);
  const [settingsOpenedAt, setSettingsOpenedAt] = useState<number | null>(null);
  const shortcutsOpen = shortcutsOpenedAt !== null;
  const settingsOpen = settingsOpenedAt !== null;
  const setShortcutsOpen = (v: boolean) => setShortcutsOpenedAt(v ? Date.now() : null);
  const setSettingsOpen = (v: boolean) => setSettingsOpenedAt(v ? Date.now() : null);
  const [, setExporting] = useState(false);
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
    // A real project pick always wins over a pending life-owner jump —
    // otherwise picking a project in Panel 1 right after clicking a life
    // goal's deadline dot would silently do nothing, since the override
    // would still take priority in goalsPanelKey below.
    setJumpOwnerOverride(null);
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
      if (key === 'k') {
        // Capture works from every screen, even from inside a text box.
        e.preventDefault();
        setCaptureOpen(true);
      } else if (key === 't') {
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

  // Health — same docking as the two rituals. Also reached from a
  // clicked Health reminder notification ('open-health').
  const openHealth = () => {
    if (layout !== 'partial') setLayout('partial');
    setMorningRitualView(null);
    setNightClosureOpen(false);
    setHealthOpen(true);
  };
  // Morning Ritual's flow, same docking — reached from PLAN's "Plan
  // today" card ('open-morning-ritual').
  const openMorningRitualFlow = () => {
    if (layout !== 'partial') setLayout('partial');
    setNightClosureOpen(false);
    setHealthOpen(false);
    setMorningRitualView('flow');
  };
  useEffect(() => {
    const onWeekGoal = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      setMorningRitualView(null);
      setNightClosureOpen(false);
      setHealthOpen(false);
      setWeekGoalFocus((f) => ({ key, n: (f?.n ?? 0) + 1 }));
    };
    window.addEventListener('open-week-goal', onWeekGoal);
    return () => window.removeEventListener('open-week-goal', onWeekGoal);
  }, []);
  useEffect(() => {
    window.addEventListener('open-health', openHealth);
    window.addEventListener('open-morning-ritual', openMorningRitualFlow);
    return () => {
      window.removeEventListener('open-health', openHealth);
      window.removeEventListener('open-morning-ritual', openMorningRitualFlow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  return (
    <LangProvider lang={lang}>
    <HealthReminderRunner />
    {/* The title bar is OUTSIDE the padded shell, flush to the window's
        own edges — an inset title bar is a strip of chrome floating in a
        margin, which reads as a widget rather than as the top of the
        window. */}
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
    <TitleBar />
    <div
      style={{
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
          Panel 1 projects · panel 2 the selected project's goals (a
          goal's "→ BOARD" button opens the Goal -> Task -> Individual
          Task Board hierarchy as a full-window overlay, not inline
          here — see the 'goalBoard' Overlay kind below) ·
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
        ref={mainRef}
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
            // Clipped to 1x1 either way, so no sighted user's eye can
            // tell the difference — but the browser's own h1 default
            // (2em, i.e. 2x whatever the body's font-size is) still
            // shows up in getComputedStyle, which is exactly what
            // tests/hierarchy-audit.mjs reads. Without this, this one
            // invisible element reports a phantom 26px "in use" on every
            // screen it is mounted on (which, since it lives here in the
            // app shell, is all of them) forever — fontSize: 13 matches
            // TYPE_SIZE.sm, the app's own body size, so it stops being a
            // font-size decision at all.
            fontSize: 13,
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
            {/* Panel 2 (GOALS) and Panel 3 (PLAN/EXECUTE) both open on a
                header naming the column; Panel 1 went straight into the
                project rows with nothing above them — the one column on
                screen with no visible label (visual redesign pass,
                2026-09-20). Same weight/style as GoalsPanel's own
                header two columns over, not a new element type. */}
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.5,
                color: 'var(--text-faint)',
                marginBottom: 12,
                paddingBottom: 4,
                borderBottom: '1px solid var(--border)',
              }}
            >
              PROJECTS
            </div>
            <ProjectDashboard
              focusVersion={panel2Wrote + panel3Wrote}
              onFocusChanged={() => setPanel1Wrote((v) => v + 1)}
              onOpenAnalysis={(k) => setOverlay({ kind: 'analysis', project: k })}
              onOpenJourney={(k) => setOverlay({ kind: 'journey', project: k })}
              onSelectGoals={selectGoalsProject}
              goalsProject={goalsProject}
              openProject={overlay && 'project' in overlay && overlay.project !== 'life' ? overlay.project : null}
              onAllCollapsedChange={setAllProjectsCollapsed}
            />
          </section>
        )}
        {showP1 && <div style={{ background: 'var(--border)' }} />}

        {showP2 && (
          <section aria-label="Goals" style={{ overflowY: 'auto', minHeight: 0, minWidth: 0, position: 'relative' }}>
            {morningRitualView ? (
              <MorningRitualPanel initialView={morningRitualView} onBack={() => setMorningRitualView(null)} />
            ) : nightClosureOpen ? (
              <NightClosurePanel onBack={() => setNightClosureOpen(false)} />
            ) : healthOpen ? (
              <HealthPanel onBack={() => setHealthOpen(false)} />
            ) : (
              <>
                {/* Panel 2's chevron hides panel 1 only — legacy's
                    _toggle_panel1, the middle rung of the ladder. */}
                <button
                  onClick={() => setLayout(layout === 'full' ? 'partial' : 'full')}
                  title={layout === 'full' ? 'Hide the projects panel' : 'Show the projects panel'}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 2,
                    padding: 0,
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Same direction rule as panel 3's: the panel this hides
                      is to the LEFT, so this points away when hiding and
                      back when restoring. */}
                  {layout === 'full' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
                {/* GoalsPanel used to also take onGoalOpenChange, feeding a
                    goalOpenProject state that ProjectDashboard's openProject
                    fell back to — but GoalsPanel never actually called it
                    (its own signature never declared the prop), so
                    goalOpenProject was always null and this fallback was
                    dead from the day GoalsPanel grew its OWN useAutoTimer
                    call (see that hook's comment there), which independently
                    starts/stops the project's clock when a goal opens. Wiring
                    the prop up for real would have meant two hooks racing to
                    toggle the same timer. */}
                {/* All of panel 1 collapsed = nothing specific is open, so
                    this falls back to the reserved "life" virtual project
                    instead of whichever real project's goals happened to be
                    open last — see allProjectsCollapsed's own comment above
                    and GoalOwnerKey's comment in services/api.ts. Same
                    GoalsPanel either way; only which key it's pointed at
                    changes. */}
                {(() => {
                  const goalsPanelKey: GoalOwnerKey | null =
                    jumpOwnerOverride ?? (allProjectsCollapsed ? 'life' : goalsProject);
                  return (
                    <GoalsPanel
                      projectKey={goalsPanelKey}
                      focusVersion={panel1Wrote + panel3Wrote}
                      onFocusChanged={() => setPanel2Wrote((v) => v + 1)}
                      onOpenBoard={(goalId) =>
                        goalsPanelKey && setOverlay({ kind: 'goalBoard', project: goalsPanelKey, goalId })
                      }
                      jumpToGoal={jumpToGoal}
                      focusWeek={weekGoalFocus}
                    />
                  );
                })()}
              </>
            )}
          </section>
        )}
        {showP2 && <div style={{ background: 'var(--border)' }} />}

        <section aria-label="Plan and execute" style={{ minHeight: 0, position: 'relative' }}>
          {/* Legacy pins the gear to panel 3's top-right corner and has
              no app header bar of its own — the window's own title bar
              is the only chrome above the columns. */}
          <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 3, display: 'flex', gap: 4 }}>
            <button
              onClick={() => setCaptureOpen(true)}
              title="Capture a task or note — Ctrl+K"
              aria-label="Capture a task or note"
              style={{ fontSize: 14, fontWeight: 700, width: 24, height: 24, padding: 0 }}
            >
              +
            </button>
      <ToolsMenu
        entries={[
          {
            icon: '+',
            label: 'Capture',
            desc: 'Write down a task or a note  ·  Ctrl+K',
            onSelect: () => setCaptureOpen(true),
          },
          {
            icon: '▤',
            label: 'Income Opportunities',
            desc: 'Discover opportunities. Build a plan. Execute for income',
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
            focusVersion={panel1Wrote + panel2Wrote}
            onFocusChanged={() => setPanel3Wrote((v) => v + 1)}
            // A WEEKLY/MONTHLY/YEARLY calendar day click asks Panel 2 to
            // open that goal — ensure it's actually visible first (same
            // force-to-'partial' precedent as onOpenMorningRitual/
            // onOpenNightClosure below: 'compact' hides Panel 2 entirely,
            // so opening a goal nobody can see would silently do nothing)
            // AND make Panel 2 show that goal's OWN owner, not whatever
            // project happened to already be active — these sections
            // aggregate across every project now (2026-09-23), so the
            // clicked dot's goal is very often not from the active one.
            onOpenGoalInPanel2={(goalId, owner) => {
              if (layout !== 'partial' && layout !== 'full') setLayout('partial');
              if (owner === 'life') {
                setJumpOwnerOverride('life');
              } else {
                selectGoalsProject(owner);
              }
              setJumpToGoal({ id: goalId, token: Date.now() });
            }}
            // Panel 2 already follows whichever project Panel 1 has open
            // (same fallback: all collapsed reads as none open, not
            // stuck on the last one). DEEP WORK's own selection now
            // follows it one-way too — Panel 1 drives it, but picking a
            // different row inside DEEP WORK itself doesn't reach back
            // and move Panel 1/2 (2026-09-20, Zahid: less clutter when a
            // project is open, without losing MIT's own quick-switch).
            activeProjectKey={allProjectsCollapsed ? null : goalsProject}
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
            onOpenMorningRitual={(view) => {
              // Morning Ritual lives in Panel 2 now, not a full-window
              // overlay — 'compact' hides Panel 2 entirely, so
              // Resume/History would silently do nothing without also
              // bringing it back. Forced to 'partial' rather than
              // 'full' (Zahid, 2026-09-18: "make panel 1 collups when
              // morning ritual review press") — Panel 1's project list
              // isn't needed while the ritual is open, and hiding it
              // gives Panel 2 the extra room.
              if (layout !== 'partial') setLayout('partial');
              setNightClosureOpen(false);
              setHealthOpen(false);
              setMorningRitualView(view);
            }}
            onOpenNightClosure={() => {
              // Docks to 'partial' same as Morning Ritual above — Zahid's
              // own reversal (2026-09-20): keeping Panel 1 visible at
              // 'full' didn't fix the cramped read, since
              // NightClosureFlow's own content column was capped
              // narrower than the space it had either way. Panel 1 isn't
              // needed while Night Closure is open, so it collapses and
              // Panel 2 gets the room.
              if (layout !== 'partial') setLayout('partial');
              setMorningRitualView(null);
              setHealthOpen(false);
              setNightClosureOpen(true);
            }}
            onOpenHealth={openHealth}
          />
        </section>
      </main>

      {/* Overlays. Legacy opens every one of these in its own window;
          full-window here is the closest equivalent, and it is what the
          Business Analysis canvas and the Journey timeline need anyway —
          neither fits a column. */}
      {overlay && (
        <div
          ref={overlayDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={OVERLAY_LABEL[overlay.kind]}
          tabIndex={-1}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg)',
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            padding: 24,
          }}
        >
          {/* Back pinned outside the scroll area — it used to share
              normal flow with the 100%-height content below it, which
              pushed the total past the viewport by exactly its own
              height (measured: a 39px overlay overflow on Business
              Analysis, every time, regardless of how tightly the
              content itself was packed). Content now gets the actual
              remaining space via flex:1, and scrolls on its own if it
              still doesn't fit. */}
          <button
            onClick={() => setOverlay(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, marginBottom: 12, flex: 'none' }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {overlay.kind === 'analysis' && (
              <BusinessAnalysisCanvas projectKey={overlay.project} />
            )}
            {overlay.kind === 'journey' && <JourneyPanel key={overlay.project} initialProject={overlay.project} />}
            {overlay.kind === 'bdp' && <BdpPanel />}
            {overlay.kind === 'quarterly' && <QuarterlyPlanPanel />}
            {overlay.kind === 'goalBoard' && (
              <GoalBoardOverlay project={overlay.project} goalId={overlay.goalId} />
            )}
          </div>
        </div>
      )}

      {/* Only shown when there is something to say. A permanent
          "Engine: ok" line is a strip of chrome that never changes,
          and in a fixed-height shell it costs a row of the task list. */}
      {exportStatus && (
        <p role="status" aria-live="polite" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          {exportStatus}
        </p>
      )}
      {status !== 'ok' && (
        <p
          role={status === 'checking' ? 'status' : 'alert'}
          aria-live={status === 'checking' ? 'polite' : 'assertive'}
          style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}
        >
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
      {captureOpen && <CaptureDialog onClose={() => setCaptureOpen(false)} onSaved={() => setPanel2Wrote((v) => v + 1)} />}
      <UndoToast />
    </div>
    </div>
    </LangProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <UndoProvider>
        <AppShell />
      </UndoProvider>
    </ErrorBoundary>
  );
}
