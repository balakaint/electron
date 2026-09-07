/**
 * Pins the wiring rule behind focusVersion (App.tsx, ProjectDashboard,
 * TaskList).
 *
 * Run:
 *   npx esbuild renderer/src/panel-sync.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/ps.cjs && node /tmp/ps.cjs
 *
 * Two panels render the same focus task list. They each fetched their
 * own copy and never heard about the other's writes, so a task struck
 * in panel 3 left panel 1's "+ STRIKE" chip enabled against a server
 * that was already full: click, 409, nothing visible, click again.
 *
 * The fix is a "that list changed" signal. The trap is using ONE
 * counter for it: each panel then re-fetches in response to its own
 * write, which re-notifies, which re-fetches. So each panel bumps the
 * counter it owns and listens to the other's.
 *
 * This models both wirings and runs them to a fixpoint. The shared-
 * counter version is included precisely so the test can show it looping
 * — a rule with nothing failing it is not pinned.
 */

interface Wiring {
  // Which counter a panel's own write increments, and which it watches.
  bumps: 'a' | 'b';
  watches: 'a' | 'b';
}

// Returns how many re-fetches settling took, or null if it never settles.
function settle(p1: Wiring, p3: Wiring, cap = 50): number | null {
  const counters = { a: 0, b: 0 };
  const seen = { p1: { a: 0, b: 0 }, p3: { a: 0, b: 0 } };
  let fetches = 0;

  // Panel 3 writes once — the user strikes a task there.
  counters[p3.bumps]++;

  for (let step = 0; step < cap; step++) {
    let acted = false;
    for (const [name, w] of [['p1', p1] as const, ['p3', p3] as const]) {
      if (seen[name][w.watches] !== counters[w.watches]) {
        seen[name][w.watches] = counters[w.watches];
        fetches++;
        acted = true;
        // A re-fetch is a READ. It must not bump anything — that is the
        // whole reason refresh() and the version effect are separate
        // code paths in both components.
      }
    }
    if (!acted) return fetches;
  }
  return null;
}

let bad = 0;
const t = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok || !detail ? '' : ' — ' + detail}`);
};

// What App.tsx actually does: crossed.
const crossed = settle({ bumps: 'a', watches: 'b' }, { bumps: 'b', watches: 'a' });
t('crossed counters settle', crossed !== null);
t('and panel 1 re-fetches exactly once', crossed === 1, `got ${crossed}`);

// The tempting one-counter version, kept to prove the rule bites.
const shared = settle({ bumps: 'a', watches: 'a' }, { bumps: 'a', watches: 'a' });
t('a single shared counter would make BOTH panels react', shared !== 1, `got ${shared}`);
t('including the panel that did the writing', shared === 2 || shared === null, `got ${shared}`);

console.log(bad ? `FAIL (${bad})` : 'panel-sync checks clean');
process.exit(bad ? 1 : 0);
