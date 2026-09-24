// How HourPlan cuts one block's hours into the rows it draws. Pure, and
// kept out of the component so hourSegments.test.ts can check it without
// a browser.
//
// Consecutive hours with the same trimmed text form one run (a "span"
// card), and so do consecutive empty hours (a folded "N open hours" row)
// — except:
//   - the current hour never joins an EMPTY run: it keeps its own row,
//     which asks "What are you doing this hour?";
//   - an hour listed in `apart` never joins anything: the user pressed
//     "split" on its span and wants to write each hour separately, even
//     while they still hold the same text.

export interface SegmentSlot {
  hour: number;
  text: string;
}

export function segmentHours(hours: SegmentSlot[], nowHour: number | null, apart: ReadonlySet<number> = new Set()): number[][] {
  const out: number[][] = [];
  let prev: SegmentSlot | undefined;
  for (const slot of hours) {
    const last = out[out.length - 1];
    const text = slot.text.trim();
    const joins =
      prev !== undefined &&
      !apart.has(slot.hour) &&
      !apart.has(prev.hour) &&
      prev.text.trim() === text &&
      (text !== '' || (slot.hour !== nowHour && prev.hour !== nowHour));
    if (joins) last.push(slot.hour);
    else out.push([slot.hour]);
    prev = slot;
  }
  return out;
}
