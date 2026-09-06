import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

interface UndoEntry {
  label: string;
  undo: () => Promise<void> | void;
  redo?: () => Promise<void> | void;
}

interface UndoContextValue {
  push: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  lastMessage: string | null;
}

const UndoContext = createContext<UndoContextValue | null>(null);

// Matches the legacy app's _UNDO_MAX (30) — a deep-enough safety net
// without growing unbounded over a long session.
const MAX_STACK = 30;

export function UndoProvider({ children }: { children: ReactNode }) {
  const undoStack = useRef<UndoEntry[]>([]);
  const redoStack = useRef<UndoEntry[]>([]);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const push = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_STACK) undoStack.current.shift();
    // A fresh action invalidates whatever was undo-able-back-into, same
    // as any standard undo/redo history (legacy has no redo at all, so
    // this rule has no precedent there — it's the obvious generalization).
    redoStack.current = [];
  }, []);

  const undo = useCallback(async () => {
    const entry = undoStack.current.pop();
    if (!entry) {
      setLastMessage('Nothing to undo');
      return;
    }
    try {
      await entry.undo();
      redoStack.current.push(entry);
      setLastMessage(`Undid: ${entry.label}`);
    } catch {
      setLastMessage(`Couldn't undo: ${entry.label}`);
    }
  }, []);

  const redo = useCallback(async () => {
    const entry = redoStack.current.pop();
    if (!entry || !entry.redo) {
      setLastMessage('Nothing to redo');
      return;
    }
    try {
      await entry.redo();
      undoStack.current.push(entry);
      setLastMessage(`Redid: ${entry.label}`);
    } catch {
      setLastMessage(`Couldn't redo: ${entry.label}`);
    }
  }, []);

  return <UndoContext.Provider value={{ push, undo, redo, lastMessage }}>{children}</UndoContext.Provider>;
}

export function useUndo(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error('useUndo must be used within UndoProvider');
  return ctx;
}
