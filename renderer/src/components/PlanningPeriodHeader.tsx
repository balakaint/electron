import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useL } from '../i18n';
import { RADIUS, SPACE } from '../spacing';

// The header WEEK / MONTH / YEAR share now that HOURS shows one level at
// a time: which period this is, stepping to the one before or after,
// a way back to the current one, and the level's own tally.
//
// It replaced each level's AccordionSection header. With a single level
// on screen, a collapsible header only repeated what the Day/Week/Month/
// Year control above it already said — and none of the three could leave
// the current period, so last week's wins or next month's milestones
// were unreachable from here.
export default function PlanningPeriodHeader({
  label,
  summary,
  isCurrent,
  resetLabel,
  onStep,
  onReset,
}: {
  label: string;
  summary: string | null;
  isCurrent: boolean;
  resetLabel: string;
  onStep: (dir: 1 | -1) => void;
  onReset: () => void;
}) {
  const L = useL();
  const btn = {
    width: 32,
    height: 32,
    padding: 0,
    flex: 'none' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    borderRadius: RADIUS.control,
    background: 'var(--surface)',
    color: 'var(--text)',
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xs, marginBottom: SPACE.md, flexWrap: 'wrap' }}>
      <button aria-label={L('Previous', 'আগের')} onClick={() => onStep(-1)} className="hover-tint" style={btn}>
        <ChevronLeft size={16} />
      </button>
      <span style={{ fontSize: 13, fontWeight: 700, padding: `0 ${SPACE.xs}px`, whiteSpace: 'nowrap' }}>{label}</span>
      <button aria-label={L('Next', 'পরের')} onClick={() => onStep(1)} className="hover-tint" style={btn}>
        <ChevronRight size={16} />
      </button>
      {!isCurrent && (
        <button
          onClick={onReset}
          style={{
            height: 24,
            padding: `0 ${SPACE.sm}px`,
            marginLeft: SPACE.xs,
            fontSize: 12,
            fontWeight: 700,
            borderRadius: RADIUS.pill,
            border: '1px solid var(--accent)',
            background: 'transparent',
            color: 'var(--accent)',
            cursor: 'pointer',
          }}
        >
          {resetLabel}
        </button>
      )}
      <span style={{ flex: 1 }} />
      {summary && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{summary}</span>}
    </div>
  );
}
