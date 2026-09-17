/**
 * The type scale. Six sizes, three weights, two tracking values —
 * measured from what PLAN and EXECUTE (this app's two busiest screens,
 * tests/hierarchy-audit.mjs's own SCREENS list) actually render, not
 * invented.
 *
 * A clean run of that audit (onboarded=true — a fresh, unonboarded
 * database renders OnboardingModal as an OVERLAY on top of the real
 * screen rather than instead of it, and the first baseline run measured
 * both DOMs at once, misreporting 7 sizes/14 colours/a phantom 40px and
 * two axe-core violations that turned out to belong to the onboarding
 * modal, not PLAN/EXECUTE) found:
 *
 *   sizes    12×314  13×59  16×26  14×19  24×4  30×3  20×2  40×1
 *   weights  700×87  600×39  400×16  'bold'×12  'normal'×12  450×2
 *
 * 12/13/14/16 alone are 97.7% of every sized element in the app — the
 * "hero" sizes (20/24/30/40) are each a single component having its own
 * moment (a streak count, a screen's one heading, a running clock, one
 * onboarding icon), never two of them compared side by side, which is
 * the actual argument for a small scale (RADIUS's own: "two cards on one
 * screen do not read as a considered difference"). 20 and 40 each had
 * exactly one or two uses and folded into their nearest hero neighbour
 * (24, 30) rather than earning a seventh and eighth step.
 *
 *   XS (12)    chrome: badges, meta, timestamps, day counts — the
 *              single largest tier in the app by a wide margin
 *   SM (13)    the default reading size for everything else
 *   BASE (14)  a row stepping up once to say "this is what you are
 *              scanning for" — a task's own name, a subtask's name
 *   MD (16)    a number meant to be read at a glance, not read word by
 *              word: a stat, a count, a bigger label
 *   LG (24)    a screen's one h1; a few large glyphs beside it; folded
 *              in ClockCard's streak count (was 20 — a single use, never
 *              beside another heading to be "a considered difference"
 *              from)
 *   XL (30)    the running clock digits; empty-state glyphs; folded in
 *              OnboardingModal's one hero icon (was 40, likewise a
 *              single use)
 *
 * fontWeight's 450 and the 'bold'/'normal' STRINGS were the same failure
 * spacing.ts's own history warns about, just quieter: two spellings each
 * (700 === 'bold', 400 === 'normal' per the CSS spec) that dodge a check
 * looking only for a leading digit, plus a lone 450 inside a ternary
 * (TaskList.tsx: `t.strike && !t.done ? 600 : 450`) that was never
 * actually intermediate to anything — it is 400 with a stray 50 nobody
 * would notice. All three collapse to whichever of the three real steps
 * they were reaching for.
 *
 *   NORMAL (400)  body text
 *   MEDIUM (600)  a label carrying real emphasis
 *   BOLD (700)    the one number or heading a card exists to show
 *
 * TRACKING is letter-spacing, and only ever shows up on an uppercase
 * label: LABEL (0.5) is the app's one answer for "a chip's tiny
 * caption"; WIDE (1) is for the rare label meant to read as a badge
 * rather than a caption (MorningRitualFlow's status words).
 *
 * tests/typography-check.mjs fails the build on anything else — reading
 * ternary branches and quoted 'bold'/'normal' too, which is exactly what
 * let 450 and the string weights hide from the version of this check
 * that lived in spacing.ts before this file existed.
 */
export const TYPE_SIZE = {
  xs: 12,
  sm: 13,
  base: 14,
  md: 16,
  lg: 24,
  xl: 30,
} as const;

export const TYPE_SIZE_VALUES: number[] = [12, 13, 14, 16, 24, 30];

export const TYPE_WEIGHT = {
  normal: 400,
  medium: 600,
  bold: 700,
} as const;

export const TYPE_WEIGHT_VALUES: number[] = [400, 600, 700];

export const TRACKING = {
  label: 0.5,
  wide: 1,
} as const;

export const TRACKING_VALUES: number[] = [0.5, 1];
