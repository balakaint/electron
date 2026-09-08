/**
 * The spacing scale. Six values, and nothing else.
 *
 * WHY THIS FILE EXISTS. Before it, the panels used 1, 2, 3, 4, 5, 6, 7,
 * 8, 10, 12, 14, 16, 18, 20, 22, 24, 28 and 30 as paddings, margins and
 * gaps — eighteen values, most of them chosen once, in one component, to
 * make one row look right. Nothing was individually wrong and the whole
 * was visibly homemade: two cards sitting side by side with 10px and
 * 12px of inner padding do not read as "slightly different", they read
 * as "nobody decided".
 *
 * A scale is not about the numbers. It is that every gap in the app is
 * an answer to the same question with the same six answers available, so
 * things line up without anyone aligning them.
 *
 * 4 is the unit. Everything is a multiple, and the steps get further
 * apart as they grow, because the eye judges spacing in ratios: 4 to 8
 * is a real difference, 20 to 24 is not.
 *
 *   HAIR (2)  the one sub-scale value. A 24px control cannot carry a
 *             4px inset AND its glyph; this is for insets inside a
 *             control, never for the space BETWEEN things.
 *   XS (4)    inside a row — icon to label, chip to chip
 *   SM (8)    between rows, and a card's tightest padding
 *   MD (12)   a card's normal padding; between a heading and its content
 *   LG (16)   between cards
 *   XL (24)   between sections of a screen
 *   XXL (32)  around a screen's own edge
 *
 * tests/spacing-check.mjs fails the build on anything else, which is
 * what stops this from being a one-afternoon tidy-up that drifts back.
 */
export const SPACE = {
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const SPACE_VALUES: number[] = [0, 2, 4, 8, 12, 16, 24, 32];
