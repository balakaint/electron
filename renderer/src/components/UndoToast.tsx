import { useEffect, useState } from 'react';
import { useUndo } from '../undo';

export default function UndoToast() {
  const { lastMessage } = useUndo();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastMessage) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [lastMessage]);

  if (!visible || !lastMessage) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        background: 'var(--surface-2, #222)',
        color: 'var(--text, #eee)',
        border: '1px solid var(--border, #444)',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 13,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        zIndex: 1000,
      }}
    >
      {lastMessage}
    </div>
  );
}
