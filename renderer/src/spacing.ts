import type { CSSProperties } from 'react';

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

/**
 * The corner scale. Three values, for the same reason.
 *
 * Counted before this existed: 2, 3, 4, 5, 6, 8, 10, 11, 12 and '50%'
 * across 43 places — ten different corners in one app. Two cards on one
 * screen at 6 and 8 do not read as a considered difference; they read
 * the way 10px and 12px padding read. Worse, the radius was carrying no
 * meaning at all: a modal, a progress track and a chip could each be any
 * of the ten.
 *
 * Now it says WHAT A THING IS, and there are only three kinds:
 *
 *   CONTROL (4)  something you click or type in — buttons, inputs, chips
 *   CARD (8)     a surface that holds other things — cards, panels,
 *                modals, popovers
 *   PILL (999)   a shape whose ends are meant to be round — dots, and
 *                the 4-6px progress tracks, where any fixed radius is
 *                either invisible or a full round anyway
 *
 * The original is Tkinter and has no rounded corners anywhere, so every
 * radius in this port is the port's own invention; that is exactly why
 * it needed a rule rather than a habit.
 *
 * tests/radius-check.mjs fails the build on anything else.
 */
export const RADIUS = {
  control: 4,
  card: 8,
  pill: 999,
} as const;

export const RADIUS_VALUES: number[] = [0, 4, 8, 999];

/**
 * A card's resting border/radius/shadow, spread into any component's
 * own style object — added 2026-09-21 alongside the app's first real
 * shadow tokens (--shadow-sm/md in themes.ts). No <Card> component
 * exists in this app; every screen inlines its own, which is exactly
 * why this is a plain object to spread rather than a component to
 * import — it fits the existing pattern instead of forcing a rewrite.
 * Pair with the `card-elevated` class (styles/index.css) for the
 * hover lift, since inline styles can't express :hover.
 */
export const CARD_ELEVATED: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: RADIUS.card,
  boxShadow: 'var(--shadow-sm)',
};

// Font size, weight and letter-spacing moved to renderer/src/typography.ts
// (TYPE_SIZE / TYPE_WEIGHT / TRACKING) — this file is layout (gaps,
// corners), that one is type. tests/typography-check.mjs enforces it.
