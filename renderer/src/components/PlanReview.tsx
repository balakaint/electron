import { useEffect, useState } from 'react';
import {
  MindsetEntry,
  Project,
  ProjectOrderEntry,
  designTodayApi,
  mindsetApi,
  projectsApi,
} from '../services/api';
import { savedFlashStyle, useAutosave } from '../useAutosave';
import { accentText } from '../themes';
import { RADIUS, SPACE } from '../spacing';
import { useL } from '../i18n';
import DisciplineModuleCards from './DisciplineModuleCards';

// Legacy's PLAN review card (task_tracker_v3_THEMES.py 3585-3955): a
// Mindset / Discipline / Consistency tri-tab that lives on the PLAN
// screen, beneath the task list.
//
// The Mindset tab is the one that is genuinely new. Its history is the
// point, in legacy's words: "A single note box is just a scratchpad you
// overwrite every morning; seven of them next to each other is the only
// way to notice you've written 'stop procrastinating on the export docs'
// five days running."
//
// The Discipline tab originally held a flat Money/Health/Relation/Mind
// checklist (ported straight from legacy) and a separate, whole-app
// "Life Execution Board" showed the same checklist plus streak/week/
// monthly-report widgets and today's Win/Reflection notes. Zahid removed
// both outright (2026-09-14: "emon task list mainly regular chek kora
// hoy na" — that kind of list wasn't actually being checked regularly),
// including the backend Habit/HabitCompletion tables and the Win/
// Reflection fields, which had no other home. The Discipline tab now
// holds the 3 guided-module cards (Morning Ritual/Exercise/Sleep
// Procedure) instead — see DisciplineModuleCards.tsx.

type Tab = 'mindset' | 'discipline' | 'consistency';

// There is no TODAY tab here, and there must not be one. This card had
// grown one that rendered the hour plan — the SAME widget EXECUTE's
// HOURS tab renders — so the day's hour-by-hour list was on screen
// twice in one app, and it was PLAN's default tab, which made the two
// screens open on identical content. Legacy rules this out in as many
// words (3444-3449): "PLAN's lower half is the REVIEW card (Mindset /
// Discipline / Consistency), not a second copy of the task list...
// having it on both tabs meant two places to look for the same four
// items, and PLAN is where you step back and look at the week, not
// where you tick things off."
const TABS: [Tab, string, string][] = [
  ['mindset', 'Mindset', 'মাইন্ডসেট'],
  ['discipline', 'Discipline', 'ডিসিপ্লিন'],
  ['consistency', 'Consistency', 'ধারাবাহিকতা'],
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = todayIso();

function MindsetTab() {
  const [saved, setSaved] = useState('');
  const [history, setHistory] = useState<MindsetEntry[]>([]);
  const note = useAutosave(saved, (v: string) => mindsetApi.setMindset(TODAY, v));

  useEffect(() => {
    mindsetApi.getMindset(TODAY).then((r) => setSaved(r.mindset));
    mindsetApi.mindsetHistory(7).then(setHistory);
  }, []);

  return (
    <div>
      {/* The heading NAMES the box; the placeholder ASKS the question.
          A draft of this card had both doing the asking — "Own Your Day"
          over "How Will You Make Today 10× Better?" — and between them
          nothing said what the box was, which matters three months later
          in RECENT when you are reading entries back and have to work out
          what kind of writing this was. The question is the better of the
          two lines, so it moved to where a question belongs: the
          placeholder, which disappears the moment you start writing and
          leaves the screen to your own words.

          Sentence case, not Title Case. The app writes either sentence
          case or tracked caps; Title Case is a third voice, and it is the
          voice of a motivational poster rather than of a field label.

          The date says WHICH day this box writes into — not a repeat of
          the clock above, because RECENT below holds other days and you
          need to know which one you are adding to. Same short form the
          rest of the app uses. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ flex: 1, fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)' }}>TODAY'S MINDSET</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', flex: 'none' }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}
        </span>
      </div>
      <textarea
        id="plan-mindset"
        value={note.value}
        onChange={(e) => note.setValue(e.target.value)}
        onBlur={note.flush}
        rows={6}
        placeholder="How will you make today 10× better?"
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

// A morning brain-dump box (Zahid, 2026-09-18): at 5am the mind is
// still empty and the day's plan hasn't been written down yet — this is
// where that goes, before anything else on the Discipline tab. Styled
// to match MindsetTab's own textarea exactly, plain rather than boxed —
// Zahid's own call after seeing the accent-tinted card version: "today
// mindset er text box design ta simple lagte se" (Today's Mindset
// textbox looks simpler). Saves per day, no history — Zahid was
// explicit this box doesn't need one, unlike Mindset.
function DesignTodayBox() {
  const [saved, setSaved] = useState('');
  const note = useAutosave(saved, (v: string) => designTodayApi.setDesignToday(TODAY, v));

  useEffect(() => {
    designTodayApi.getDesignToday(TODAY).then((r) => setSaved(r.text));
  }, []);

  return (
    <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, letterSpacing: 0.5, color: 'var(--text-faint)', marginBottom: 4 }}>DESIGN TODAY</div>
      <textarea
        id="plan-design-today"
        value={note.value}
        onChange={(e) => note.setValue(e.target.value)}
        onBlur={note.flush}
        rows={6}
        placeholder="Reset your mind — what's the plan for today?"
        style={{
          width: '100%',
          fontSize: 13,
          padding: 8,
          resize: 'vertical',
          boxSizing: 'border-box',
          ...savedFlashStyle(note.state),
        }}
      />
    </div>
  );
}

// Replaced the old flat Money/Health/Relation/Mindset checklist (Zahid's
// own call, 2026-09-14): "emon task list mainly regular chek kora hoy
// na" — such a list wasn't actually being checked regularly. In its
// place: the same 3 guided-module cards the Tools menu's Morning Ritual
// entry opens, so this tab and that entry point stay one feature shown
// in two places rather than diverging.
function DisciplineTab({
  onOpenMorningRitual,
  onOpenNightClosure,
}: {
  onOpenMorningRitual: (view: 'flow' | 'trend') => void;
  onOpenNightClosure: () => void;
}) {
  return (
    <div>
      <DesignTodayBox />
      <DisciplineModuleCards
        onStart={() => onOpenMorningRitual('flow')}
        onHistory={() => onOpenMorningRitual('trend')}
        onOpenNightClosure={onOpenNightClosure}
      />
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
        <span style={{ fontWeight: 700, color: accentText(project.accent_color) }}>{project.name}</span>
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
              // `--progress-track` (used for every OTHER unfilled track in
              // the app) is a deep, saturated neutral — fine against a
              // single accent fill, but here it sits next to whichever
              // color the project itself picked, and a dark project color
              // reads almost as dark as this "empty" tone. `--surface-2`
              // is close to `--bg` in every theme (near-white on light
              // themes, near-black on dark ones), so an empty day nearly
              // disappears into the card and a worked day — any accent
              // color — reads unambiguously as the one that's filled.
              background: a.worked ? project.accent_color : 'var(--surface-2)',
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
export default function PlanReview({
  onOpenMorningRitual,
  onOpenNightClosure,
}: {
  onOpenMorningRitual: (view: 'flow' | 'trend') => void;
  onOpenNightClosure: () => void;
}) {
  const L = useL();
  const [tab, setTab] = useState<Tab>('mindset');

  return (
    // This card ABSORBS the spare height on PLAN, which is why it can
    // be told to grow: legacy gives it weight=1 in both directions
    // ("body absorbs spare height", 3526-3527) so the review fills
    // whatever the clock and the trend card leave behind, and its own
    // body scrolls when the habit list outgrows it. Laid out as a fixed
    // block instead, it left roughly 250px of dead panel under the last
    // card — the one place on this screen where nothing at all is being
    // said.
    <div
      className="card-elevated"
      style={{
        border: '1px solid var(--border)',
        borderRadius: RADIUS.card,
        padding: 12,
        boxShadow: 'var(--shadow-sm)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* One segmented control across the card's full width, not three
          loose outlined buttons plus a link. The quarter link that used
          to share this row moved up to the TODAY card's horizon tiles,
          next to the month and year it is a horizon alongside. */}
      <div
        role="tablist"
        aria-label="Review"
        style={{ display: 'flex', padding: SPACE.hair, marginBottom: SPACE.md, flex: 'none', background: 'var(--surface-2, var(--surface))', borderRadius: RADIUS.card }}
      >
        {TABS.map(([key, en, bn]) => {
          const on = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                fontSize: 12,
                height: 32,
                padding: 0,
                border: 'none',
                borderRadius: RADIUS.control,
                fontWeight: on ? 700 : 400,
                color: on ? 'var(--text)' : 'var(--text-muted)',
                background: on ? 'var(--surface)' : 'transparent',
                boxShadow: on ? 'var(--shadow-sm)' : 'none',
                cursor: 'pointer',
              }}
            >
              {L(en, bn)}
            </button>
          );
        })}
      </div>
      {/* The tab strip is fixed; only the answers scroll. Legacy's
          _plan_scroll_host makes the same split, for the same reason:
          "clipping a habit list or half the projects would silently
          hide data the tab exists to show". */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'mindset' && <MindsetTab />}
        {tab === 'discipline' && (
          <DisciplineTab onOpenMorningRitual={onOpenMorningRitual} onOpenNightClosure={onOpenNightClosure} />
        )}
        {tab === 'consistency' && <ConsistencyTab />}
      </div>
    </div>
  );
}
