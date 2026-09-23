import { useEffect, useRef, useState } from 'react';
import { Calendar, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { FocusTab, GoalOwnerKey, GoalOwnerMeta, HoursLevel, ProjectKey, projectsApi, settingsApi } from '../services/api';
import ClockCard from './ClockCard';
import HourPlanTab from './HourPlan';
import NowCard from './NowCard';
import DeepWorkTrend from './DeepWorkTrend';
import PlanReview from './PlanReview';
import TaskList from './TaskList';
import AccordionSection from './AccordionSection';
import PlanningWeeklyLevel from './PlanningWeeklyLevel';
import PlanningMonthlyLevel from './PlanningMonthlyLevel';
import PlanningYearlyLevel from './PlanningYearlyLevel';
import NotesTab from './NotesTab';
import { RADIUS, SPACE } from '../spacing';
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
  ['notes', 'NOTES', 'নোট'],
];

function FocusTabs({ tab, onSelect }: { tab: FocusTab; onSelect: (t: FocusTab) => void }) {
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
          </button>
        );
      })}
    </div>
  );
}

// The HOURS tab's own nested zoom levels — DAILY (the hour-by-hour
// planner, unchanged), WEEKLY/MONTHLY/YEARLY (compact views onto the
// same Goal data Panel 2 already owns). Deliberately in-memory only, not
// persisted like `tab` above — same convention HourPlanTab already uses
// for its own phase-block open state (see that file's own comment).
// Simplified down from an earlier version of this redesign that
// replaced the whole HOURS/MIT/LIST tab strip; the user asked to keep
// MIT/LIST exactly as they were and nest this here instead.
// Icons instead of the old Unicode dingbats (◷◈❖◆) — those mixed a
// separate "font glyph" icon system into a component that already
// imports lucide-react for its chevron, which read as two different UI
// kits assembled together (ui-ux-audit, 2026-09-22).
const HOURS_LEVELS: [HoursLevel, string, string, JSX.Element][] = [
  ['daily', 'DAILY', 'দৈনিক', <Calendar size={14} />],
  ['weekly', 'WEEKLY', 'সাপ্তাহিক', <CalendarDays size={14} />],
  ['monthly', 'MONTHLY', 'মাসিক', <CalendarRange size={14} />],
  ['yearly', 'YEARLY', 'বার্ষিক', <Target size={14} />],
];

function HoursAccordion({
  refreshSignal,
  onChanged,
  onOpenGoal,
}: {
  refreshSignal: number;
  onChanged: () => void;
  onOpenGoal: (goalId: number, owner: GoalOwnerKey) => void;
}) {
  const L = useL();
  const [level, setLevel] = useState<HoursLevel>('daily');
  // null = not loaded yet, so the DAILY row shows "…" rather than a
  // flash of "0/0" before the hour plan's first fetch resolves.
  const [dailyDone, setDailyDone] = useState<number | null>(null);
  const [dailyTotal, setDailyTotal] = useState<number | null>(null);
  // WEEKLY/MONTHLY/YEARLY now aggregate across every real project plus
  // "life" (2026-09-23) rather than following whichever project happens
  // to be active in Panel 1/2 — the whole point of a zoomed-out planning
  // screen is seeing everything due across projects at once, not one
  // project's slice of it. Fetched ONCE here (not per-section) so
  // switching among WEEKLY/MONTHLY/YEARLY doesn't refetch the project
  // list three times — `null` means "not resolved yet," same meaning
  // GoalHorizonSection's own `loaded` already uses, so the three
  // sections just show their existing loading state until this
  // resolves instead of a fourth new loading affordance.
  const [owners, setOwners] = useState<GoalOwnerMeta[] | null>(null);
  // null = DAILY shows today. Set by a WEEKLY/MONTHLY/YEARLY calendar dot
  // click, cleared by the "Today" pill. Deliberately not "today's ISO
  // string by default" — storing a literal date would go stale if the
  // app sits open across midnight; null always means "whatever today
  // actually is right now."
  const [dailyDate, setDailyDate] = useState<string | null>(null);

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

  const dateStr = (() => {
    const d = dailyDate ? new Date(`${dailyDate}T00:00:00`) : new Date();
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    const month = d.toLocaleDateString(undefined, { month: 'short' });
    return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`;
  })();

  // Shared by all three calendar levels' dot-click — jump DAILY to that
  // date and switch the accordion to it. Local to this component (not
  // threaded through Panel3's own props/App.tsx) since the click and its
  // destination both live inside this one accordion.
  const onSelectDate = (iso: string) => {
    setDailyDate(iso);
    setLevel('daily');
  };

  return (
    <div>
      {/* A compact left-aligned pill control, not a full-width underlined
          tab strip — deliberately different in shape, fill, and
          alignment from FocusTabs above it, so this reads as a view
          switch NESTED inside HOURS rather than a sibling of HOURS/MIT/
          TASK LIST at the same level (ui-ux-audit, 2026-09-22: the two
          previously shared byte-identical styling). Plain buttons with
          aria-pressed, not role="tab" — this control has no arrow-key
          navigation, so it doesn't announce the ARIA tabs pattern it
          wouldn't deliver. */}
      <div style={{ display: 'flex', gap: SPACE.xs, marginBottom: SPACE.md, flexWrap: 'wrap' }}>
        {HOURS_LEVELS.map(([key, en, bn, icon]) => {
          const on = level === key;
          return (
            <button
              key={key}
              aria-pressed={on}
              onClick={() => setLevel(key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: on ? 700 : 400,
                borderRadius: RADIUS.pill,
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                background: on ? 'var(--accent)' : 'transparent',
                color: on ? 'var(--on-accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {icon}
              {L(en, bn)}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <AccordionSection
          glyph={<Calendar size={16} />}
          label={L('DAILY', 'দৈনিক')}
          period={dateStr}
          done={dailyDone ?? 0}
          total={dailyTotal}
          accent="var(--accent)"
          expanded={level === 'daily'}
          onToggle={() => setLevel('daily')}
        >
          {/* Only while viewing a jumped-to date — not a permanent
              fixture of DAILY's own chrome, so today's own normal view
              stays exactly as it was. Lives inside `children`, not
              AccordionSection's own header button: that header is
              itself a `<button onClick={onToggle}>`, and nesting a
              second interactive control inside it double-fires on click
              (the exact bug this file's own HOURS_LEVELS/AccordionSection
              pairing was already burned by once — see that component's
              own history). */}
          {dailyDate && (
            <button
              onClick={() => setDailyDate(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE.xs,
                marginBottom: SPACE.sm,
                padding: '4px 8px',
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
              {L('Today', 'আজ')}
            </button>
          )}
          <HourPlanTab
            hideHeader
            date={dailyDate ?? undefined}
            refreshSignal={refreshSignal}
            onChanged={onChanged}
            onPlanLoaded={(d, t) => {
              setDailyDone(d);
              setDailyTotal(t);
            }}
          />
        </AccordionSection>

        <PlanningWeeklyLevel
          owners={owners}
          accent="var(--goal-yearly)"
          expanded={level === 'weekly'}
          onToggle={() => setLevel('weekly')}
          onSelectDate={onSelectDate}
        />
        <PlanningMonthlyLevel
          owners={owners}
          accent="var(--goal-monthly)"
          expanded={level === 'monthly'}
          onToggle={() => setLevel('monthly')}
          onSelectDate={onSelectDate}
        />
        <PlanningYearlyLevel
          owners={owners}
          accent="var(--goal-weekly)"
          expanded={level === 'yearly'}
          onToggle={() => setLevel('yearly')}
          onSelectDate={onSelectDate}
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
            <ClockCard />
            <DeepWorkTrend />
            <PlanReview
              onOpenQuarterly={onOpenQuarterly}
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
              <FocusTabs tab={tab} onSelect={selectTab} />
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
