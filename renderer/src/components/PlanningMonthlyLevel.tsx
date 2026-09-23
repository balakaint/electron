import { CalendarRange } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { RADIUS, SPACE } from '../spacing';
import { useL } from '../i18n';

// Ported verbatim from GoalHorizonSection.tsx (superseded by the
// Planning*Level components) — these are pure calendar-grid primitives
// keyed by a generic `deadlines: Set<string>`, no Goal-specific logic.
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAY_ABBR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function DayCell({
  label,
  date,
  isToday,
  hasDeadline,
  dim,
  accent,
  onSelect,
}: {
  label: string;
  date?: number;
  isToday: boolean;
  hasDeadline: boolean;
  dim: boolean;
  accent: string;
  onSelect?: () => void;
}) {
  const content = (
    <>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1 }}>{label}</span>
      )}
      {date !== undefined && <span style={{ fontSize: 12, lineHeight: 1.4 }}>{date}</span>}
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: RADIUS.pill,
          background: hasDeadline ? accent : 'transparent',
        }}
      />
    </>
  );
  // Today used to be a solid accent fill with on-accent text — heavier
  // than the mockup's own restraint (its .cal-grid span.today /
  // .m-cell.current both do use a solid fill, actually, so this is a
  // deliberate softening PAST the mockup, not a mirror of it — matches
  // Zahid's own "not washed out, but not heavier than it needs to be"
  // steer from the visual-direction brief). `background` is left
  // `undefined` (never `'transparent'`) for the non-today case
  // specifically so .hover-outline's :hover rule below isn't shadowed
  // by a same-specificity inline declaration — see index.css's own
  // comment on this exact failure mode.
  const sharedStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 0',
    borderRadius: RADIUS.control,
    // Tinted via color-mix, not the generic --accent-light token — this
    // level's own colour (--goal-monthly here) has no pre-mixed light
    // variant of its own to reuse.
    background: isToday ? `color-mix(in srgb, ${accent} 16%, transparent)` : undefined,
    color: isToday ? accent : dim ? 'var(--text-faint)' : 'var(--text-muted)',
    opacity: dim ? 0.5 : 1,
  };
  if (!onSelect) {
    return <div style={sharedStyle}>{content}</div>;
  }
  return (
    <button
      onClick={onSelect}
      title="Jump to DAILY for this date"
      className="hover-outline"
      style={{ ...sharedStyle, border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      {content}
    </button>
  );
}

function MonthGrid({ deadlines, accent, onSelectDate }: { deadlines: Set<string>; accent: string; onSelectDate: (iso: string) => void }) {
  const today = new Date();
  const todayIso = isoDate(today);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { date: number; iso: string; inMonth: boolean }[] = [];
  for (let i = startOffset; i > 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i + 1);
    cells.push({ date: d.getDate(), iso: isoDate(d), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: d, iso: isoDate(new Date(year, month, d)), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, cells.length - startOffset - daysInMonth + 1);
    cells.push({ date: d.getDate(), iso: isoDate(d), inMonth: false });
  }

  return (
    <div style={{ marginBottom: SPACE.md }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {WEEKDAY_ABBR.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
            {w}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((c) => {
          const hasDeadline = c.inMonth && deadlines.has(c.iso);
          return (
            <DayCell
              key={c.iso}
              label=""
              date={c.date}
              isToday={c.inMonth && c.iso === todayIso}
              hasDeadline={hasDeadline}
              dim={!c.inMonth}
              accent={accent}
              // Every in-month day jumps to DAILY, not just ones that
              // already carry a Win deadline — gating on hasDeadline left
              // the entire calendar inert for any owner with no Win this
              // month yet (confirmed live: a real account with zero
              // Milestones this month had no clickable cell anywhere).
              // Matches WeekStrip's own always-clickable convention.
              // Out-of-month cells stay inert — they belong to whichever
              // adjacent month isn't the one this grid is showing.
              onSelect={c.inMonth ? () => onSelectDate(c.iso) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

interface OwnedMilestone {
  milestone: Milestone;
  wins: Win[];
  owner: GoalOwnerMeta;
}

// Returns EVERY Milestone this owner has for this month — see
// PlanningWeeklyLevel.tsx's own comment on findCurrentWins for why a
// single `.find()` silently hid real data the moment more than one
// Outcome/Milestone could exist for the same period (caught in code
// review).
async function findCurrentMilestones(owner: GoalOwnerMeta, year: number, month: number): Promise<OwnedMilestone[]> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const yearOutcomes = outcomes.filter((o) => o.year === year);
  const milestoneLists = await Promise.all(yearOutcomes.map((o) => planningApi.listMilestones(o.id)));
  const monthMilestones = milestoneLists.flat().filter((m) => m.month === month && m.year === year);
  return Promise.all(
    monthMilestones.map(async (milestone) => ({ milestone, wins: await planningApi.listWins(milestone.id), owner })),
  );
}

export default function PlanningMonthlyLevel({
  owners,
  accent,
  expanded,
  onToggle,
  onSelectDate,
  refreshSignal,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
  onSelectDate: (iso: string) => void;
  refreshSignal: number;
}) {
  const L = useL();
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedMilestone[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentMilestones(o, year, month))).then((rs) => rs.flat())
      : null,
    [owners, year, month, refreshSignal],
    [],
  );

  const deadlines = new Set(rows.flatMap((r) => r.wins.map((w) => w.week_start_date)));
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Time-vs-Progress-vs-Pace — locked at Week/Month level per the
  // interaction contract (elapsed-time % vs completed-work % vs a
  // derived pace chip). Caught in code review: PlanningProgressCard
  // already implemented the whole row, but neither caller passed it.
  const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const pace = { elapsedPct: Math.round((dayOfMonth / daysInMonth) * 100), elapsedLabel: `day ${dayOfMonth} of ${daysInMonth}` };

  return (
    <AccordionSection
      glyph={<CalendarRange size={16} />}
      label={L('MONTHLY', 'মাসিক')}
      period={monthLabel}
      done={rows.filter((r) => r.milestone.progress === 100).length}
      total={loaded ? rows.length : null}
      accent={accent}
      expanded={expanded}
      onToggle={onToggle}
    >
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : (
        <>
          <MonthGrid deadlines={deadlines} accent={accent} onSelectDate={onSelectDate} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              No Milestone set for this month yet — add one from the Goals panel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.milestone.id}
                  label={`MONTH MILESTONE · ${row.owner.label}`}
                  accent={accent}
                  title={row.milestone.title}
                  progress={row.milestone.progress}
                  fixed={row.milestone.fixed}
                  pace={pace}
                  detailsSummary={`${row.wins.length} weekly win(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.wins.map((w) => (
                      <li key={w.id} style={{ fontSize: 12, padding: `${SPACE.xs}px 0` }}>
                        {w.progress === 100 ? '✓' : '○'} {w.title} — {w.progress}%
                      </li>
                    ))}
                  </ul>
                </PlanningProgressCard>
              ))}
            </div>
          )}
        </>
      )}
    </AccordionSection>
  );
}
