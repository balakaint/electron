// A circular progress ring — the one recurring shape across the
// Discipline modules: the Morning Ritual card's step/streak indicator,
// the in-flow step counter (Wake Up / Complete), and (optionally) the
// trend view. One shared component so all three read as the same idea
// instead of three different progress widgets that happen to sit near
// each other. Track + arc, SVG, no external chart library — this is a
// single stroke-dasharray circle, nothing a library earns its weight
// for.
export default function RitualRing({
  progress,
  size = 40,
  stroke = 4,
  accent,
  trackColor = 'var(--progress-track)',
  children,
}: {
  progress: number; // 0..1
  size?: number;
  stroke?: number;
  accent: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      {/* stroke is set via `style`, not the SVG attribute — `accent`/
          `trackColor` can be a CSS custom property (var(--accent)) so
          this ring follows the active theme, and var() in a plain SVG
          attribute isn't reliably supported the way it is in style. */}
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: trackColor }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          strokeLinecap="round"
          style={{ stroke: accent, transition: 'stroke-dashoffset 200ms ease' }}
        />
      </svg>
      {children && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {children}
        </div>
      )}
    </div>
  );
}
