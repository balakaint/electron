/**
 * Run:
 *   npx esbuild renderer/src/hourSegments.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/hs.cjs && node /tmp/hs.cjs
 *
 * segmentHours decides which hours HourPlan draws as one card. Get it
 * wrong and an edit lands on hours the user never meant to touch (a span
 * that swallowed a neighbour), or the current hour disappears into a
 * folded "3 open hours" row — neither of which a type check can see.
 */
import { SegmentSlot, segmentHours } from './hourSegments';

let bad = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok ? '' : ` — got ${g}, want ${w}`}`);
};

const day = (entries: [number, string][]): SegmentSlot[] => entries.map(([hour, text]) => ({ hour, text }));

// A Work block, 9 AM to 4 PM.
const work = day([
  [9, 'Inbox'],
  [10, 'Draft pricing'],
  [11, 'Draft pricing'],
  [12, ''],
  [13, ''],
  [14, 'Client call'],
  [15, ''],
  [16, 'Ship build'],
]);

t('same text on consecutive hours is one span', segmentHours(work, null), [[9], [10, 11], [12, 13], [14], [15], [16]]);
t('the current hour still joins a WRITTEN span', segmentHours(work, 10), [[9], [10, 11], [12, 13], [14], [15], [16]]);
t('but never an empty run — it keeps its own row', segmentHours(work, 12), [[9], [10, 11], [12], [13], [14], [15], [16]]);
t('from either side of the run', segmentHours(work, 13), [[9], [10, 11], [12], [13], [14], [15], [16]]);

t('text is compared trimmed', segmentHours(day([[1, 'Read'], [2, ' Read ']]), null), [[1, 2]]);
t('whitespace-only counts as empty', segmentHours(day([[1, ''], [2, '   ']]), null), [[1, 2]]);
t('the same text NOT adjacent stays apart', segmentHours(day([[1, 'A'], [2, 'B'], [3, 'A']]), null), [[1], [2], [3]]);

// Split: hours the user broke out of a span stay one row each.
t('split hours never join', segmentHours(work, null, new Set([10, 11])), [[9], [10], [11], [12, 13], [14], [15], [16]]);
t('and neither does their neighbour into them', segmentHours(day([[1, 'A'], [2, 'A'], [3, 'A']]), null, new Set([2])), [[1], [2], [3]]);

// Sleep wraps midnight: the block's order is the order to read it in.
const sleep = day([
  [22, 'Sleep'],
  [23, 'Sleep'],
  [0, 'Sleep'],
  [1, ''],
]);
t('a span may cross midnight', segmentHours(sleep, null), [[22, 23, 0], [1]]);

t('no hours, no rows', segmentHours([], null), []);

if (bad) {
  console.error(`\n${bad} hour-segment checks failed`);
  process.exit(1);
}
console.log('hour-segment checks clean');
