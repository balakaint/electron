const SHORTCUTS: [string, string][] = [
  ['Ctrl+Z', 'Undo last action'],
  ['Ctrl+Shift+Z', 'Redo'],
  ['Ctrl+T', 'Cycle theme'],
  ['Ctrl+Shift+T', 'Cycle theme (reverse)'],
  ['F1 or ?', 'Show/hide this panel'],
  ['Esc', 'Close this panel'],
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface, #fff)',
          color: 'var(--text, #111)',
          border: '1px solid var(--border, #ccc)',
          borderRadius: 10,
          padding: 24,
          width: 320,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Keyboard Shortcuts</h2>
          <button onClick={onClose}>✕</button>
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
