import type { KeyboardEvent } from 'react';

// Left/Right arrows for a segmented control: move the selection to the
// neighbouring option (wrapping at the ends) and move focus with it, the
// way the EXECUTE tab strip already behaves. Expects the option buttons
// to be the control's direct children, in the same order as `keys`.
export function segmentedKeyDown<T>(
  e: KeyboardEvent<HTMLElement>,
  keys: readonly T[],
  current: T,
  select: (k: T) => void,
): void {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  const i = keys.indexOf(current);
  const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + keys.length) % keys.length;
  select(keys[next]);
  (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
}
