import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FocusTab, GoalOwnerKey, ProjectKey, settingsApi } from '../services/api';
import ClockCard from './ClockCard';
import HourPlanTab from './HourPlan';
import NowCard from './NowCard';
import DeepWorkTrend from './DeepWorkTrend';
import PlanReview from './PlanReview';
import TaskList from './TaskList';
import AccordionSection from './AccordionSection';
import GoalHorizonSection from './GoalHorizonSection';
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

// EXECUTE's four planning zoom levels, most-detailed first, per the
// 2026-09-22 accordion redesign (docs/superpowers/specs/2026-09-22-
// execute-panel-redesign-design.md). Replaces the old three-tab strip
// (HOURS/MIT/LIST): MIT folded into an inline expand under NOW, LIST
// became the DAILY section's own "Tomorrow" popover — neither survives
// as a level of its own. Order matches the brief's own priority order
// (NOW, then DAILY, WEEKLY, MONTHLY, YEARLY, most detail first).
const LEVELS: [FocusTab, string, string][] = [
  ['daily', 'DAILY', 'দৈনিক'],
  ['weekly', 'WEEKLY', 'সাপ্তাহিক'],
  ['monthly', 'MONTHLY', 'মাসিক'],
  ['yearly', 'YEARLY', 'বার্ষিক'],
];

// The segmented nav both jumps to and expands a level — the four
// sections always exist, stacked, in one continuous scroll (the brief's
// own rule: "the four levels still exist in one continuous planning
// screen", no tab-swap hiding the others). Sticky so it stays reachable
// while a long WEEKLY/MONTHLY list scrolls past it.
function LevelNav({ level, onSelect }: { level: FocusTab; onSelect: (l: FocusTab) => void }) {
  const L = useL();
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        marginBottom: SPACE.md,
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: 'var(--surface)',
        paddingTop: SPACE.xs,
      }}
    >
      {LEVELS.map(([key, en, bn]) => {
        const on = level === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(key)}
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

// The old LIST tab (tomorrow's focus list) demoted to a small anchored
// popover — same click-outside-closes pattern ToolsMenu.tsx already
// uses, rather than a new overlay primitive. Lives in the DAILY
// section's own header (via AccordionSection's headerExtra slot), not
// as a level of its own.
function TomorrowLink({ focusVersion, onFocusChanged }: { focusVersion: number; onFocusChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flex: 'none' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Tomorrow's focus list"
        style={{ fontSize: 12, background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: `0 ${SPACE.xs}px` }}
      >
        Tomorrow →
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 5,
            width: 320,
            maxWidth: '80vw',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: RADIUS.card,
            boxShadow: 'var(--shadow-md)',
            padding: SPACE.md,
            marginTop: SPACE.xs,
          }}
        >
          <TaskList listKey="focus" dayView="tomorrow" focusVersion={focusVersion} onFocusChanged={onFocusChanged} />
        </div>
      )}
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
  goalsOwnerKey,
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
  activeProjectKey: ProjectKey | null;
  // Same owner GoalsPanel (Panel 2) is currently showing, "life" fallback
  // included — drives WEEKLY/MONTHLY/YEARLY so the two panels never
  // disagree about whose goals they're both looking at. Distinct from
  // `activeProjectKey` above (a real project only, no "life"), which
  // still only feeds the inline MIT picker's DeepWorkCard context.
  goalsOwnerKey: GoalOwnerKey | null;
}) {
  const L = useL();
  // Null until settings answer, so nothing paints expanded and then
  // jumps to the level the user actually left it on.
  const [level, setLevelState] = useState<FocusTab | null>(null);
  const [nowBump, setNowBump] = useState(0);
  const [mitOpen, setMitOpen] = useState(false);
  const [dailyDone, setDailyDone] = useState(0);
  const [dailyTotal, setDailyTotal] = useState(0);

  const dailyRef = useRef<HTMLDivElement>(null);
  const weeklyRef = useRef<HTMLDivElement>(null);
  const monthlyRef = useRef<HTMLDivElement>(null);
  const yearlyRef = useRef<HTMLDivElement>(null);
  const levelRefs = { daily: dailyRef, weekly: weeklyRef, monthly: monthlyRef, yearly: yearlyRef } as const;

  useEffect(() => {
    settingsApi.get().then((s) => setLevelState(s.focus_tab));
  }, []);

  const selectLevel = (next: FocusTab) => {
    setLevelState(next);
    settingsApi.update({ focus_tab: next });
    levelRefs[next].current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const ownerKey: GoalOwnerKey = goalsOwnerKey ?? 'life';

  const dateStr = (() => {
    // "Tuesday, 8 Sep 2026" — legacy's own order
    // (f"{dayname}, {now.day} {now.strftime('%b %Y')}", 5020).
    // toLocaleDateString with the default locale gives "Tuesday, Sep 8,
    // 2026" on a US machine, a different reading order in the one line
    // that says what day it is. Assembled from parts so it reads the
    // same wherever it runs.
    const d = new Date();
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    const month = d.toLocaleDateString(undefined, { month: 'short' });
    return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`;
  })();

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
          zIndex: 3,
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
            {/* NOW stays first, above every accordion level — it is the
                single thing you are doing; hiding it behind a collapsed
                DAILY section would make the answer to "what now" depend
                on which level happens to be open (legacy 5177-5180). The
                standalone date line that used to sit here is gone — the
                DAILY section's own header shows the same date now,
                whether DAILY is collapsed or open, so it was a second
                copy of one fact rather than a second fact. */}
            <NowCard
              refreshSignal={nowBump}
              onChanged={() => setNowBump((b) => b + 1)}
              // An empty NOW with a real choice to make opens the same
              // inline picker the small "Today's 3" link below opens —
              // see that link's own comment for why both exist.
              onGoToMit={() => setMitOpen((v) => !v)}
            />

            {/* A persistent way back into the STRIKE picker. NowCard's
                own "Choose today's 3 →" only appears while NOW has no
                current task — once you're working on one of today's
                three, there was previously no way back to the MIT tab to
                add a second or third from here without switching tabs
                manually. Folding MIT into NOW's own empty-state button
                loses that reachability outright, so this small link
                stays visible regardless of what NOW is showing. */}
            <div style={{ marginBottom: SPACE.sm }}>
              <button
                onClick={() => setMitOpen((v) => !v)}
                style={{ fontSize: 12, color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {mitOpen ? '▴ Hide today’s 3' : '▾ Today’s 3'}
              </button>
            </div>
            {mitOpen && (
              <div style={{ marginBottom: SPACE.md }}>
                <TaskList
                  listKey="focus"
                  dayView="today"
                  activeProjectKey={activeProjectKey}
                  focusVersion={focusVersion}
                  // NOW is a SIBLING of this list, not its child, so a
                  // write here reached panel 1 but never reached the card
                  // directly above. Striking a task from here put it in
                  // the STRIKE card and left NOW still saying "Choose
                  // today's 3" until something unrelated happened to
                  // refresh it.
                  onFocusChanged={() => {
                    onFocusChanged();
                    setNowBump((b) => b + 1);
                  }}
                />
              </div>
            )}

            {level && <LevelNav level={level} onSelect={selectLevel} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md, paddingBottom: SPACE.md }}>
              <div ref={dailyRef}>
                <AccordionSection
                  glyph="◷"
                  label={L('DAILY', 'দৈনিক')}
                  period={dateStr}
                  done={dailyDone}
                  total={dailyTotal}
                  accent="var(--accent)"
                  expanded={level === 'daily'}
                  onToggle={() => selectLevel('daily')}
                  headerExtra={
                    <TomorrowLink
                      focusVersion={focusVersion}
                      onFocusChanged={() => {
                        onFocusChanged();
                        setNowBump((b) => b + 1);
                      }}
                    />
                  }
                >
                  <HourPlanTab
                    hideHeader
                    refreshSignal={nowBump}
                    onChanged={() => setNowBump((b) => b + 1)}
                    onPlanLoaded={(d, t) => {
                      setDailyDone(d);
                      setDailyTotal(t);
                    }}
                  />
                </AccordionSection>
              </div>

              {/* ⚠ horizon crossing: Panel 2 (GoalsPanel.tsx) deliberately
                  stores/labels these backwards — stored "yearly" is shown
                  as "WEEKLY GOAL", stored "monthly" as "MONTHLY GOAL",
                  stored "weekly" as "YEARLY GOAL". These three sections
                  follow the DISPLAYED meaning the user already knows from
                  Panel 2, not the raw column name — do not "fix" this
                  mapping without re-reading GoalsPanel.tsx's own warning
                  first, or Panel 3's WEEKLY would silently start showing
                  Panel 2's YEARLY GOAL data. */}
              <div ref={weeklyRef}>
                <GoalHorizonSection
                  horizon="yearly"
                  ownerKey={ownerKey}
                  accent="var(--goal-yearly)"
                  glyph="◈"
                  label={L('WEEKLY', 'সাপ্তাহিক')}
                  noun="priority"
                  periodKind="week"
                  expanded={level === 'weekly'}
                  onToggle={() => selectLevel('weekly')}
                />
              </div>
              <div ref={monthlyRef}>
                <GoalHorizonSection
                  horizon="monthly"
                  ownerKey={ownerKey}
                  accent="var(--goal-monthly)"
                  glyph="❖"
                  label={L('MONTHLY', 'মাসিক')}
                  noun="goal"
                  periodKind="month"
                  expanded={level === 'monthly'}
                  onToggle={() => selectLevel('monthly')}
                />
              </div>
              <div ref={yearlyRef}>
                <GoalHorizonSection
                  horizon="weekly"
                  ownerKey={ownerKey}
                  accent="var(--goal-weekly)"
                  glyph="◆"
                  label={L('YEARLY', 'বার্ষিক')}
                  noun="milestone"
                  periodKind="year"
                  expanded={level === 'yearly'}
                  onToggle={() => selectLevel('yearly')}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
