import { Target } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Outcome, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { SPACE } from '../spacing';

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
      title="Jump to this deadline below"
      style={{ ...sharedStyle, border: 'none', cursor: 'pointer', font: 'inherit' }}
    >
      {content}
    </button>
  );
}

function YearStrip({ deadlines, accent, onSelectDeadline }: { deadlines: Set<string>; accent: string; onSelectDeadline: (iso: string) => void }) {
  const today = new Date();
  const year = today.getFullYear();
  const currentMonth = today.getMonth();
  const sortedDeadlines = Array.from(deadlines).sort();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SPACE.xs, marginBottom: SPACE.md }}>
      {MONTH_ABBR.map((label, i) => {
        const prefix = `${year}-${String(i + 1).padStart(2, '0')}`;
        const monthDeadlines = sortedDeadlines.filter((iso) => iso.startsWith(prefix));
        const hasDeadline = monthDeadlines.length > 0;
        return (
          <DayCell
            key={label}
            label={label}
            isToday={i === currentMonth}
            hasDeadline={hasDeadline}
            dim={false}
            accent={accent}
            onSelect={hasDeadline ? () => onSelectDeadline(monthDeadlines[0]) : undefined}
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

async function findCurrentOutcome(owner: GoalOwnerMeta, year: number): Promise<OwnedOutcome | null> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const outcome = outcomes.find((o) => o.year === year);
  if (!outcome) return null;
  const milestones = await planningApi.listMilestones(outcome.id);
  return { outcome, milestones, owner };
}

export default function PlanningYearlyLevel({
  owners,
  accent,
  expanded,
  onToggle,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const year = new Date().getFullYear();

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedOutcome[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentOutcome(o, year))).then((rs) => rs.filter((r): r is OwnedOutcome => r !== null))
      : null,
    [owners, year],
    [],
  );

  const deadlines = new Set(
    rows.flatMap((r) => r.milestones.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}-01`)),
  );

  return (
    <AccordionSection
      glyph={<Target size={16} />}
      label="YEARLY"
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
          <YearStrip deadlines={deadlines} accent={accent} onSelectDeadline={() => {}} />
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
