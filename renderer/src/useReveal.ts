import { useEffect, useRef } from 'react';

// Scroll the nearest scrolling ancestor just enough to bring an
// element's bottom into view — never past the element's own top, and
// not at all when it already fits (Zahid, 2026-09-25: "not all the way
// up, only as far as needed"). Used when a section opens or grows on a
// click: PLAN's Review tabs and the folded sections around it.
export function revealBelow(el: HTMLElement | null, gap = 8): void {
  if (!el) return;
  let box: HTMLElement | null = el.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) {
    box = box.parentElement;
  }
  if (!box) return;
  const e = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const by = Math.min(e.bottom - b.bottom + gap, e.top - b.top - gap);
  if (by > 1) box.scrollBy({ top: by });
}

// revealBelow on demand, plus for a moment afterwards: what a click
// opens often loads after it (Discipline's cards, the Review card
// itself), so the element is watched for ~1.5s and revealed again as it
// grows. Returns the ref to put on the element and the function to call
// from the click.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const until = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      if (Date.now() < until.current) revealBelow(ref.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const reveal = () => {
    until.current = Date.now() + 1500;
    requestAnimationFrame(() => revealBelow(ref.current));
  };
  return { ref, reveal };
}
