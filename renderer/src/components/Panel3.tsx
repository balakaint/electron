import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { FocusTab, GoalOwnerKey, GoalOwnerMeta, HoursLevel, PlanTask, ProjectKey, STRIKE_MAX, hoursApi, planningApi, projectsApi, settingsApi, tasksApi } from '../services/api';
import ClockCard from './ClockCard';
import HourPlanTab from './HourPlan';
import NowCard from './NowCard';
import DeepWorkTrend from './DeepWorkTrend';
import PlanReview from './PlanReview';
import PlanTodayCard from './PlanTodayCard';
import TaskList from './TaskList';
import MiniCalendarPicker from './MiniCalendarPicker';
import PlanningWeeklyLevel from './PlanningWeeklyLevel';
import PlanningMonthlyLevel from './PlanningMonthlyLevel';
import PlanningYearlyLevel from './PlanningYearlyLevel';
import NotesTab from './NotesTab';
import { useFetchState } from '../hooks/useFetchState';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';
import { useL } from '../i18n';

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// DAILY's own "scheduled tasks" list — PlanTasks (win-scoped or not)
// whose scheduled_date matches this day, across every owner. This is
// what makes a task genuinely "the same object across Daily/Weekly" —
// before this, planningApi.listTasksByDate had zero call sites
// anywhere in the app, so a PlanTask only ever appeared inside its
// Win's own card in WEEKLY, never in DAILY (caught by direct file
// audit, not assumed). Hidden entirely when there's nothing scheduled
// — an empty list under the hour grid would just be noise most days.
interface OwnedTask {
  task: PlanTask;
  owner: GoalOwnerMeta;
}

async function tasksForOwnerDate(owner: GoalOwnerMeta, date: string): Promise<OwnedTask[]> {
  const tasks = await planningApi.listTasksByDate(owner.key, date);
  return tasks.map((task) => ({ task, owner }));
}

function DailyTasksList({
  owners,
  date,
  refreshSignal,
  onChanged,
}: {
  owners: GoalOwnerMeta[] | null;
  date: string;
  refreshSignal: number;
  onChanged: () => void;
}) {
  const {
    data: rows,
    setData: setRows,
    loaded,
    loadError,
    refresh,
  } = useFetchState<OwnedTask[]>(
    owners ? () => Promise.all(owners.map((o) => tasksForOwnerDate(o, date))).then((rs) => rs.flat()) : null,
    [owners, date, refreshSignal],
    [],
  );

  // Weekly's own task rows live in a sibling component that
  // AccordionSection never unmounts (its whole point is preserving each
  // section's local state — open composers, day-pickers — while another
  // section is expanded), so a toggle here would otherwise never reach
  // it within the same session. Routes through the same refreshSignal/
  // onChanged pair HourPlanTab already uses for the identical reason.
  const toggleTask = (row: OwnedTask) =>
    planningApi.editTask(row.task.id, { status: row.task.status === 'done' ? 'open' : 'done' }).then((updated) => {
      setRows((rs) => rs.map((r) => (r.task.id === updated.id ? { ...r, task: updated } : r)));
      onChanged();
    });

  if (!loaded) return null;
  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)', marginBottom: SPACE.sm }}>
        <span>Couldn't load scheduled tasks.</span>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div style={{ marginBottom: SPACE.md }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--text-faint)', marginBottom: SPACE.xs }}>
        SCHEDULED TASKS
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row) => (
          <li key={row.task.id} style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
            <input type="checkbox" className="checkbox-custom" checked={row.task.status === 'done'} onChange={() => toggleTask(row)} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textDecoration: row.task.status === 'done' ? 'line-through' : 'none',
                color: row.task.status === 'done' ? 'var(--text-faint)' : 'var(--text)',
              }}
            >
              {row.task.title}
            </span>
            <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)', flex: 'none' }}>{row.owner.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  ['notes', 'NOTES', 'নোট'],
];

// A quiet count beside the two tabs whose progress is the day's own:
// hours done of planned, and how many of today's three are chosen. The
// list and notes tabs hold inventories, not progress, so they get none.
function useTabCounts(refreshSignal: number): Partial<Record<FocusTab, string>> {
  const [counts, setCounts] = useState<Partial<Record<FocusTab, string>>>({});
  useEffect(() => {
    let alive = true;
    Promise.all([hoursApi.get(isoDate(new Date())), tasksApi.listStrike()])
      .then(([plan, struck]) => {
        if (!alive) return;
        setCounts({
          hours: plan.total_planned > 0 ? `${plan.total_done}/${plan.total_planned}` : undefined,
          mit: `${struck.length}/${STRIKE_MAX}`,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshSignal]);
  return counts;
}

function FocusTabs({
  tab,
  onSelect,
  counts,
}: {
  tab: FocusTab;
  onSelect: (t: FocusTab) => void;
  counts: Partial<Record<FocusTab, string>>;
}) {
  const L = useL();
  const refs = useRef<Partial<Record<FocusTab, HTMLButtonElement | null>>>({});

  // The ARIA tabs pattern promises arrow-key movement between tabs once
  // focus is inside the tablist — role="tab"/aria-selected alone (the
  // previous implementation) announces that promise to screen readers
  // without keeping it. Roving tabIndex: only the active tab is in the
  // normal Tab order; arrows move both focus and selection (ui-ux-audit,
  // 2026-09-22).
  const move = (dir: 1 | -1) => {
    const idx = FOCUS_TABS.findIndex(([k]) => k === tab);
    const next = FOCUS_TABS[(idx + dir + FOCUS_TABS.length) % FOCUS_TABS.length][0];
    onSelect(next);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label="EXECUTE view" style={{ display: 'flex', marginBottom: 12 }}>
      {FOCUS_TABS.map(([key, en, bn]) => {
        const on = tab === key;
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[key] = el;
            }}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(-1);
              }
            }}
            style={{
              flex: 1,
              padding: '8px 0 4px',
              fontSize: 12,
              letterSpacing: 0.5,
              fontWeight: on ? 700 : 400,
              color: on ? 'var(--accent)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {L(en, bn)}
            {counts[key] && (
              <span style={{ marginLeft: SPACE.xs, fontWeight: 400, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {counts[key]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// The HOURS tab's own nested zoom levels — DAY (the hour-by-hour
// timeline), WEEK/MONTH/YEAR (compact views onto the same Goal data
// Panel 2 already owns). Deliberately in-memory only, not persisted like
// `tab` above.
//
// One segmented control, and only the chosen level on screen. The
// previous shape drew the four levels twice — a row of pills AND four
// accordion headers under it that did the same switching — so the
// screen spent a quarter of its height saying which level you were on.
// The other levels stay MOUNTED (hidden with CSS) so their own open
// composers and pickers survive a switch away and back.
const HOURS_LEVELS: [HoursLevel, string, string][] = [
  ['daily', 'Day', 'দিন'],
  ['weekly', 'Week', 'সপ্তাহ'],
  ['monthly', 'Month', 'মাস'],
  ['yearly', 'Year', 'বছর'],
];

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function navBtn(): CSSProperties {
  return {
    width: 32,
    height: 32,
    padding: 0,
    flex: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    borderRadius: RADIUS.control,
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
  };
}

function HoursAccordion({
  refreshSignal,
  onChanged,
  onOpenGoal: _onOpenGoal,
}: {
  refreshSignal: number;
  onChanged: () => void;
  onOpenGoal: (goalId: number, owner: GoalOwnerKey) => void;
}) {
  const L = useL();
  const [level, setLevel] = useState<HoursLevel>('daily');
  // WEEKLY/MONTHLY/YEARLY aggregate across every real project plus
  // "life" (2026-09-23) rather than following whichever project happens
  // to be active in Panel 1/2. Fetched ONCE here (not per-level) so
  // switching among them doesn't refetch the project list three times —
  // `null` means "not resolved yet".
  const [owners, setOwners] = useState<GoalOwnerMeta[] | null>(null);
  // null = DAY shows today. Deliberately not "today's ISO string by
  // default" — a stored literal date would go stale if the app sits open
  // across midnight; null always means "whatever today actually is".
  const [dailyDate, setDailyDate] = useState<string | null>(null);
  // The date picker reaches any day — the week strip, month grid and
  // year strip can each only reach their own period.
  const [dateJumpOpen, setDateJumpOpen] = useState(false);
  const [jumpMonth, setJumpMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  useEffect(() => {
    projectsApi.order().then((order) => {
      // Same `is_named` filter DeepWorkCard/PlanReview/TodayProgressBar
      // already use app-wide for "a real project," not an empty numbered
      // slot nobody has named yet.
      const named: GoalOwnerMeta[] = order
        .filter((e) => e.project.is_named)
        .map((e) => ({ key: e.project.key, label: e.project.name, color: e.project.accent_color }));
      setOwners([{ key: 'life', label: 'LIFE', color: null }, ...named]);
    });
  }, []);

  const today = isoDate(new Date());
  const shown = dailyDate ?? today;
  const dayLabel = (() => {
    if (!dailyDate || dailyDate === today) return L('Today', 'আজ');
    const d = new Date(`${dailyDate}T00:00:00`);
    return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
  })();
  const goDay = (iso: string) => setDailyDate(iso === today ? null : iso);

  // Shared by all three calendar levels' day click — jump DAY to that
  // date and switch to it.
  const onSelectDate = (iso: string) => {
    goDay(iso);
    setLevel('daily');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md, flexWrap: 'wrap' }}>
        {/* Plain buttons with aria-pressed, not role="tab" — this control
            has no arrow-key navigation, so it doesn't announce the ARIA
            tabs pattern it wouldn't deliver. */}
        <div
          aria-label={L('Zoom level', 'স্তর')}
          style={{ display: 'flex', padding: SPACE.hair, background: 'var(--surface-2, var(--surface))', borderRadius: RADIUS.card }}
        >
          {HOURS_LEVELS.map(([key, en, bn]) => {
            const on = level === key;
            return (
              <button
                key={key}
                aria-pressed={on}
                onClick={() => setLevel(key)}
                style={{
                  height: 32,
                  padding: `0 ${SPACE.md}px`,
                  fontSize: 12,
                  fontWeight: on ? 700 : 400,
                  border: 'none',
                  borderRadius: RADIUS.control,
                  background: on ? 'var(--surface)' : 'transparent',
                  color: on ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {L(en, bn)}
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        {level === 'daily' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
            <button aria-label={L('Previous day', 'আগের দিন')} onClick={() => goDay(shiftIso(shown, -1))} className="hover-tint" style={navBtn()}>
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label={L('Pick a date', 'তারিখ বাছুন')}
              aria-expanded={dateJumpOpen}
              onClick={() => {
                const base = new Date(`${shown}T00:00:00`);
                setJumpMonth({ year: base.getFullYear(), month: base.getMonth() + 1 });
                setDateJumpOpen((v) => !v);
              }}
              className="hover-tint"
              style={{ ...navBtn(), width: 'auto', padding: `0 ${SPACE.sm}px`, gap: SPACE.xs, fontSize: 12, fontWeight: 700 }}
            >
              <Calendar size={14} />
              {dayLabel}
            </button>
            <button aria-label={L('Next day', 'পরের দিন')} onClick={() => goDay(shiftIso(shown, 1))} className="hover-tint" style={navBtn()}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <div style={{ display: level === 'daily' ? undefined : 'none' }}>
        {dailyDate && dailyDate !== today && (
          <button
            onClick={() => setDailyDate(null)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: SPACE.xs,
              marginBottom: SPACE.sm,
              padding: `${SPACE.xs}px ${SPACE.sm}px`,
              fontSize: 12,
              fontWeight: 700,
              borderRadius: RADIUS.pill,
              border: '1px solid var(--accent)',
              background: 'transparent',
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={12} />
            {L('Back to today', 'আজে ফিরুন')}
          </button>
        )}
        {dateJumpOpen && (
          <div style={{ marginBottom: SPACE.sm }}>
            <MiniCalendarPicker
              year={jumpMonth.year}
              month={jumpMonth.month}
              selected={dailyDate}
              accent="var(--accent)"
              onNavMonth={(dir) =>
                setJumpMonth((cur) => {
                  const d = new Date(cur.year, cur.month - 1 + dir, 1);
                  return { year: d.getFullYear(), month: d.getMonth() + 1 };
                })
              }
              onSelectDate={(iso) => {
                onSelectDate(iso);
                setDateJumpOpen(false);
              }}
            />
          </div>
        )}
        <DailyTasksList owners={owners} date={shown} refreshSignal={refreshSignal} onChanged={onChanged} />
        <HourPlanTab date={dailyDate ?? undefined} refreshSignal={refreshSignal} onChanged={onChanged} />
      </div>

      <div style={{ display: level === 'weekly' ? undefined : 'none' }}>
        <PlanningWeeklyLevel
          owners={owners}
          accent="var(--goal-yearly)"
          expanded={level === 'weekly'}
          onToggle={() => setLevel('weekly')}
          onSelectDate={onSelectDate}
          refreshSignal={refreshSignal}
          onChanged={onChanged}
        />
      </div>
      <div style={{ display: level === 'monthly' ? undefined : 'none' }}>
        <PlanningMonthlyLevel
          owners={owners}
          accent="var(--goal-monthly)"
          expanded={level === 'monthly'}
          onToggle={() => setLevel('monthly')}
          onSelectDate={onSelectDate}
          refreshSignal={refreshSignal}
          onChanged={onChanged}
        />
      </div>
      <div style={{ display: level === 'yearly' ? undefined : 'none' }}>
        <PlanningYearlyLevel
          owners={owners}
          accent="var(--goal-weekly)"
          expanded={level === 'yearly'}
          onToggle={() => setLevel('yearly')}
          onSelectDate={onSelectDate}
          refreshSignal={refreshSignal}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

export default function Panel3({
  focusVersion,
  onFocusChanged,
  view,
  onSelectView,
  stepGlyph,
  stepTitle,
  onToggleLayout,
  onOpenQuarterly,
  onOpenMorningRitual,
  onOpenNightClosure,
  activeProjectKey,
  onOpenGoalInPanel2,
}: {
  focusVersion: number;
  onFocusChanged: () => void;
  view: View;
  onSelectView: (v: View) => void;
  stepGlyph: '◀' | '▶';
  stepTitle: string;
  onToggleLayout: () => void;
  onOpenQuarterly: () => void;
  onOpenMorningRitual: (view: 'flow' | 'trend') => void;
  onOpenNightClosure: () => void;
  // Still feeds the MIT tab's TaskList below — unrelated to WEEKLY/
  // MONTHLY/YEARLY, which stopped following a single active project
  // 2026-09-23 (they now aggregate across every project, see
  // HoursAccordion's own `owners`). Keep this one, it's still live.
  activeProjectKey: ProjectKey | null;
  // A WEEKLY/MONTHLY/YEARLY calendar day click asks Panel 2 to open that
  // goal AND switch to its owner — App.tsx owns making Panel 2 actually
  // visible first and switching the active project.
  onOpenGoalInPanel2: (goalId: number, owner: GoalOwnerKey) => void;
}) {
  const L = useL();
  // Null until settings answer, so the strip does not paint HOURS and
  // then jump to the tab the user actually left it on.
  const [tab, setTabState] = useState<FocusTab | null>(null);
  const [nowBump, setNowBump] = useState(0);
  const tabCounts = useTabCounts(nowBump + focusVersion);

  useEffect(() => {
    settingsApi.get().then((s) => setTabState(s.focus_tab));
  }, []);

  const selectTab = (next: FocusTab) => {
    setTabState(next);
    settingsApi.update({ focus_tab: next });
  };

  // The two project fetches that fed the progress bar are gone with it.
  // DEEP WORK asks for its own order, and asks only while a timer runs.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      {/* Legacy pins a chevron to each collapsible panel's top-left
          corner, showing what THIS click would do next rather than the
          current state. Panel 3's toggles panels 1+2 together. */}
      <button
        onClick={onToggleLayout}
        title={stepTitle}
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
        {/* The arrow shows what THIS CLICK DOES, not what is currently
            visible. Legacy's code drew the state (▶ while the panels
            were shown) and its own comment two hundred lines away said
            it drew the action — the two contradict each other, and the
            state version is the one people read backwards: everything
            open, an arrow pointing right, and clicking it closes things.

            It is also a stepper now, not a jump. One click is one rung
            of the ladder — full, partial, compact — and it reverses at
            the ends, the way a blind does. Ctrl+F remains the express
            route between the two extremes. */}
        {stepGlyph === '◀' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* paddingLeft clears the collapse chevron pinned top-left; the
          RIGHT padding clears the gear pinned top-right by App.tsx, and
          was missing. Measured: the gear ran 1461-1488 and the EXECUTE
          button 1230-1488 — identical right edges, so the gear sat on
          top of the selected button's fill. */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, paddingLeft: 32, paddingRight: 32 }}>
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
              padding: '8px 0',
              fontWeight: 700,
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
          // A column, not a stack: the review card at the bottom is the
          // one that grows (see PlanReview), and it can only grow if
          // something above it is a flex container with a height to
          // give. minHeight 100% is that height — it resolves against
          // the scroll box, so the card fills a short day's worth of
          // content and the whole column still scrolls when there is
          // more than fits.
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
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
            <ClockCard onOpenQuarterly={onOpenQuarterly} />
            <PlanTodayCard
              onGoExecute={(t) => {
                selectTab(t);
                onSelectView('focus');
              }}
            />
            <DeepWorkTrend />
            <PlanReview
              onOpenMorningRitual={onOpenMorningRitual}
              onOpenNightClosure={onOpenNightClosure}
            />
          </div>
        ) : (
          <>
            {/* The date is one line now, with no card around it and no
                progress bar under it. */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>
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
              <FocusTabs tab={tab} onSelect={selectTab} counts={tabCounts} />
            )}

            {/* Always mounted, hidden via CSS rather than conditionally
                rendered — HoursAccordion's own `level` pointer and its
                DAILY done-count previously reset every time the user
                switched to MIT or TASK LIST and back, since the whole
                subtree unmounted (ui-ux-audit, 2026-09-22). Switching
                among these three tabs is this screen's core loop, so
                that reset fired constantly. */}
            <div style={{ display: tab === 'hours' ? undefined : 'none' }}>
              <HoursAccordion
                refreshSignal={nowBump}
                onChanged={() => setNowBump((b) => b + 1)}
                onOpenGoal={onOpenGoalInPanel2}
              />
            </div>
            {tab === 'mit' && (
              <TaskList
                listKey="focus"
                dayView="today"
                activeProjectKey={activeProjectKey}
                focusVersion={focusVersion}
                // NOW is a SIBLING of this list, not its child, so a
                // write here reached panel 1 but never reached the card
                // directly above. Striking a task from MIT put it in the
                // STRIKE card and left NOW still saying "Choose today's
                // 3" until something unrelated happened to refresh it.
                onFocusChanged={() => {
                  onFocusChanged();
                  setNowBump((b) => b + 1);
                }}
              />
            )}
            {tab === 'list' && (
              <TaskList
                listKey="focus"
                dayView="tomorrow"
                focusVersion={focusVersion}
                onFocusChanged={() => {
                  onFocusChanged();
                  setNowBump((b) => b + 1);
                }}
              />
            )}
            {tab === 'notes' && <NotesTab />}
          </>
        )}
      </div>
    </div>
  );
}
