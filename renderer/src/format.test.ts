/**
 * Run:
 *   npx esbuild renderer/src/format.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/f.cjs && node /tmp/f.cjs
 *
 * The bug: a running task's `secs` is a float, and StrikeCard's own copy
 * of this formatter took `secs % 60` without rounding, so the row read
 * "4:10.14644455909729". Visible on screen, invisible to every type
 * check — the types were all `number` and all correct.
 */
import { dayNumber, formatSecs, projTimeText } from './format';

let bad = 0;
const t = (label: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok ? '' : ` — got ${got}, want ${want}`}`);
};

t('whole seconds', formatSecs(250), '4:10');
t('a running timer is a FLOAT', formatSecs(250.14644455909729), '4:10');
t('and never leaks its fraction', formatSecs(9.9999), '0:10');
t('seconds stay two digits', formatSecs(65), '1:05');
t('zero', formatSecs(0), '0:00');
t('minutes are not padded', formatSecs(3600), '60:00');
t('negative clamps rather than printing "-1:-1"', formatSecs(-5), '0:00');

// projTimeText — legacy's own bug report: a second copy of this wording
// wrote "0m / 60m" while the card below said "15m / 1h".
t('a one-hour target reads as hours', projTimeText(0, 60), '0m / 1h');
t('two hours too', projTimeText(0, 120), '0m / 2h');
t('but 90 minutes stays minutes', projTimeText(0, 90), '0m / 90m');
t('and 15 does', projTimeText(0, 15), '0m / 15m');
t('elapsed under an hour is bare minutes', projTimeText(15 * 60, 60), '15m / 1h');
t('elapsed over an hour gains hours', projTimeText(75 * 60, 120), '1h 15m / 2h');
t('and pads the minutes', projTimeText(65 * 60, 120), '1h 05m / 2h');
t('a running float does not leak', projTimeText(901.7, 60), '15m / 1h');

// dayNumber — the day it was added is DAY 1, not DAY 0.
const on = (iso: string, y: number, m: number, d: number) => dayNumber(iso, new Date(y, m - 1, d));
t('added today is DAY 1', on('2026-09-08', 2026, 9, 8), 'DAY 1');
t('yesterday is DAY 2', on('2026-09-07', 2026, 9, 8), 'DAY 2');
t('a week ago is DAY 8', on('2026-09-01', 2026, 9, 8), 'DAY 8');
t('across a month boundary', on('2026-08-30', 2026, 9, 8), 'DAY 10');
t('a future date never goes below 1', on('2026-09-20', 2026, 9, 8), 'DAY 1');
t('an unparseable date falls back', dayNumber('not-a-date'), 'DAY 1');

console.log(bad ? `FAIL (${bad})` : 'format checks clean');
process.exit(bad ? 1 : 0);
