import { CalendarRange } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Win, planningApi } from '../services/api';
import AccordionSection from './AccordionSection';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { RADIUS, SPACE } from '../spacing';

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
    borderRadius: RADIUS.control,
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

function MonthGrid({ deadlines, accent, onSelectDeadline }: { deadlines: Set<string>; accent: string; onSelectDeadline: (iso: string) => void }) {
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
              onSelect={hasDeadline ? () => onSelectDeadline(c.iso) : undefined}
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

async function findCurrentMilestone(owner: GoalOwnerMeta, year: number, month: number): Promise<OwnedMilestone | null> {
  const outcomes = await planningApi.listOutcomes(owner.key);
  const outcome = outcomes.find((o) => o.year === year);
  if (!outcome) return null;
  const milestones = await planningApi.listMilestones(outcome.id);
  const milestone = milestones.find((m) => m.month === month && m.year === year);
  if (!milestone) return null;
  const wins = await planningApi.listWins(milestone.id);
  return { milestone, wins, owner };
}

export default function PlanningMonthlyLevel({
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
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedMilestone[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentMilestone(o, year, month))).then((rs) => rs.filter((r): r is OwnedMilestone => r !== null))
      : null,
    [owners, year, month],
    [],
  );

  const deadlines = new Set(rows.flatMap((r) => r.wins.map((w) => w.week_start_date)));
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <AccordionSection
      glyph={<CalendarRange size={16} />}
      label="MONTHLY"
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
          <MonthGrid deadlines={deadlines} accent={accent} onSelectDeadline={() => {}} />
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
                  detailsSummary={`${row.wins.length} weekly win(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.wins.map((w) => (
                      <li key={w.id} style={{ fontSize: 12, padding: '3px 0' }}>
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
