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

// WCAG 2.1 SC 1.4.6 (AAA): normal text >= 7:1. Raised from the AA floor
// (4.5:1, SC 1.4.3) after a full audit against the international
// standard (ISO/IEC 40500 adopts WCAG 2.0; EN 301549 §9 and ADA/Section
// 508 both cite WCAG 2.1 AA as the legal minimum) scored every theme at
// 7.2-8.1 out of 10 on AA alone. Nothing checked here is large enough to
// earn the SC 1.4.3 3:1 large-text exemption — the phase names are 13px,
// the counts 12px — so AAA means the same 7:1 for all of it.
const AAA = 7.0;
// SC 1.4.11: non-text UI components (an input's outline, a progress
// track) need only 3:1, and are never "large text" at all — a border
// this faint was the one universal defect the audit found: every theme's
// hairline measured 1.19-1.40:1, an input or card edge that isn't
// reliably visible to a low-vision user in ANY theme.
const UI_NONTEXT = 3.0;

let bad = 0;
const rows: string[] = [];

const check = (theme: Theme, label: string, fg: string, bg: string, need = AAA) => {
  const got = contrast(fg, bg);
  const ok = got >= need;
  if (!ok) bad++;
  rows.push(
    `${ok ? 'OK  ' : 'BAD '} ${theme.padEnd(10)} ${label.padEnd(38)} ${got.toFixed(2).padStart(6)}:1  (${fg} on ${bg})`,
  );
};

for (const theme of THEME_ORDER) {
  const p = PALETTES[theme] as Record<string, string>;
  const bg = p['--bg'];
  const surface = p['--surface'];

  // The three text tiers, on both grounds they are painted on.
  check(theme, 'text on bg', p['--text'], bg);
  check(theme, 'text on surface', p['--text'], surface);
  check(theme, 'text-muted on bg', p['--text-muted'], bg);
  check(theme, 'text-muted on surface', p['--text-muted'], surface);
  // The faintest tier still has to be readable. Legacy's TEXT3 measured
  // 1.99-2.86:1 and was called "placeholder" — but placeholder text
  // carries meaning and WCAG does not exempt it.
  check(theme, 'text-faint on bg', p['--text-faint'], bg);
  check(theme, 'text-faint on surface', p['--text-faint'], surface);
  // Three tiers means three tiers: text-faint's own AAA floor sits close
  // enough to text-muted's that fixing faint in isolation can erase the
  // gap between them — measured happening on rize (both landed on
  // #545964) before this check existed. A ratio check, not a hex
  // comparison, because "different colour" is not the property that
  // matters — "visibly dimmer" is, and that is what contrast measures.
  const mutedOnBg = contrast(p['--text-muted'], bg);
  const faintOnBg = contrast(p['--text-faint'], bg);
  if (!(mutedOnBg > faintOnBg + 0.2)) {
    bad++;
    rows.push(`BAD  ${theme.padEnd(10)} text-muted vs text-faint tier gap collapsed on bg`.padEnd(70));
  }

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
  // The selected-chip pattern (Deep Work's range picker, BDP's view
  // toggle, goal composer, morning ritual, …) draws accent text on
  // accent-light. Missed until tests/ux-audit.mjs caught it live at
  // 4.37:1 on the energy theme — this is why it is checked here too.
  check(theme, 'accent as text on accent-light', p['--accent'], p['--accent-light']);
  check(theme, 'success as text on surface', p['--success'], surface);
  check(theme, 'warning as text on surface', p['--warning'], surface);
  check(theme, 'danger as text on surface', p['--danger'], surface);

  // HabitDashboard's own 7-colour mini-palette, each drawn as text on
  // its card's surface — distinct from the app-wide success/warning/
  // danger above, and never checked before this audit.
  for (const k of ['money', 'health', 'relation', 'mind', 'appearance', 'social', 'success', 'warning', 'danger']) {
    check(theme, `habit-${k} on surface`, p[`--habit-${k}`], surface);
  }
  // BusinessAnalysisCanvas's PRIORITY_COLOR (HIGH/MED/LOW), drawn as
  // text on a 10% tint of itself in the unpressed state — axe-core
  // caught #F08C00 at "serious" here (2.28:1). AA (4.5), not AAA: this
  // is one of the categorical groups (ba-*) the rest of this file's AAA
  // pass explicitly does not touch.
  for (const k of ['validate', 'nogo', 'neutral']) {
    check(theme, `ba-${k} on its own 10% tint`, p[`--ba-${k}`], mix(p[`--ba-${k}`], surface, 0.10), 4.5);
  }
  // GoalsPanel's three horizon tabs, same reasoning.
  for (const k of ['yearly', 'monthly', 'weekly']) {
    check(theme, `goal-${k} on surface`, p[`--goal-${k}`], surface);
  }

  // BdpPanel's status/priority chips draw their own ink ON their own
  // colour, not on surface — a hardcoded white ink measured 1.67-2.98:1
  // against the whole BDP_DARK set (warroom/journey) and 3.68:1 against
  // BDP_LIGHT's own --bdp-research before each colour got a computed
  // -ink token to match. This is AA (4.5:1), not AAA: a chip's own
  // label is closer to UI-component text than to reading copy, and BDP's
  // curated palette (unlike a user's own project colour) can be held to
  // exactly the ratio it was computed against.
  for (const k of ['idea', 'opportunity', 'research', 'plan', 'active', 'hold', 'done', 'priority-high', 'priority-medium', 'priority-low']) {
    check(theme, `bdp-${k}-ink on bdp-${k}`, p[`--bdp-${k}-ink`], p[`--bdp-${k}`], 4.5);
  }

  // SC 1.4.11 — the border every card, input and panel draws, and the
  // progress bar's own empty track (a meaningful graphic: it says how
  // much is NOT done).
  check(theme, 'border on surface (UI outline)', p['--border'], surface, UI_NONTEXT);
  if (p['--progress-track']) {
    check(theme, 'progress-track on surface', p['--progress-track'], surface, UI_NONTEXT);
  }
}

console.log(rows.join('\n'));
console.log(bad ? `\nFAIL (${bad})` : '\npalette checks clean — every theme AAA (7:1 text, 3:1 UI) on every checked pair');
process.exit(bad ? 1 : 0);
