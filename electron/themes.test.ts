/**
 * Drift test for DARK_THEMES (electron/main.ts).
 *
 * Run:
 *   npx esbuild electron/themes.test.ts --bundle --platform=node \
 *     --format=cjs --outfile=/tmp/th.cjs \
 *     --alias:electron=./electron/electron-stub.cjs && node /tmp/th.cjs
 *
 * The bug this pins: which themes are dark is a fact about the PALETTE,
 * and the palette lives in renderer/src/themes.ts. main.ts kept a second
 * copy of that fact as a hand-written list so it could set the native
 * title bar, and the two drifted — the list said FOCUS was dark when
 * FOCUS is the app's default LIGHT theme, so Windows drew a black title
 * bar above a near-white window.
 *
 * main.ts cannot import themes.ts (different tsconfig rootDir), so the
 * copy stays — but it is no longer unchecked. This reads themes.ts as
 * text, pulls each theme's first colour (its background), computes the
 * WCAG relative luminance, and asserts main.ts agrees about every one.
 * Change a palette to a dark variant and forget main.ts, and this fails.
 */
import fs from 'fs';
import path from 'path';
import { DARK_THEMES } from './main';

let bad = 0;
const t = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${label}${ok || !detail ? '' : ' — ' + detail}`);
};

// Resolved from the working directory, not __dirname: esbuild bundles
// this into /tmp, so __dirname is /tmp at run time and the relative path
// walks out of the repo entirely. The documented runner is invoked from
// the project root, which is what cwd is.
const CANDIDATES = [
  path.resolve(process.cwd(), 'renderer/src/themes.ts'),
  path.resolve(__dirname, '../renderer/src/themes.ts'),
];
const THEMES_TS = CANDIDATES.find((p) => fs.existsSync(p));
if (!THEMES_TS) {
  console.log(`BAD  cannot find themes.ts (looked in ${CANDIDATES.join(', ')})`);
  process.exit(1);
}
const src = fs.readFileSync(THEMES_TS, 'utf-8');

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// The palette block for each theme starts at `  <name>: {`; its first
// hex value is the surface colour the window is painted with.
function backgroundOf(theme: string): string | null {
  const start = src.indexOf(`\n  ${theme}: {`);
  if (start === -1) return null;
  const hex = /#[0-9A-Fa-f]{6}/.exec(src.slice(start, start + 400));
  return hex ? hex[0] : null;
}

const THEMES = ['focus', 'warroom', 'energy', 'corporate', 'journey', 'rize'];

t('every theme in THEME_ORDER has a palette', THEMES.every((n) => backgroundOf(n) !== null));

const derived = new Set<string>();
for (const name of THEMES) {
  const bg = backgroundOf(name)!;
  const lum = luminance(bg);
  const isDark = lum < 0.2;
  if (isDark) derived.add(name);
  t(
    `${name.padEnd(9)} ${bg} -> ${isDark ? 'dark ' : 'light'}  matches main.ts`,
    DARK_THEMES.has(name) === isDark,
    `themes.ts says ${isDark ? 'dark' : 'light'}, main.ts says ${
      DARK_THEMES.has(name) ? 'dark' : 'light'
    }`,
  );
}

t(
  'main.ts lists no theme that does not exist',
  [...DARK_THEMES].every((n) => THEMES.includes(n)),
  [...DARK_THEMES].join(','),
);
t(
  'the two sets are identical',
  DARK_THEMES.size === derived.size && [...derived].every((n) => DARK_THEMES.has(n)),
  `main.ts={${[...DARK_THEMES]}} themes.ts={${[...derived]}}`,
);

// The specific regression: FOCUS is light and is the default theme, so
// getting it wrong is the one everybody sees first.
t('FOCUS is treated as light', !DARK_THEMES.has('focus'));

console.log(bad ? `FAIL (${bad})` : 'theme checks clean');
process.exit(bad ? 1 : 0);
