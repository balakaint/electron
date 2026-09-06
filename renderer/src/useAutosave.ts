import { useCallback, useEffect, useRef, useState } from 'react';

// Legacy's _debounced_save + _flash_saved (task_tracker_v3_THEMES.py
// 7605-7640): coalesce rapid edits into one save after a quiet period,
// then briefly confirm it happened.
//
// Before this, every component autosaved in its own onBlur handler. That
// works, but it saves nothing while you are typing — so a long note is
// unsaved for as long as you keep writing, and a crash or a stray click
// elsewhere loses it. It also gives no confirmation at all, which for a
// field with no Save button leaves "did that stick?" permanently open.
//
// DELAY is legacy's own 800ms. Short enough that a pause between
// sentences commits; long enough that ordinary typing doesn't fire a
// request per keystroke.
const DELAY = 800;
const FLASH_MS = 500;

export type SaveState = 'idle' | 'pending' | 'saved';

/**
 * Debounced autosave for one field.
 *
 * Returns the live value, a setter to bind to onChange, a `flush` for
 * onBlur (commit now rather than waiting out the delay), and a state
 * flag for the confirmation flash.
 */
export function useAutosave<T>(
  value: T,
  save: (v: T) => Promise<unknown> | unknown,
  delay = DELAY,
): {
  value: T;
  setValue: (v: T) => void;
  flush: () => void;
  state: SaveState;
} {
  const [local, setLocal] = useState<T>(value);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held in a ref so a changing `save` closure never restarts a pending
  // timer — the timer belongs to the edit, not to the render.
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<T>(value);
  const dirty = useRef(false);

  // Accept an external change (a refresh from the server, or switching
  // to a different record) only when there is no unsaved local edit —
  // otherwise a refresh landing mid-sentence would overwrite what is
  // being typed.
  useEffect(() => {
    if (!dirty.current) {
      setLocal(value);
      pending.current = value;
    }
  }, [value]);

  const commit = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    Promise.resolve(saveRef.current(pending.current))
      .then(() => {
        setState('saved');
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setState('idle'), FLASH_MS);
      })
      .catch(() => setState('idle'));
  }, []);

  const setValue = useCallback(
    (v: T) => {
      setLocal(v);
      pending.current = v;
      dirty.current = true;
      setState('pending');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(commit, delay);
    },
    [commit, delay],
  );

  // A pending edit must not be lost when the field unmounts — switching
  // page or closing a dialog mid-edit is exactly when losing it hurts.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (dirty.current) {
          dirty.current = false;
          Promise.resolve(saveRef.current(pending.current)).catch(() => {});
        }
      }
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  return { value: local, setValue, flush: commit, state };
}

/**
 * The visual half of legacy's _flash_saved: a border that tints to the
 * success color for half a second once a save lands.
 *
 * Returned as style props rather than a wrapper component so it can be
 * spread onto whatever element a field already renders — an input, a
 * textarea, or the container around them.
 */
export function savedFlashStyle(state: SaveState): React.CSSProperties {
  return {
    outline: state === 'saved' ? '1px solid var(--success)' : undefined,
    outlineOffset: 0,
    transition: 'outline-color 200ms',
  };
}
