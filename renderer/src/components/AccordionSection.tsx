import { ChevronDown, ChevronRight } from 'lucide-react';
import { RADIUS, SPACE } from '../spacing';

// The shared shell for EXECUTE's four planning zoom levels — DAILY,
// WEEKLY, MONTHLY, YEARLY. One component so the four read as one system
// (same header shape, same collapsed height, same accent-rail idiom)
// rather than four separately-designed screens glued together. Each
// level supplies its own body via `children`; this owns only the
// header/collapse chrome.
export default function AccordionSection({
  glyph,
  label,
  period,
  done,
  total,
  accent,
  expanded,
  onToggle,
  headerExtra,
  children,
}: {
  glyph: string;
  label: string;
  period: string;
  done: number;
  total: number;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
  // Extra control shown in the header, right of the done/total count —
  // only DAILY uses this today (the "Tomorrow →" popover trigger), but
  // it stays generic rather than DAILY-specific so this component makes
  // no assumption about which level is using it.
  headerExtra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      {/* Two buttons, not one spanning the whole row — `headerExtra`
          (the Tomorrow popover trigger) is its own interactive control,
          and nesting a button inside a button that also calls onToggle
          is both invalid HTML and double-fires on click. Both halves
          still call onToggle, so clicking anywhere except headerExtra
          itself expands/collapses, same as a single full-width button. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, minHeight: 60, padding: `${SPACE.sm}px ${SPACE.md}px` }}>
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.sm,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            font: 'inherit',
            textAlign: 'left',
            color: 'inherit',
            padding: 0,
          }}
        >
          <span style={{ color: accent, fontSize: 16, flex: 'none' }}>{glyph}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: accent }}>{label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{period}</span>
          </span>
        </button>
        {headerExtra}
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: SPACE.sm,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--text-muted)',
          }}
        >
          <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {done}/{total}
          </span>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {expanded && (
        <div style={{ padding: `0 ${SPACE.md}px ${SPACE.md}px`, borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
