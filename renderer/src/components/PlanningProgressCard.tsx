import type { ReactNode } from 'react';
import { RADIUS, SPACE } from '../spacing';

// The locked interaction contract's "WIN ≠ Task" card, generalized to
// all three levels (Outcome/Milestone/Win each get one): a progress
// bar, an optional criteria/subtitle line, an achieved badge when
// progress hits 100 (derived — never implies the stored `status` field
// was auto-written, see the Phase A spec's edge cases), and an optional
// Time-vs-Progress-vs-Pace row for Week/Month level. `children` is the
// level-specific breakdown list (supporting tasks / weekly milestones /
// monthly outcomes) rendered inside a native <details> so it starts
// collapsed on a long list without a second custom disclosure widget.
export default function PlanningProgressCard({
  label,
  accent,
  title,
  criteria,
  progress,
  fixed,
  pace,
  detailsSummary,
  children,
  onEdit,
}: {
  label: string; // "WEEK WIN" / "MONTH MILESTONE" / "YEAR OUTCOME"
  accent: string;
  title: string;
  criteria?: string;
  progress: number;
  fixed: boolean;
  // Time-vs-Progress-vs-Pace — omitted (undefined) at levels/moments
  // where elapsed-time doesn't apply (e.g. an Outcome with no natural
  // "day N of M" window).
  pace?: { elapsedPct: number; elapsedLabel: string };
  detailsSummary: string;
  children?: ReactNode;
  onEdit?: () => void;
}) {
  const achieved = progress === 100;
  const paceState = pace ? (progress >= pace.elapsedPct ? 'onpace' : 'behind') : null;
  const paceColor = paceState === 'onpace' ? 'var(--success)' : paceState === 'behind' ? 'var(--danger)' : undefined;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${accent}`,
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: SPACE.md,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: accent }}>{label}</span>
        <span style={{ flex: 1 }} />
        {fixed && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>not started</span>
        )}
        {onEdit && (
          <button onClick={onEdit} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            ✎ Edit
          </button>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{title}</div>
      <div style={{ height: 7, borderRadius: RADIUS.pill, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: accent, transition: 'width 300ms ease' }} />
      </div>
      {achieved && (
        <span
          style={{
            alignSelf: 'flex-start',
            padding: '3px 9px',
            borderRadius: RADIUS.pill,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            background: 'color-mix(in srgb, var(--success) 16%, transparent)',
            color: 'var(--success)',
          }}
        >
          🏆 ACHIEVED{criteria ? ` — ${criteria}` : ''}
        </span>
      )}
      {children && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700 }}>{detailsSummary}</summary>
          <div style={{ marginTop: SPACE.xs }}>{children}</div>
        </details>
      )}
      {pace && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: SPACE.xs, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-faint)' }}>TIME</span>
            <span>{pace.elapsedLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span style={{ color: 'var(--text-faint)' }}>PROGRESS</span>
            <span>{progress}%</span>
          </div>
          <span
            style={{
              alignSelf: 'flex-start',
              padding: '3px 9px',
              borderRadius: RADIUS.pill,
              fontSize: 10,
              fontWeight: 800,
              background: paceColor ? `color-mix(in srgb, ${paceColor} 16%, transparent)` : undefined,
              color: paceColor,
            }}
          >
            {paceState === 'onpace' ? 'ON PACE' : 'BEHIND PACE'}
          </span>
        </div>
      )}
    </div>
  );
}
