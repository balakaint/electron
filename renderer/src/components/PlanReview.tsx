import { useEffect, useState } from 'react';
import {
  Habit,
  HabitCategory,
  MindsetEntry,
  Project,
  ProjectOrderEntry,
  Q90Panel,
  habitsApi,
  projectsApi,
  quarterlyApi,
} from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { accentText } from '../themes';
import HourPlanTab from './HourPlan';

// Legacy's PLAN review card (task_tracker_v3_THEMES.py 3585-3955): a
// Mindset / Discipline / Consistency tri-tab that lives on the PLAN
// screen, beneath the task list.
//
// Two of the three tabs render data the Habits dashboard also shows.
// That is deliberate in legacy — "this is a second door to one room, not
// a second room" — and it holds: PLAN is the tab you have open while
// deciding what the day contains, and having to leave it to see whether
// you did today's habits is exactly the friction that stops you looking.
// So these reuse the same API calls, not a copy of the logic.
//
// The Mindset tab is the one that is genuinely new. Its history is the
// point, in legacy's words: "A single note box is just a scratchpad you
// overwrite every morning; seven of them next to each other is the only
// way to notice you've written 'stop procrastinating on the export docs'
// five days running."

type Tab = 'today' | 'mindset' | 'discipline' | 'consistency';

// TODAY first. It is the hour-by-hour plan for the day in front of you,
// and the other three are review — you decide what today holds before
// you reflect on how it went, so the strip reads left to right in the
// order you use it.
const TABS: [Tab, string][] = [
  ['today', 'Today'],
  ['mindset', 'Mindset'],
  ['discipline', 'Discipline'],
  ['consistency', 'Consistency'],
];

const CATEGORIES: [HabitCategory, string][] = [
  ['money', 'Money'],
  ['health', 'Health'],
  ['relation', 'Relation'],
  ['mind', 'Mindset'],
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = todayIso();

function MindsetTab() {
  const [saved, setSaved] = useState('');
  const [history, setHistory] = useState<MindsetEntry[]>([]);
  const note = useAutosave(saved, (v: string) => habitsApi.setMindset(TODAY, v));

  useEffect(() => {
    habitsApi.getMindset(TODAY).then((r) => setSaved(r.mindset));
    habitsApi.mindsetHistory(7).then(setHistory);
  }, []);

  return (
    <div>
      <div style={{ fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)', marginBottom: 4 }}>TODAY'S MINDSET</div>
      <textarea
        value={note.value}
        onChange={(e) => note.setValue(e.target.value)}
        onBlur={note.flush}
        rows={6}
        placeholder="What is worth holding in mind today?"
        style={{
          width: '100%',
          fontSize: 13,
          padding: 8,
          resize: 'vertical',
          boxSizing: 'border-box',
          ...savedFlashStyle(note.state),
        }}
      />

      <div style={{ fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)', margin: '12px 0 4px' }}>RECENT</div>
      {history.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Nothing yet — tomorrow this fills in.</div>
      ) : (
        // Days with nothing written are skipped rather than shown empty:
        // a run of blank rows reads as a broken widget, not as "you
        // didn't write anything on Tuesday". Legacy does the same.
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          {history.map((h) => (
            <div key={h.day} style={{ display: 'contents' }}>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{h.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{h.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DisciplineTab() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [streak, setStreak] = useState(0);

  const refresh = () => {
    habitsApi.list(TODAY).then(setHabits);
    habitsApi.streak().then((r) => setStreak(r.streak));
  };
  useEffect(refresh, []);

  const done = habits.filter((h) => h.done).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 'bold' }}>
          {done}/{habits.length} today
        </span>
        {/* Only shown once there IS a streak. A permanent "0 day streak"
            is a daily reminder of failure, which is the opposite of what
            a habit tracker is for — legacy's own reasoning. */}
        {streak > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{streak} day streak</span>}
      </div>

      {CATEGORIES.map(([cat, label]) => {
        const rows = habits.filter((h) => h.category === cat);
        if (rows.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>
            {rows.map((h) => (
              <button
                key={h.id}
                onClick={() => habitsApi.toggle(h.id, TODAY).then(refresh)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  fontSize: 12,
                  padding: '4px 0',
                  cursor: 'pointer',
                  opacity: h.done ? 0.55 : 1,
                }}
              >
                <span style={{ color: h.done ? 'var(--habit-success)' : 'var(--text-muted)', width: 14 }}>
                  {h.done ? '✓' : '○'}
                </span>
                <span>{h.name}</span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ConsistencyRow({ project }: { project: Project }) {
  const [activity, setActivity] = useState<{ day: string; secs: number; worked: boolean }[]>([]);
  useEffect(() => {
    projectsApi.activity(project.key, 30).then(setActivity);
  }, [project.key]);

  const hits = activity.filter((a) => a.worked).length;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
        <span style={{ fontWeight: 'bold', color: accentText(project.accent_color) }}>{project.name}</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 12, marginLeft: 'auto' }}>
          {hits}/30 days · {project.target_minutes}m target
        </span>
      </div>
      {/* One unbroken row of 30, not two of fifteen — legacy's own note:
          a wrapped grid puts a jump backwards in reading order in the
          middle of a forwards run of days, and the block is twice as
          tall, so fewer projects fit on screen together. Comparing
          projects is the whole point of this tab. */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {activity.map((a) => (
          <div
            key={a.day}
            title={`${a.day} — ${Math.round(a.secs / 60)}m`}
            style={{
              flex: 1,
              height: 12,
              minWidth: 3,
              background: a.worked ? project.accent_color : 'var(--progress-track)',
              border: `1px solid ${a.worked ? project.accent_color : 'var(--border)'}`,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ConsistencyTab() {
  const [order, setOrder] = useState<ProjectOrderEntry[]>([]);
  useEffect(() => {
    projectsApi.order().then(setOrder);
  }, []);
  const named = order.filter((e) => e.project.is_named);

  if (named.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Name a project first — consistency is tracked per project.</div>;
  }
  return (
    <div>
      {named.map((e) => (
        <ConsistencyRow key={e.project.key} project={e.project} />
      ))}
    </div>
  );
}

// Legacy's quarter link, sitting at the right end of the tab row
// (3585-3604). Its own note on why the counts are in the link at all:
// "the quarter link also carries its own progress — 2/6 · 78d — so the
// plan can nag from the panel without opening anything."
//
// It counts areas with an OUTCOME written, not areas touched. Legacy is
// explicit that this is deliberate: "an area with a weekly action but no
// outcome is a habit without a destination, and calling that 'planned'
// is the kind of flattering number this app keeps having to remove."
// areas_done from the engine already uses that rule.
function QuarterLink({ onOpen }: { onOpen: () => void }) {
  const [panel, setPanel] = useState<Q90Panel | null>(null);
  useEffect(() => {
    quarterlyApi.getPanel().then(setPanel);
  }, []);
  if (!panel) return null;

  // Before the cycle starts, legacy counts DOWN to it rather than
  // reporting a negative "days left".
  const tail =
    panel.day === 0
      ? `starts in ${panel.days_left - panel.cycle_days}d`
      : `${panel.days_left}d left`;

  return (
    <button
      onClick={onOpen}
      title="Open the quarterly plan"
      style={{
        marginLeft: 'auto',
        fontSize: 12,
        border: 'none',
        background: 'transparent',
        // Muted once something is planned; the accent is a nudge for an
        // empty plan, not a permanent highlight.
        color: panel.areas_done ? 'var(--text-muted)' : 'var(--accent)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        height: 24,
        padding: '0 4px',
      }}
    >
      {panel.cycle_days}-day plan {panel.areas_done}/{panel.areas_total} · {tail} ›
    </button>
  );
}

export default function PlanReview({ onOpenQuarterly }: { onOpenQuarterly: () => void }) {
  const [tab, setTab] = useState<Tab>('today');

  return (
    <div style={{ marginTop: 24, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
        {/* role="tablist" requires its own children to all be role="tab"
            — axe-core's aria-required-children, caught at "critical".
            QuarterLink used to sit inside this div as a fourth child
            with neither role, which is why it moved out to a sibling
            here instead of just losing an aria attribute. */}
        <div role="tablist" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {TABS.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              style={{
                fontSize: 12,
                height: 24,
                padding: '0 12px',
                fontWeight: tab === key ? 700 : 400,
                background: tab === key ? 'var(--accent-light)' : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <QuarterLink onOpen={onOpenQuarterly} />
      </div>
      {tab === 'today' && <HourPlanTab />}
      {tab === 'mindset' && <MindsetTab />}
      {tab === 'discipline' && <DisciplineTab />}
      {tab === 'consistency' && <ConsistencyTab />}
    </div>
  );
}
