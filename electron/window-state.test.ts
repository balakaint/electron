/**
 * Regression test for windowStateToPersist (electron/main.ts).
 *
 * Run:
 *   npx esbuild electron/window-state.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/wt.cjs \
 *     --alias:electron=./electron/electron-stub.cjs && node /tmp/wt.cjs
 *
 * The bug this pins: compact mode's geometry is computed (a fixed width
 * docked to the screen edge), not chosen by the user. Persisting it as
 * window state overwrote the only record of the real window size, so on
 * the next launch the window opened at 420px, compact was re-applied on
 * top of that, and the "restore" bounds captured 420px as the full size.
 * Leaving compact then resized the window to 420px — nav and clock
 * crammed into a sliver with a horizontal scrollbar, and no way back
 * except a manual drag.
 *
 * Found by visual testing, which is the only thing that would have found
 * it: every type check and unit test passed with the bug present.
 */
import { healWindowState, windowStateToPersist } from './main';

let bad = 0;
const t = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok || !detail ? '' : ' — ' + detail}`);
};

const FULL = { x: 100, y: 60, width: 1400, height: 900 };
const COMPACT = { x: 1500, y: 0, width: 420, height: 1040 };

const a = windowStateToPersist('full', { bounds: FULL, maximized: false }, null)!;
t('full persists the live bounds', a.width === 1400 && a.x === 100);
t('full records compact:false', a.compact === false);

const b = windowStateToPersist(
  'compact',
  { bounds: COMPACT, maximized: false },
  { bounds: FULL, maximized: false },
)!;
t('compact does NOT persist the docked width', b.width !== 420, `got ${b.width}`);
t(
  'compact persists the remembered full geometry',
  b.width === 1400 && b.height === 900 && b.x === 100,
  JSON.stringify(b),
);
t('compact records compact:true', b.compact === true);

// The round trip is the actual failure mode: what gets written while
// compact is what the next launch reopens from.
const reopened = { x: b.x!, y: b.y!, width: b.width, height: b.height };
t(
  'reopening from a compact save restores the FULL size',
  reopened.width === 1400 && reopened.height === 900,
  JSON.stringify(reopened),
);

// 'partial' hides a column but leaves the window alone, so it must
// persist like 'full' — treating it as compact would freeze the saved
// geometry the moment the projects panel was collapsed.
const p = windowStateToPersist('partial', { bounds: FULL, maximized: false }, null)!;
t('partial persists the live bounds like full', p.width === 1400 && p.x === 100);
t('partial is not recorded as compact', p.compact === false);

t(
  'compact with nothing remembered writes nothing',
  windowStateToPersist('compact', { bounds: COMPACT, maximized: false }, null) === null,
);

const c = windowStateToPersist(
  'compact',
  { bounds: COMPACT, maximized: false },
  { bounds: FULL, maximized: true },
)!;
t('a maximized window stays maximized in the saved state', c.maximized === true);

// ── healWindowState ──
// A machine that ran the broken build has {width: 420} with no flag on
// disk. Reopening from it put three columns in a 420px window.
const stale = healWindowState({ x: 1500, y: 0, width: 420, height: 1040, maximized: false });
t('a stale narrow state is widened', stale.width >= 900, String(stale.width));
t('and its docked position is dropped', stale.x === undefined && stale.y === undefined);
t('and it keeps a usable height', stale.height >= 900, String(stale.height));

// A genuinely compact state is identified by its flag, not by width, so
// the repair must leave it alone or compact would stop working.
const realCompact = healWindowState({ x: 100, y: 60, width: 1400, height: 900, maximized: false, compact: true });
t('a real compact state is untouched', realCompact.width === 1400 && realCompact.x === 100);

const normal = healWindowState({ x: 100, y: 60, width: 1400, height: 900, maximized: false });
t('a normal state is untouched', normal.width === 1400 && normal.x === 100);

const small = healWindowState({ width: 899, height: 500, maximized: false });
t('the boundary is FULL_MIN_WIDTH', small.width >= 900 && small.height >= 900);

console.log(bad ? `FAIL (${bad})` : 'window-state checks clean');
// Exit before main.ts's module-level engine spawn can fail under the stub.
process.exit(bad ? 1 : 0);
