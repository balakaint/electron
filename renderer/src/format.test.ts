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
import { formatSecs } from './format';

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

console.log(bad ? `FAIL (${bad})` : 'format checks clean');
process.exit(bad ? 1 : 0);
