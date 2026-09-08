import { useEffect, useState } from 'react';

// The app's own title bar.
//
// WHY. The OS strip above the window was the single loudest thing on
// screen saying "this was assembled at home". It painted in colours
// belonging to no theme here, in a font this app never chose, and spent
// 30px telling you the name of the window you are already looking at.
// Every desktop product a person pays for owns its whole rectangle.
//
// WHAT IT IS NOT. It is not decoration bolted on top: it does the work
// the OS bar did. The empty middle is the drag handle, double-clicking
// it maximises, and the three buttons are the three buttons. Anything
// less and the window becomes unusable, which is the usual way a custom
// title bar goes wrong.
//
// macOS keeps its native lights (main.ts sets frame:true there), so this
// renders name and mark only — hiding the traffic lights is not a style
// choice on that platform, it is removing the only close button.

// The mark. Twelve segments of a ring, one hour each, the first five
// filled: the app's whole argument in one glyph — the day is a fixed
// number of hours and the only question is how many you spent. Drawn
// rather than imported, in currentColor, so it themes with everything
// else and costs no file.
function Mark({ size = 16 }: { size?: number }) {
  const segs = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      {segs.map((i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const inner = i < 5 ? 4.5 : 7.5;
        return (
          <line
            key={i}
            x1={12 + Math.cos(a) * inner}
            y1={12 + Math.sin(a) * inner}
            x2={12 + Math.cos(a) * 10.5}
            y2={12 + Math.sin(a) * 10.5}
            stroke="currentColor"
            strokeWidth={i < 5 ? 2.4 : 1.4}
            strokeLinecap="round"
            opacity={i < 5 ? 1 : 0.4}
          />
        );
      })}
    </svg>
  );
}

const BAR_HEIGHT = 32;

function ControlButton({
  label,
  title,
  onClick,
  danger = false,
}: {
  label: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 44,
        height: BAR_HEIGHT,
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        // 44px wide and full bar height, which is the Fitts's-law reason
        // OS close buttons are the size they are: the corner of the
        // screen is infinitely deep only if the button reaches it.
        background: hover ? (danger ? '#C42B1C' : 'var(--accent-light)') : 'transparent',
        color: hover && danger ? '#FFFFFF' : 'var(--text-muted)',
        // The bar is the drag handle; its buttons must not be.
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );
}

export default function TitleBar() {
  const [maximised, setMaximised] = useState(false);
  const [native, setNative] = useState(false);

  // Optional-called, not just catch()-ed. A preload older than this
  // component does not HAVE windowState, and calling undefined throws
  // synchronously inside the effect — which React turns into a blank
  // window, not a missing title bar. The audit harness found this by
  // rendering one element and nothing else.
  useEffect(() => {
    window.api
      ?.windowState?.()
      .then((s) => {
        setMaximised(s.maximised);
        setNative(s.platform === 'darwin');
      })
      .catch(() => {});
  }, []);

  const control = (action: 'minimise' | 'maximise' | 'close') =>
    window.api
      ?.windowControl?.(action)
      .then((r) => setMaximised(r.maximised))
      .catch(() => {});

  return (
    <div
      onDoubleClick={() => !native && control('maximise')}
      style={{
        height: BAR_HEIGHT,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        // Left padding clears macOS's traffic lights when they are there.
        paddingLeft: native ? 76 : 12,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        userSelect: 'none',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <span style={{ color: 'var(--accent)', display: 'flex' }}>
        <Mark />
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 'bold',
          letterSpacing: 0.5,
          color: 'var(--text)',
        }}
      >
        HABIT OS
      </span>

      <span style={{ flex: 1 }} />

      {!native && (
        <>
          <ControlButton label={<Minus />} title="Minimise" onClick={() => control('minimise')} />
          <ControlButton
            label={maximised ? <Restore /> : <Square />}
            title={maximised ? 'Restore' : 'Maximise'}
            onClick={() => control('maximise')}
          />
          <ControlButton label={<Cross />} title="Close" onClick={() => control('close')} danger />
        </>
      )}
    </div>
  );
}

// The glyphs, drawn rather than typed. The obvious version of this bar
// uses the characters – □ ✕, and they are the wrong size, the wrong
// weight and a different weight from each other in every font — which is
// exactly the detail that makes a custom title bar look worse than the
// one it replaced. These are 10px strokes on a 10px box, identical.
const stroke = { stroke: 'currentColor', strokeWidth: 1, fill: 'none' } as const;
const Minus = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}>
    <line x1="0" y1="5" x2="10" y2="5" />
  </svg>
);
const Square = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}>
    <rect x="0.5" y="0.5" width="9" height="9" />
  </svg>
);
const Restore = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}>
    <rect x="0.5" y="2.5" width="7" height="7" />
    <path d="M2.5 2.5V0.5h7v7h-2" />
  </svg>
);
const Cross = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" {...stroke}>
    <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
    <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
  </svg>
);
