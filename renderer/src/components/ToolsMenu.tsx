import { useEffect, useRef, useState } from 'react';

// Legacy's gear-icon Tools menu (task_tracker_v3_THEMES.py 16237-16332):
// a popup of icon + label + one-line description rows.
//
// Legacy lists nine entries. Six of them launch the sibling apps in
// section R (Life Execution Board, Cash Is Your Brain, Goal Step, Deep
// Work, Browse Music, Re-entry), which are separate products and are
// excluded from this port by decision — they are NOT missing from this
// menu by oversight. What remains is the four this port can actually
// reach, in legacy's own order.
//
// Legacy opens the menu leftward from the button because its gear sits
// flush against the screen edge and a rightward menu would run
// off-screen. Same reasoning, same anchoring here.

export interface ToolEntry {
  icon: string;
  label: string;
  desc: string;
  onSelect: () => void;
}

export default function ToolsMenu({ entries }: { entries: ToolEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      // Stops here rather than bubbling to the app-wide Escape handler,
      // which would otherwise also close whatever dialog is behind this.
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Tools"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ fontSize: 12 }}
      >
        ⚙
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 2,
            minWidth: 260,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            zIndex: 2500,
            overflow: 'hidden',
          }}
        >
          {entries.map((t) => (
            <button
              key={t.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                t.onSelect();
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                font: 'inherit',
                padding: '7px 10px',
                cursor: 'pointer',
              }}
            >
              <span style={{ color: 'var(--accent)', width: 14 }}>{t.icon}</span>
              <span>
                <span style={{ fontSize: 12, display: 'block' }}>{t.label}</span>
                {/* The one-line description is why this is a menu and
                    not a row of icons: it says what the entry does
                    before you commit to clicking it. */}
                <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'block' }}>{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
