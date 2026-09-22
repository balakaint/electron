import { ChevronDown, ChevronRight } from 'lucide-react';
import { RADIUS, SPACE } from '../spacing';

// The shared shell for the HOURS tab's own nested DAILY/WEEKLY/MONTHLY/
// YEARLY accordion (see Panel3.tsx). One component so the four read as
// one system (same header shape, same collapsed height, same accent-rail
// idiom) rather than four separately-designed screens glued together.
// Each level supplies its own body via `children`; this owns only the
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
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: SPACE.sm,
          // 56-72px collapsed row height, per the design brief.
          minHeight: 60,
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <span style={{ color: accent, fontSize: 16, flex: 'none' }}>{glyph}</span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 'none' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: accent }}>{label}</span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{period}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none' }}>
          {done}/{total}
        </span>
        <span style={{ flex: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: `0 ${SPACE.md}px ${SPACE.md}px`, borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
