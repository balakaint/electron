import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { RADIUS, SPACE } from '../spacing';

// The shared shell for the HOURS tab's own nested DAILY/WEEKLY/MONTHLY/
// YEARLY accordion (see Panel3.tsx). One component so the four read as
// one system (same header shape, same collapsed height, same accent-rail
// idiom) rather than four separately-designed screens glued together.
// Each level supplies its own body via `children`; this owns only the
// header/collapse chrome.
//
// `children` render UNCONDITIONALLY (not gated on `expanded`) — the
// collapse is purely visual (a CSS grid-rows animation), so a collapsed
// level's own data-fetching effects keep running and its state survives
// switching to another level, instead of remounting from scratch every
// time it's reopened (ui-ux-audit, 2026-09-22).
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
  glyph: ReactNode;
  label: string;
  period: string;
  done: number;
  // null = still loading (or errored before its first successful fetch)
  // — rendered distinctly from a confirmed 0, so "no data yet" never
  // reads as "you have zero of these" (ui-ux-audit, 2026-09-22).
  total: number | null;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
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
        <span style={{ color: accent, flex: 'none', display: 'flex', alignItems: 'center' }}>{glyph}</span>
        {/* maxWidth bounds this column so a longer translated label or a
            month-spanning week range ellipsizes instead of crowding the
            done/total+chevron cluster at this panel's fixed ~545px width
            (ui-ux-audit, 2026-09-22). */}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, maxWidth: '60%' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {period}
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none' }}>
          {total === null ? '…' : total === 0 ? '—' : `${done}/${total}`}
        </span>
        <span
          style={{
            flex: 'none',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            transition: 'transform 200ms ease-out',
            transform: expanded ? 'rotate(90deg)' : 'none',
          }}
        >
          <ChevronRight size={16} />
        </span>
      </button>
      {/* CSS-only accordion animation (grid-rows 0fr/1fr + overflow
          hidden on the inner wrapper) — no JS height measurement needed,
          and it animates instead of the previous instant show/hide that
          yanked every section below it into place with no cushioning
          (ui-ux-audit, 2026-09-22). */}
      <div style={{ display: 'grid', gridTemplateRows: expanded ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease-out' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: `0 ${SPACE.md}px ${SPACE.md}px`, borderTop: '1px solid var(--border)' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
