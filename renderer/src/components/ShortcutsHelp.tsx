import { RADIUS } from '../spacing';
import { useFocusTrap } from '../hooks/useFocusTrap';
const SHORTCUTS: [string, string][] = [
  ['Ctrl+Z', 'Undo last action'],
  ['Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+T', 'Cycle theme'],
  ['Ctrl+Shift+T', 'Cycle theme (reverse)'],
  ['F1 or ?', 'Show/hide this panel'],
  ['Ctrl+F', 'Focus mode — tasks only, docked'],
  ['Esc or Ctrl+W', 'Close the topmost dialog'],
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: RADIUS.card,
          padding: 24,
          width: 320,
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 id="shortcuts-title" style={{ margin: 0, fontSize: 16 }}>Keyboard Shortcuts</h2>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <tbody>
            {SHORTCUTS.map(([key, desc]) => (
              <tr key={key}>
                <td style={{ padding: '4px 0', fontFamily: 'monospace', opacity: 0.8, width: 130 }}>{key}</td>
                <td style={{ padding: '4px 0' }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
