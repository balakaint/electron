/**
 * Regression test for the startup retry in api.ts.
 *
 * Run:
 *   npx esbuild renderer/src/services/api-retry.test.ts --bundle \
 *     --platform=node --format=cjs --outfile=/tmp/retry.cjs && node /tmp/retry.cjs
 *
 * The bug this pins: the window can open before the Python engine is
 * listening. main.ts waits for the engine's READY marker OR five
 * seconds, whichever comes first, and a cold start with migrations to
 * run can exceed that. Every screen fetches on mount, nothing
 * re-fetches, so one request landing in that gap left its component
 * empty for the rest of the session.
 *
 * It showed up as an asymmetric failure: the clock column (day phases,
 * scope stats, deep-work trend) was blank while the projects and goals
 * panels were fine — those two mount after the settings call resolves,
 * which is late enough that the engine is up.
 *
 * The other half of the fix is what is NOT retried. An HTTP status is
 * an answer; repeating it only delays a real error. So the test checks
 * the attempt COUNT, not just the outcome — a version that retried
 * everything would still pass on the outcome alone.
 */

// Installed before importing api.ts, which reads window.api per call.
const calls: string[] = [];
let behaviour: () => Promise<unknown> = async () => ({});

(globalThis as unknown as { window: unknown }).window = {
  api: {
    request: (method: string, path: string) => {
      calls.push(`${method} ${path}`);
      return behaviour();
    },
  },
};

import { tasksApi } from './api';

let bad = 0;
const t = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok || !detail ? '' : ' — ' + detail}`);
};

async function main() {
  // A cold engine: connection failures until it comes up.
  calls.length = 0;
  let n = 0;
  behaviour = async () => {
    if (++n < 4) throw new Error('Failed to fetch');
    return [{ id: 1 }];
  };
  const rows = (await tasksApi.list()) as unknown[];
  t('a cold engine is retried until it answers', rows.length === 1);
  t('and it took 4 attempts', calls.length === 4, `got ${calls.length}`);

  // An HTTP answer is an answer, whatever the status.
  calls.length = 0;
  behaviour = async () => {
    throw new Error('404 Not Found');
  };
  let threw = false;
  await tasksApi.list().catch(() => (threw = true));
  t('a 404 throws immediately', threw);
  t('and is attempted exactly once', calls.length === 1, `got ${calls.length}`);

  calls.length = 0;
  behaviour = async () => {
    throw new Error('422 {"detail":"bad"}');
  };
  await tasksApi.list().catch(() => {});
  t('a 422 is also not retried', calls.length === 1, `got ${calls.length}`);

  // An engine that never comes up must still give up.
  calls.length = 0;
  behaviour = async () => {
    throw new Error('Failed to fetch');
  };
  threw = false;
  await tasksApi.list().catch(() => (threw = true));
  t('a dead engine eventually throws', threw);
  t('after a bounded number of attempts', calls.length === 5, `got ${calls.length}`);

  console.log(bad ? `FAIL (${bad})` : 'retry checks clean');
  process.exit(bad ? 1 : 0);
}

main();
