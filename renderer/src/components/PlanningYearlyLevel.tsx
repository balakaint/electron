import { Target } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Outcome, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { SPACE } from '../spacing';
import { useL } from '../i18n';

// Ported verbatim from GoalHorizonSection.tsx (superseded by the
// Planning*Level components) — a generic Jan-Dec strip keyed by a
// `deadlines: Set<string>`, no Goal-specific logic.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DayCell({
  label,
  isToday,
  hasDeadline,
  dim,
  accent,
  onSelect,
}: {
  label: string;
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
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: 999,
          background: hasDeadline ? (isToday ? 'var(--on-accent)' : accent) : 'transparent',
        }}
      />
    </>
  );
  const sharedStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 0',
    borderRadius: 8,
    background: isToday ? accent : 'transparent',
    color: isToday ? 'var(--on-accent)' : dim ? 'var(--text-faint)' : 'var(--text-muted)',
    opacity: dim ? 0.5 : 1,
  };
  if (!onSelect) {
    return <div style={sharedStyle}>{content}</div>;
  }
  return (
    <button
      onClick={onSelect}
      title="Jump to DAILY for this month"
      style={{ ...sharedStyle, border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      {content}
    </button>
  );
}

// A Milestone only carries year+month, no day — so "jump to this
// month" lands DAILY on the 1st, the only day the underlying data
// actually names. `deadlines` already stores that same `YYYY-MM-01`
// shape (see findCurrentOutcomes' caller below).
//
// Every month is clickable, not just ones with a Milestone — gating on
// a deadline left the whole strip inert for any owner with no
// Milestone yet this year (confirmed live: a real account with zero
// Milestones had no clickable cell). Matches WeekStrip's own
// always-clickable convention. A month with no Milestone still has a
// real 1st — `${prefix}-01` — so the jump target always exists.
function YearStrip({ deadlines, accent, onSelectDate }: { deadlines: Set<string>; accent: string; onSelectDate: (iso: string) => void }) {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth();
  const sortedDeadlines = Array.from(deadlines).sort();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SPACE.xs, marginBottom: SPACE.md }}>
      {MONTH_ABBR.map((label, i) => {
        const prefix = `${year}-${String(i + 1).padStart(2, '0')}`;
        const monthDeadline = sortedDeadlines.find((iso) => iso.startsWith(prefix));
        return (
          <DayCell
            key={label}
            label={label}
            isToday={i === currentMonth}
            hasDeadline={!!monthDeadline}
            dim={false}
            accent={accent}
            onSelect={() => onSelectDate(monthDeadline ?? `${prefix}-01`)}
          />
        );
      })}
    </div>
  );
}

interface OwnedOutcome {
  outcome: Outcome;
  milestones: Milestone[];
  owner: GoalOwnerMeta;
}

// Returns EVERY Outcome this owner has for this year — see
// PlanningWeeklyLevel.tsx's own comment on findCurrentWins for why a
// single `.find()` silently hid real data the moment more than one
// Outcome could exist for the same year (caught in code review — this
// was the same failure mode the Phase A migration's dedupe fixed on the
// write side, reappearing here on the read side).
async function findCurrentOutcomes(owner: GoalOwnerMeta, year: number): Promise<OwnedOutcome[]> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const yearOutcomes = outcomes.filter((o) => o.year === year);
  return Promise.all(
    yearOutcomes.map(async (outcome) => ({ outcome, milestones: await planningApi.listMilestones(outcome.id), owner })),
  );
}

export default function PlanningYearlyLevel({
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
  const year = new Date().getFullYear();

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedOutcome[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentOutcomes(o, year))).then((rs) => rs.flat())
      : null,
    [owners, year, refreshSignal],
    [],
  );

  const deadlines = new Set(
    rows.flatMap((r) => r.milestones.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}-01`)),
  );

  return (
    <AccordionSection
      glyph={<Target size={16} />}
      label={L('YEARLY', 'বার্ষিক')}
      period={String(year)}
      done={rows.filter((r) => r.outcome.progress === 100).length}
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
          <YearStrip deadlines={deadlines} accent={accent} onSelectDate={onSelectDate} />
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>
              No Outcome set for this year yet — add one from the Goals panel.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {rows.map((row) => (
                <PlanningProgressCard
                  key={row.outcome.id}
                  label={`YEAR OUTCOME · ${row.owner.label}`}
                  accent={accent}
                  title={row.outcome.title}
                  progress={row.outcome.progress}
                  fixed={row.outcome.fixed}
                  detailsSummary={`${row.milestones.length} monthly milestone(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.milestones.map((m) => (
                      <li key={m.id} style={{ fontSize: 12, padding: `${SPACE.xs}px 0` }}>
                        {m.progress === 100 ? '✓' : '○'} {m.title} — {m.progress}%
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
