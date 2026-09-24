import { useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { GoalOwnerMeta, Milestone, Outcome, planningApi } from '../services/api';
import PlanningPeriodHeader from './PlanningPeriodHeader';
import PlanningProgressCard from './PlanningProgressCard';
import { useFetchState } from '../hooks/useFetchState';
import { useAutofocus } from '../hooks/useAutofocus';
import { RADIUS, SPACE } from '../spacing';
import { TYPE_SIZE } from '../typography';
import { useL } from '../i18n';

// Ported verbatim from GoalHorizonSection.tsx (superseded by the
// Planning*Level components) — a generic Jan-Dec strip keyed by a
// `deadlines: Set<string>`, no Goal-specific logic.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The type-picker composer's Yearly step — see PlanningWeeklyLevel.tsx's
// NEW_NODE_TYPES comment for the full contract. An Outcome card's own
// finest-grain creatable type is Milestone (a Win always needs a
// specific Milestone parent, which this card can't disambiguate without
// a second picker); Outcome itself is the only "reach further" option
// left (ui-ux-audit, 2026-09-24).
type NewNodeType = 'milestone' | 'outcome';
const NEW_NODE_TYPES: { key: NewNodeType; label: string }[] = [
  { key: 'milestone', label: 'Milestone' },
  { key: 'outcome', label: 'Outcome' },
];

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
          background: hasDeadline ? accent : 'transparent',
        }}
      />
    </>
  );
  // See PlanningMonthlyLevel.tsx's own DayCell for why `background` is
  // `undefined` (never `'transparent'`) in the non-today case, and why
  // today is a tint rather than a solid fill.
  const sharedStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '4px 0',
    borderRadius: 8,
    // Tinted via color-mix, not the generic --accent-light token — this
    // level's own colour (--goal-weekly here) has no pre-mixed light
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
      title="Jump to DAILY for this month"
      className="hover-outline"
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
function YearStrip({
  year,
  deadlines,
  accent,
  onSelectDate,
}: {
  year: number;
  deadlines: Set<string>;
  accent: string;
  onSelectDate: (iso: string) => void;
}) {
  const today = new Date();
  // -1 outside the current year: no month is "now" in another year.
  const currentMonth = today.getFullYear() === year ? today.getMonth() : -1;
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
  onSelectDate,
  refreshSignal,
  onChanged,
}: {
  owners: GoalOwnerMeta[] | null;
  accent: string;
  onSelectDate: (iso: string) => void;
  refreshSignal: number;
  onChanged: () => void;
}) {
  const L = useL();
  // Years away from this one; 0 is the current year.
  const [offset, setOffset] = useState(0);
  const today = new Date();
  const year = today.getFullYear() + offset;
  // A Milestone added from another year's view lands in its January.
  const month = offset === 0 ? today.getMonth() + 1 : 1;

  const { data: rows, loaded, loadError, refresh } = useFetchState<OwnedOutcome[]>(
    owners
      ? () => Promise.all(owners.map((o) => findCurrentOutcomes(o, year))).then((rs) => rs.flat())
      : null,
    [owners, year, refreshSignal],
    [],
  );

  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [addingType, setAddingType] = useState<NewNodeType>('milestone');
  const newTitleRef = useAutofocus<HTMLInputElement>(addingFor !== null);

  const addNode = (row: OwnedOutcome) => {
    const title = newTitle.trim();
    if (!title) return;
    const create =
      addingType === 'milestone'
        ? planningApi.createMilestone(row.outcome.id, title, month, year)
        : planningApi.createOutcome(row.owner.key, title, year);
    create.then(() => {
      setNewTitle('');
      setAddingType('milestone');
      refresh();
      onChanged();
    });
  };

  const deadlines = new Set(
    rows.flatMap((r) => r.milestones.map((m) => `${m.year}-${String(m.month).padStart(2, '0')}-01`)),
  );

  const achievedCount = rows.filter((r) => r.outcome.progress === 100).length;

  return (
    <div>
      <PlanningPeriodHeader
        label={String(year)}
        summary={loaded && rows.length > 0 ? L(`${achievedCount} of ${rows.length} outcomes achieved`, `${rows.length}টির ${achievedCount}টি আউটকাম অর্জিত`) : null}
        isCurrent={offset === 0}
        resetLabel={L('This year', 'এই বছর')}
        onStep={(dir) => setOffset((o) => o + dir)}
        onReset={() => setOffset(0)}
      />
      {!loaded ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: `${SPACE.sm}px 0` }}>Loading…</div>
      ) : loadError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
          <span>Couldn't load — check the app is connected.</span>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={refresh}>Retry</button>
        </div>
      ) : (
        <>
          <YearStrip year={year} deadlines={deadlines} accent={accent} onSelectDate={onSelectDate} />
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
                  ownerColor={row.owner.color}
                  title={row.outcome.title}
                  progress={row.outcome.progress}
                  fixed={row.outcome.fixed}
                  detailsSummary={`${row.milestones.length} monthly milestone(s)`}
                >
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {row.milestones.map((m) => (
                      <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, fontSize: 12, padding: `${SPACE.xs}px 0` }}>
                        {m.progress === 100 ? <Check size={12} color="var(--success)" /> : <Circle size={12} color="var(--text-faint)" />}
                        <span>{m.title} — {m.progress}%</span>
                      </li>
                    ))}
                  </ul>
                  {addingFor === row.outcome.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, marginTop: SPACE.xs }}>
                      <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap' }}>
                        {NEW_NODE_TYPES.map((t) => {
                          const on = addingType === t.key;
                          return (
                            <button
                              key={t.key}
                              onClick={() => setAddingType(t.key)}
                              title={`Add a ${t.label.toLowerCase()}`}
                              style={{
                                fontSize: TYPE_SIZE.sm,
                                padding: `${SPACE.hair}px ${SPACE.sm}px`,
                                borderRadius: RADIUS.pill,
                                border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                background: on ? 'var(--accent-light)' : 'transparent',
                                color: on ? 'var(--accent)' : 'var(--text-muted)',
                                cursor: 'pointer',
                              }}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: SPACE.xs }}>
                        <input
                          ref={newTitleRef}
                          aria-label={`New ${addingType}`}
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNode(row);
                            if (e.key === 'Escape') { setAddingFor(null); setNewTitle(''); setAddingType('milestone'); }
                          }}
                          placeholder={addingType === 'milestone' ? 'New Milestone title…' : 'New Outcome title…'}
                          style={{ flex: 1, fontSize: TYPE_SIZE.xs, padding: SPACE.xs }}
                        />
                        <button onClick={() => addNode(row)} title="Add" aria-label="Submit">+</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingFor(row.outcome.id); setNewTitle(''); setAddingType('milestone'); }}
                      title="Add a Milestone, or reach further to a new Outcome"
                      aria-label="Add to this Outcome or a new Outcome"
                      className="hover-accent"
                      style={{
                        fontSize: TYPE_SIZE.sm,
                        background: 'transparent',
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderRadius: RADIUS.pill,
                        padding: `${SPACE.hair}px ${SPACE.sm}px`,
                        marginTop: SPACE.xs,
                      }}
                    >
                      + add
                    </button>
                  )}
                </PlanningProgressCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
