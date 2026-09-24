/**
 * Run:
 *   npx esbuild renderer/src/horizons.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/hz.cjs && node /tmp/hz.cjs
 *
 * The month / year tiles on PLAN print these numbers as facts ("Day 267
 * of 365", "3 months left"). The edges — leap years, a month's last day,
 * the switch from months to days near the year's end — are where an
 * off-by-one would sit unnoticed for months.
 */
import { dayOfYear, daysInMonth, horizons } from './horizons';

let bad = 0;
const t = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);

t('February, common year', daysInMonth(2026, 1), 28);
t('February, leap year', daysInMonth(2028, 1), 29);
t('September', daysInMonth(2026, 8), 30);

t('1 January is day 1', dayOfYear(d(2026, 1, 1)), 1);
t('24 September 2026 is day 267', dayOfYear(d(2026, 9, 24)), 267);
t('31 December, common year', dayOfYear(d(2026, 12, 31)), 365);
t('31 December, leap year', dayOfYear(d(2028, 12, 31)), 366);
t('1 March after a leap day', dayOfYear(d(2028, 3, 1)), 61);
t('late in the evening is still the same day', dayOfYear(new Date(2026, 2, 29, 23, 59)), 88);

const sep = horizons(d(2026, 9, 24));
t('Sep 24: 6 days left in the month', sep.monthLeft, 6);
t('Sep 24: day 267 of 365', [sep.yearDay, sep.yearDays], [267, 365]);
t('Sep 24: 98 days left in the year', sep.yearLeft, 98);
t('Sep 24: about 3 months left', sep.monthsLeftHalves, 3);

t('last day of a month: 0 days left', horizons(d(2026, 4, 30)).monthLeft, 0);
t('mid-November: 1½ months left', horizons(d(2026, 11, 15)).monthsLeftHalves, 1.5);
t('December switches to counting days', horizons(d(2026, 12, 10)).monthsLeftHalves, null);
t('and counts them', horizons(d(2026, 12, 10)).yearLeft, 21);
t('31 December: 0 days left', horizons(d(2026, 12, 31)).yearLeft, 0);
t('leap year: 366 days', horizons(d(2028, 6, 1)).yearDays, 366);

if (bad) {
  console.error(`\n${bad} horizon checks failed`);
  process.exit(1);
}
console.log('horizon checks clean');
