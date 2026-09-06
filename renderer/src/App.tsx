import { useEffect, useState } from 'react';
import { ListKey, exportApi, settingsApi } from './services/api';
import TaskList from './components/TaskList';
import ClockCard from './components/ClockCard';
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

type Page = 'tasks' | 'habits' | 'projects' | 'goals' | 'journey' | 'bdp' | 'quarterly';

function AppShell() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [page, setPage] = useState<Page>('tasks');
  const [tab, setTab] = useState<ListKey>('classic');
  const [theme, setThemeState] = useState<Theme>('focus');
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
    window.api
      .healthCheck()
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));

    settingsApi.get().then((s) => {
      setThemeState(s.theme);
      applyTheme(s.theme);
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, shortcutsOpen, settingsOpen, dialogStack.length]);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Habit OS</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={runExport} disabled={exporting} title="Export a JSON backup + CSV" style={{ fontSize: 12 }}>
            {exporting ? 'Exporting…' : '⬇ Export Data'}
          </button>
          <button onClick={() => cycleTheme(1)} title="Cycle theme (Ctrl+T)" style={{ fontSize: 12 }}>
            🎨 {THEME_LABELS[theme]}
          </button>
          <button onClick={() => setSettingsOpen(true)} title="Settings" style={{ fontSize: 12 }}>
            ⚙
          </button>
        </div>
      </div>

      {exportStatus && <p style={{ fontSize: 12, opacity: 0.7, margin: '8px 0 0' }}>{exportStatus}</p>}

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <button onClick={() => setPage('tasks')} disabled={page === 'tasks'}>
          Tasks
        </button>
        <button onClick={() => setPage('habits')} disabled={page === 'habits'}>
          Habits
        </button>
        <button onClick={() => setPage('projects')} disabled={page === 'projects'}>
          Projects
        </button>
        <button onClick={() => setPage('goals')} disabled={page === 'goals'}>
          Goals
        </button>
        <button onClick={() => setPage('journey')} disabled={page === 'journey'}>
          Journey
        </button>
        <button onClick={() => setPage('bdp')} disabled={page === 'bdp'}>
          Business Plan
        </button>
        <button onClick={() => setPage('quarterly')} disabled={page === 'quarterly'}>
          90-Day Plan
        </button>
      </div>

      {page === 'tasks' && (
        <>
          <ClockCard />
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setTab('classic')} disabled={tab === 'classic'}>
              Plan
            </button>
            <button onClick={() => setTab('focus')} disabled={tab === 'focus'}>
              Focus
            </button>
          </div>
          <TaskList listKey={tab} />
        </>
      )}

      {page === 'habits' && <HabitDashboard />}

      {page === 'projects' && <ProjectDashboard />}

      {page === 'goals' && <GoalsPanel />}

      {page === 'journey' && <JourneyPanel />}

      {page === 'bdp' && <BdpPanel />}

      {page === 'quarterly' && <QuarterlyPlanPanel />}

      <p style={{ marginTop: 32, fontSize: 12, opacity: 0.5 }}>Engine: {status}</p>

      {onboarded === false && <OnboardingModal onDone={() => setOnboarded(true)} />}
      {shortcutsOpen && <ShortcutsHelp onClose={() => setShortcutsOpen(false)} />}
      {settingsOpen && (
        <SettingsDialog
          onClose={() => setSettingsOpen(false)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onExport={runExport}
          theme={theme}
          onSelectTheme={selectTheme}
        />
      )}
      <UndoToast />
    </div>
  );
}

export default function App() {
  return (
    <UndoProvider>
      <AppShell />
    </UndoProvider>
  );
}
