import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { RADIUS, SPACE } from '../spacing';
import { TRACKING, TYPE_SIZE, TYPE_WEIGHT } from '../typography';
import { accentText } from '../themes';

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
  ownerColor,
  defaultOpen = false,
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
  // The owning project's own colour (null for LIFE). Paints the card's
  // left edge and its label, so on WEEK/MONTH/YEAR — which list every
  // project at once — whose card this is reads before its title does.
  // The level accent stays on the progress bar.
  ownerColor?: string | null;
  // WEEK's list is its actions, the thing you open the card to tick, so
  // it starts open there; MONTH/YEAR's lists are summaries and stay shut.
  defaultOpen?: boolean;
}) {
  const edge = ownerColor ? ownerColor : accent;
  const labelColor = ownerColor ? accentText(ownerColor) : accent;
  const achieved = progress === 100;
  const paceState = pace ? (progress >= pace.elapsedPct ? 'onpace' : 'behind') : null;
  const paceColor = paceState === 'onpace' ? 'var(--success)' : paceState === 'behind' ? 'var(--danger)' : undefined;

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${edge}`,
        borderRadius: RADIUS.card,
        background: 'var(--surface)',
        padding: SPACE.md,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <span style={{ fontSize: TYPE_SIZE.xs, fontWeight: TYPE_WEIGHT.bold, letterSpacing: TRACKING.label, color: labelColor }}>{label}</span>
        <span style={{ flex: 1 }} />
        {fixed && (
          <span style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-faint)' }}>not started</span>
        )}
        {onEdit && (
          <button onClick={onEdit} style={{ fontSize: TYPE_SIZE.xs, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            ✎ Edit
          </button>
        )}
      </div>
      <div style={{ fontSize: TYPE_SIZE.base, fontWeight: TYPE_WEIGHT.bold, lineHeight: 1.35 }}>{title}</div>
      <div style={{ height: 7, borderRadius: RADIUS.pill, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: accent, transition: 'width 300ms ease' }} />
      </div>
      {achieved && (
        // "COMPLETE", not "ACHIEVED" — this fires on progress === 100
        // alone, which is a numeric coincidence (every sub-item happens
        // to be done), not the explicit achieved-pin action
        // (_apply_achieved_pin sets fixed=True separately). "ACHIEVED"
        // implied more certainty than a derived percentage carries
        // (ui-ux-audit, 2026-09-24) — the wording now matches what's
        // actually known. Check icon, not a 🏆 emoji — this app's own
        // rule against color emoji in chrome (see Panel3.tsx's
        // PLAN/EXECUTE toggle comment) applies here too.
        <span
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: SPACE.hair,
            padding: `${SPACE.xs}px ${SPACE.sm}px`,
            borderRadius: RADIUS.pill,
            fontSize: TYPE_SIZE.xs,
            fontWeight: TYPE_WEIGHT.bold,
            letterSpacing: TRACKING.label,
            background: 'color-mix(in srgb, var(--success) 16%, transparent)',
            color: 'var(--success)',
          }}
        >
          <Check size={12} />
          COMPLETE{criteria ? ` — ${criteria}` : ''}
        </span>
      )}
      {children && (
        <details open={defaultOpen} style={{ fontSize: TYPE_SIZE.xs }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontWeight: TYPE_WEIGHT.bold }}>{detailsSummary}</summary>
          <div style={{ marginTop: SPACE.xs }}>{children}</div>
        </details>
      )}
      {pace && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs, paddingTop: SPACE.xs, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: TYPE_SIZE.xs }}>
            <span style={{ color: 'var(--text-faint)' }}>TIME</span>
            <span>{pace.elapsedLabel}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: TYPE_SIZE.xs }}>
            <span style={{ color: 'var(--text-faint)' }}>PROGRESS</span>
            <span>{progress}%</span>
          </div>
          <span
            style={{
              alignSelf: 'flex-start',
              padding: `${SPACE.xs}px ${SPACE.sm}px`,
              borderRadius: RADIUS.pill,
              fontSize: TYPE_SIZE.xs,
              fontWeight: TYPE_WEIGHT.bold,
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
