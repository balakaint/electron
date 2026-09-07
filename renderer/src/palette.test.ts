/**
 * Contrast check for the palettes themselves.
 *
 * Run:  npx esbuild renderer/src/palette.test.ts --bundle --platform=node \
 *         --format=cjs --outfile=/tmp/pal.cjs && node /tmp/pal.cjs
 *
 * tests/ux-audit.mjs measures the rendered app and is the authority on
 * what a user actually sees — but it needs a browser, an engine and
 * about four minutes. This checks the same arithmetic on the palette
 * alone, in milliseconds, with no browser at all. It cannot see a colour
 * the audit would catch being dimmed by inline opacity; it CAN say
 * whether the tokens are sound before anything is painted with them.
 *
 * The pairs below are "what is drawn on what", read out of the
 * components. A token is only checked against a surface it is actually
 * used on — inventing pairs would produce failures nobody can act on.
 */
import { PALETTES, THEME_ORDER, Theme } from './themes';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** srgb mix, for the tinted block backgrounds HourPlan paints. */
function mix(fg: string, bg: string, pct: number): string {
  const p = (h: string, i: number) => parseInt(h.replace('#', '').slice(i, i + 2), 16);
  const c = [0, 2, 4].map((i) => Math.round(p(fg, i) * pct + p(bg, i) * (1 - pct)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Normal text needs 4.5:1. Nothing checked here is large enough to earn
// the 3:1 exemption — the phase names are 13px, the counts 12px.
const AA = 4.5;

let bad = 0;
const rows: string[] = [];

const check = (theme: Theme, label: string, fg: string, bg: string, need = AA) => {
  const got = contrast(fg, bg);
  const ok = got >= need;
  if (!ok) bad++;
  rows.push(
    `${ok ? 'OK  ' : 'BAD '} ${theme.padEnd(10)} ${label.padEnd(34)} ${got.toFixed(2).padStart(6)}:1  (${fg} on ${bg})`,
  );
};

for (const theme of THEME_ORDER) {
  const p = PALETTES[theme] as Record<string, string>;
  const bg = p['--bg'];
  const surface = p['--surface'];

  // The two text tiers, on both grounds they are painted on.
  check(theme, 'text on bg', p['--text'], bg, 7);
  check(theme, 'text on surface', p['--text'], surface, 7);
  check(theme, 'text-muted on bg', p['--text-muted'], bg);
  check(theme, 'text-muted on surface', p['--text-muted'], surface);
  // The faintest tier still has to be readable. Legacy's TEXT3 measured
  // 1.99-2.86:1 and was called "placeholder" — but placeholder text
  // carries meaning and WCAG does not exempt it.
  check(theme, 'text-faint on bg', p['--text-faint'], bg);
  check(theme, 'text-faint on surface', p['--text-faint'], surface);

  // HourPlan draws each block's name, chevron and count in the phase
  // colour, on a 9% tint of that same colour over the surface. That
  // tint is why the pair is not simply "phase on surface".
  for (const phase of ['sleep', 'morning', 'work', 'evening']) {
    const c = p[`--phase-${phase}`];
    check(theme, `phase-${phase} on its own 9% tint`, c, mix(c, surface, 0.09));
  }

  // The selected tab and the running-timer button put text ON the
  // accent. Legacy's lesson: white is right for a deep blue and wrong
  // for cyan or mint, so this must be measured, never assumed.
  check(theme, 'on-accent on accent', p['--on-accent'], p['--accent']);
  // Accent used AS text, which the quarter link and several headings do.
  check(theme, 'accent as text on surface', p['--accent'], surface);
  check(theme, 'success as text on surface', p['--success'], surface);
  check(theme, 'danger as text on surface', p['--danger'], surface);
}

console.log(rows.join('\n'));
console.log(bad ? `\nFAIL (${bad})` : '\npalette checks clean');
process.exit(bad ? 1 : 0);
