export type Theme = 'focus' | 'warroom' | 'energy' | 'corporate' | 'journey' | 'rize';

// Matches legacy's own THEME_ORDER exactly (task_tracker_v3_THEMES.py
// line 947) — 'corporate' is legacy's internal key for the theme it
// labels "EXECUTIVE" (THEME_LABEL), kept as-is here so a theme value
// round-tripping through AppState/import_legacy.py never needs remapping.
export const THEME_ORDER: Theme[] = ['focus', 'warroom', 'energy', 'corporate', 'journey', 'rize'];

export const THEME_LABELS: Record<Theme, string> = {
  focus: 'Focus',
  warroom: 'War Room',
  energy: 'Energy',
  corporate: 'Executive',
  journey: 'Journey',
  rize: 'Rize',
};

// Every palette is now legacy's own, read straight from its THEMES dict
// (task_tracker_v3_THEMES.py 721-944).
//
// focus/warroom/energy/journey previously carried a "reasonable subset"
// reinterpretation instead, on the reasoning that overwriting four
// already-shipped themes was an unrequested visual change. Comparing the
// two apps side by side showed what that actually cost: legacy's FOCUS
// is a light, warm-paper theme (#F7F6F3 with a slate-blue accent) and
// the port rendered it near-black, so the same theme name produced two
// apps that did not look related. WAR ROOM was worse than a shade off —
// its accent is cyan in legacy and had become red here, which also
// explains why its DONE_GREEN looked wrong enough to be "corrected" in
// an earlier pass. That correction is reverted with this: with the real
// cyan accent back, legacy's cyan done-state is right after all.
//
// The 8 tokens beyond the original 7 (danger/warning/success/accent-2/
// accent-light/on-accent/header-accent/running-bg) are new in this pass.
// danger/warning/success are legacy's own RED/YELLOW/DONE_GREEN, MOSTLY
// verbatim — they're genuinely independent of a theme's own accent in
// focus/energy (DONE_GREEN there is a real universal green, unrelated to
// either theme's own blue/red accent), so importing them exactly is
// safe. warroom is the one exception: legacy's own DONE_GREEN there IS
// accent-derived (warroom's legacy accent is cyan, same as its
// DONE_GREEN), so pasting it verbatim next to the port's red warroom
// accent would show cyan "done" states in a red theme — warroom's
// --success uses the same universal green focus/energy use instead (see
// that key's own comment below). The accent-derived tokens
// (accent-2/accent-light/on-accent/header-accent/
// running-bg) are DERIVED from each theme's own --accent for the
// original 4 (legacy's GREEN2/GREEN_LIGHT would clash — e.g. warroom's
// legacy accent is cyan but the port's is red), and copied verbatim from
// legacy for corporate/rize, consistent with the "exact values" ask for
// those two.
//
// --phase-sleep/morning/work/evening are a separate, CATEGORICAL group —
// not accent-derived at all. DayPhaseBars.tsx needs 4 mutually distinct
// colors regardless of theme (a red "Work" bar must stay visually
// unrelated to whatever the theme's own accent is), and legacy already
// has exactly this: a dedicated _SEG_COLORS dict, one 4-tuple per theme,
// entirely separate from THEMES' GREEN/accent (task_tracker_v3_THEMES.py
// line 1132). Copied verbatim for all 6 themes — these DO vary by theme
// in legacy, just never according to the accent-derivation rule above.
//
// --goal-yearly/monthly/weekly are the same kind of categorical group,
// for GoalsPanel.tsx's three horizon tabs — matches legacy's per-theme
// SECTIONS tuples exactly (task_tracker_v3_THEMES.py lines 751-943,
// e.g. focus: ("yearly", ..., "#2960E6", ...)).
//
// --ba-go/validate/pivot/nogo/neutral back the Business Analysis
// canvas's decision-status (GO/VALIDATE/PIVOT/NO-GO) and next-action
// priority (HIGH/MED/LOW) selectors — legacy hand-picks these ONCE
// (_DECISION_OPTS / the HIGH·MED·LOW tuple, lines 10763-10767 and
// 11019-11020) and reuses them unchanged across every theme, unlike
// every other token above. HIGH reuses NO-GO's red and MED reuses
// VALIDATE's orange in legacy too — not a coincidence introduced here.
// The five section accents on the Business Analysis page, straight from
// legacy (10313-10317) and, like the status colours below, the same on
// every theme. Each names what its section is FOR: what the thing is,
// the opportunity, the money, the judgement, what happens next.
const BA_SECTION_COLORS = {
  '--ba-idea': '#4C6EF5',
  '--ba-upside': '#0CA678',
  '--ba-money': '#F08C00',
  '--ba-decide': '#7048E8',
  '--ba-do': '#2F9E44',
};

// --ba-validate/nogo/neutral back BusinessAnalysisCanvas's PRIORITY_COLOR
// (HIGH/MED/LOW), used BOTH as the pressed button's background (fine at
// full strength) and as TEXT on a 10% tint of itself for the unpressed
// state — axe caught the second use at "serious": #F08C00 as text
// against any point on its own white-to-orange gradient tops out at
// 2.47:1, since the endpoint of that gradient (white) is the ceiling,
// not the 10% mix point specifically. No tint percentage fixes this —
// the colour itself has to carry more contrast.
//
// One darkened value could not fix it everywhere: a value solved
// against a WHITE 10% tint (the 4 light themes) measured 3.1-3.3:1 on
// warroom/journey's dark one, because "10% of the colour mixed into
// the surface" is a different endpoint on a dark surface than on a
// light one — the same light/dark split BDP_LIGHT/BDP_DARK already
// exist for, and for the same underlying reason. --ba-go/--ba-pivot
// stay a single shared value, unused as text anywhere today.
const BA_STATUS_LIGHT = {
  '--ba-go': '#2F9E44',
  '--ba-validate': '#A05D00',
  '--ba-pivot': '#4C6EF5',
  '--ba-nogo': '#D22020',
  '--ba-neutral': '#676F77',
};
const BA_STATUS_DARK = {
  '--ba-go': '#2F9E44',
  '--ba-validate': '#F08C00',
  '--ba-pivot': '#4C6EF5',
  '--ba-nogo': '#E75D5D',
  '--ba-neutral': '#868E96',
};

// --chart-1/2/3 back MorningRitualTrend's combined Energy/Mood/Sleep line
// chart (2026-09-18) — a genuine 3-series categorical palette, which
// --accent/--accent-2 aren't (same hue family in most themes, chosen for
// brand/interactive use, not built to sit side by side as distinct
// series). Slots 1-3 of the dataviz skill's own validated reference
// categorical palette (references/palette.md) — the only three that
// clear the CVD/normal-vision floors under `--pairs all`, which a 3-line
// chart needs. Split light/dark by surface the same way BA_STATUS_LIGHT/
// DARK above are: warroom/journey (dark bg) get the dark steps, the
// other 4 themes get the light steps. Re-validated against this app's
// own surfaces (not the skill's #fcfcfb/#1a1a19 default):
// `node validate_palette.js "#2a78d6,#eb6834,#1baf7a" --mode light --surface "#F7F6F3" --pairs all`
// and the dark equivalent against #0C0C0F — both ALL CHECKS PASS.
const CHART_SERIES_LIGHT = {
  '--chart-1': '#2a78d6',
  '--chart-2': '#eb6834',
  '--chart-3': '#1baf7a',
};
const CHART_SERIES_DARK = {
  '--chart-1': '#3987e5',
  '--chart-2': '#d95926',
  '--chart-3': '#199e70',
};

// --input-color-scheme feeds a bare CSS `color-scheme` declaration on
// every native `<input type="date">` in the app (GoalsPanel's STARTED/
// DEADLINE/composer pickers, MorningRitualFlow's Wake up field). Without
// it the browser always renders the date picker's calendar icon and
// popover in ITS OS-light chrome, regardless of the app's own theme — on
// warroom/journey (dark surface, light text) that icon sat as a stark
// black-on-dark square, the one place on screen that visibly ignored the
// active theme (Zahid, 2026-09-18 screenshot: "unprofessional design").
// `color-scheme` is the standard, zero-JS fix: it tells the browser
// which of its own two built-in palettes to paint native controls with.
const INPUT_SCHEME_LIGHT = { '--input-color-scheme': 'light' };
const INPUT_SCHEME_DARK = { '--input-color-scheme': 'dark' };

// --bdp-* backs BdpPanel.tsx's status/priority chips (IDEA/OPPORTUNITY/
// RESEARCH/PLAN/ACTIVE/HOLD/DONE, HIGH/MEDIUM/LOW). Unlike BA_STATUS_COLORS
// above, legacy actually varies THIS palette — but only by a light/dark
// split, not per-theme: `night = self._mode in ("warroom", "journey")`
// picks _SC_DARK/_PRI_DARK for those two, _SC_LIGHT/_PRI_LIGHT for
// everything else (task_tracker_v3_THEMES.py lines 12537-12548). Applied
// here the same way: warroom/journey get the DARK set, the other 4 get
// LIGHT — no new runtime logic needed, just which constant each theme's
// palette spreads.
// Every -ink entry is inkOn() run once against its own fixed colour
// above (these are the app's two curated chip palettes, not a
// user-customizable colour like a project's accent — a build-time
// computation is exact and never needs a runtime contrastRatio call).
// Found by asking why Chip hardcoded white ink instead of taking it from
// a token like every other chip in the app does: on BDP_DARK, white
// measured 1.67-2.98:1 against all ten colours — every chip in this
// palette (warroom/journey's) was failing WCAG AA, some barely readable
// at all. BDP_LIGHT was one failure short of clean too: white on
// --bdp-research (#0891B2) is 3.68:1, under the 4.5:1 floor.
const BDP_LIGHT = {
  '--bdp-idea': '#5255EF',
  '--bdp-idea-ink': '#FFFFFF',
  '--bdp-opportunity': '#117B38',
  '--bdp-opportunity-ink': '#FFFFFF',
  '--bdp-research': '#0891B2',
  '--bdp-research-ink': '#000000',
  '--bdp-plan': '#A15904',
  '--bdp-plan-ink': '#FFFFFF',
  '--bdp-active': '#7C3AED',
  '--bdp-active-ink': '#FFFFFF',
  '--bdp-hold': '#78716C',
  '--bdp-hold-ink': '#FFFFFF',
  '--bdp-done': '#64748B',
  '--bdp-done-ink': '#FFFFFF',
  '--bdp-priority-high': '#D02222',
  '--bdp-priority-high-ink': '#FFFFFF',
  '--bdp-priority-medium': '#A15904',
  '--bdp-priority-medium-ink': '#FFFFFF',
  '--bdp-priority-low': '#64748B',
  '--bdp-priority-low-ink': '#FFFFFF',
};
const BDP_DARK = {
  '--bdp-idea': '#818CF8',
  '--bdp-idea-ink': '#000000',
  '--bdp-opportunity': '#4ADE80',
  '--bdp-opportunity-ink': '#000000',
  '--bdp-research': '#22D3EE',
  '--bdp-research-ink': '#000000',
  '--bdp-plan': '#FBBF24',
  '--bdp-plan-ink': '#000000',
  '--bdp-active': '#A78BFA',
  '--bdp-active-ink': '#000000',
  '--bdp-hold': '#A1A1AA',
  '--bdp-hold-ink': '#000000',
  '--bdp-done': '#94A3B8',
  '--bdp-done-ink': '#000000',
  '--bdp-priority-high': '#F87171',
  '--bdp-priority-high-ink': '#000000',
  '--bdp-priority-medium': '#FBBF24',
  '--bdp-priority-medium-ink': '#000000',
  '--bdp-priority-low': '#94A3B8',
  '--bdp-priority-low-ink': '#000000',
};

// --habit-money/health/relation/mind/success/warning/danger back
// HabitDashboard.tsx — legacy's own `_VB` dict (task_tracker_v3_THEMES.py
// lines 16660-16702), a self-contained mini-palette for this one screen,
// genuinely distinct PER THEME (not a light/dark split like BDP_LIGHT/
// DARK above) and distinct from the app-wide --success/--warning/
// --danger — e.g. warroom's habit "success" is cyan-teal (#00D4AA) while
// its app-wide --success is green; both are legacy-correct for their
// own screen, just not the same value.
// THREE text tiers, and only three. Measured against BOTH --bg and
// --surface, because text lands on either:
//
//   --text        ~16-19:1   what you read
//   --text-muted   ~7-9:1    labels, captions, counts
//   --text-faint     ~5:1    the faintest thing still legible
//
// The tiers exist so nothing has to reach for `opacity` to look quiet.
// Opacity multiplies contrast down invisibly — an 0.45 on --text put
// "No goals yet" at 2.89:1 — and it is not a decision anyone can review,
// because the number that ends up on screen appears in no source file.
// renderer/src/palette.test.ts fails if any tier drifts below its floor.
export const PALETTES: Record<Theme, Record<string, string>> = {
  focus: {
    '--progress-track': '#A0937F',
    '--progress-ring': '#1A1A1A',
    ...BA_STATUS_LIGHT,
    ...CHART_SERIES_LIGHT,
    ...INPUT_SCHEME_LIGHT,
    ...BA_SECTION_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#175A9D',
    '--habit-health': '#2A634A',
    '--habit-relation': '#785117',
    '--habit-mind': '#5B21B6',
    '--habit-success': '#2A634A',
    '--habit-warning': '#92400E',
    '--habit-danger': '#9B2335',
    '--bg': '#F7F6F3',
    '--surface': '#FFFFFF',
    '--surface-2': '#F0EEE9',
    '--text': '#1A1A1A',
    '--text-muted': '#514F4B',
    '--text-faint': '#555450',
    '--border': '#A0937F',
    '--accent': '#1647BE',
    '--danger': '#AD1B33',
    '--warning': '#795100',
    '--success': '#0E672F',
    '--accent-2': '#2D5DD4',
    '--accent-light': '#EEF2FF',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#2960E6',
    '--running-bg': '#EEF2FF',
    '--phase-sleep': '#1E3A8A',
    '--phase-morning': '#085A53',
    '--phase-work': '#9A1A1A',
    '--phase-evening': '#73450B',
    '--goal-yearly': '#184DCE',
    '--goal-monthly': '#6D28D9',
    '--goal-weekly': '#0D645D',
  },
  warroom: {
    '--progress-track': '#626262',
    '--progress-ring': '#FFFFFF',
    ...BA_STATUS_DARK,
    ...CHART_SERIES_DARK,
    ...INPUT_SCHEME_DARK,
    ...BA_SECTION_COLORS,
    ...BDP_DARK,
    '--habit-money': '#58A6FF',
    '--habit-health': '#00D4AA',
    '--habit-relation': '#FFB800',
    '--habit-mind': '#C186F9',
    '--habit-success': '#00D4AA',
    '--habit-warning': '#FFB800',
    '--habit-danger': '#FF728B',
    '--bg': '#0C0C0F',
    '--surface': '#141417',
    '--surface-2': '#0F0F13',
    '--text': '#EDEDEF',
    '--text-muted': '#AAAAB1',
    '--text-faint': '#9F9FA8',
    '--border': '#61616B',
    '--accent': '#22D3EE',
    '--danger': '#F87979',
    '--warning': '#FBBF24',
    '--success': '#22D3EE',
    '--accent-2': '#06B6D4',
    '--accent-light': '#061820',
    '--on-accent': '#0C0C0F',
    '--header-accent': '#FBBF24',
    '--running-bg': '#051015',
    '--phase-sleep': '#95ABED',
    '--phase-morning': '#16BAE5',
    '--phase-work': '#F68E8E',
    '--phase-evening': '#F59E0B',
    '--goal-yearly': '#22D3EE',
    '--goal-monthly': '#FBBF24',
    '--goal-weekly': '#AA8FFA',
  },
  energy: {
    '--progress-track': '#949494',
    '--progress-ring': '#111111',
    ...BA_STATUS_LIGHT,
    ...CHART_SERIES_LIGHT,
    ...INPUT_SCHEME_LIGHT,
    ...BA_SECTION_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#175A9D',
    '--habit-health': '#036648',
    '--habit-relation': '#864A03',
    '--habit-mind': '#6A1FEA',
    '--habit-success': '#036648',
    '--habit-warning': '#864A03',
    '--habit-danger': '#AE1D1D',
    '--bg': '#FAFAF8',
    '--surface': '#FFFFFF',
    '--surface-2': '#F5F5F3',
    '--text': '#111111',
    '--text-muted': '#535353',
    '--text-faint': '#565656',
    '--border': '#949494',
    '--accent': '#9B1919',
    '--danger': '#AE1D1D',
    '--warning': '#864A03',
    '--success': '#0E672F',
    '--accent-2': '#B91C1C',
    '--accent-light': '#FEE8E8',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#D02222',
    '--running-bg': '#FEE2E2',
    '--phase-sleep': '#1E3A8A',
    '--phase-morning': '#0C5954',
    '--phase-work': '#9A1A1A',
    '--phase-evening': '#8B3407',
    '--goal-yearly': '#AE1D1D',
    // Was '#864A03' — only 33° of hue from --goal-yearly's red (every
    // other theme's yearly/monthly pair sits 40°+ apart), the one
    // horizon-color pair that actually reads as "basically the same
    // dark warm tone" at 12px bold (Zahid's own screenshot, 2026-09-18:
    // WEEKLY GOAL and MONTHLY GOAL headings looked like one color).
    // Pushed toward true gold (hue 42) — as far as it can go while
    // still clearing this file's own AAA-on-surface floor (7.48:1 vs
    // the previous 7.01:1, both checked by palette.test.ts's
    // `goal-monthly on surface` row).
    '--goal-monthly': '#704F00',
    '--goal-weekly': '#0E672F',
  },
  // EXECUTIVE — legacy's "corporate" key. Warm ivory, deep amber accent,
  // inspired by Notion/FT (task_tracker_v3_THEMES.py lines 830-864).
  // Every token here is legacy's exact hex.
  corporate: {
    '--progress-track': '#A59278',
    '--progress-ring': '#1C1917',
    ...BA_STATUS_LIGHT,
    ...CHART_SERIES_LIGHT,
    ...INPUT_SCHEME_LIGHT,
    ...BA_SECTION_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#0C4A6E',
    '--habit-health': '#036648',
    '--habit-relation': '#914207',
    '--habit-mind': '#6A1FEA',
    '--habit-success': '#036648',
    '--habit-warning': '#864A03',
    '--habit-danger': '#AE1D1D',
    '--bg': '#FAF8F5',
    '--surface': '#FFFFFF',
    '--surface-2': '#F5F1EC',
    '--text': '#1C1917',
    '--text-muted': '#55504D',
    '--text-faint': '#5A5451',
    '--border': '#A59278',
    '--accent': '#863D07',
    '--danger': '#AE1D1D',
    '--warning': '#864A03',
    '--success': '#0C4A6E',
    '--accent-2': '#92400E',
    '--accent-light': '#FEF3C7',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#AE5009',
    '--running-bg': '#FFFBEB',
    '--phase-sleep': '#1E3A8A',
    '--phase-morning': '#085A53',
    '--phase-work': '#912B21',
    '--phase-evening': '#7A410D',
    '--goal-yearly': '#914207',
    '--goal-monthly': '#1C4BD1',
    '--goal-weekly': '#0E672F',
  },
  journey: {
    '--progress-track': '#4C6C5F',
    '--progress-ring': '#FFFFFF',
    ...BA_STATUS_DARK,
    ...CHART_SERIES_DARK,
    ...INPUT_SCHEME_DARK,
    ...BA_SECTION_COLORS,
    ...BDP_DARK,
    '--habit-money': '#4CE0A0',
    '--habit-health': '#3AB988',
    '--habit-relation': '#F5C451',
    '--habit-mind': '#82A2F5',
    '--habit-success': '#4CE0A0',
    '--habit-warning': '#F5C451',
    '--habit-danger': '#F2867B',
    '--bg': '#0D1110',
    '--surface': '#161B19',
    '--surface-2': '#121715',
    '--text': '#FFFFFF',
    '--text-muted': '#9FC2AE',
    '--text-faint': '#80AF94',
    '--border': '#516B5F',
    '--accent': '#4CE0A0',
    '--danger': '#F2867B',
    '--warning': '#F5C451',
    '--success': '#4CE0A0',
    '--accent-2': '#38B384',
    '--accent-light': '#17211D',
    '--on-accent': '#0D1110',
    '--header-accent': '#4CE0A0',
    '--running-bg': '#17211D',
    '--phase-sleep': '#88B4F9',
    '--phase-morning': '#2DD4BF',
    '--phase-work': '#FA9696',
    '--phase-evening': '#FBBF24',
    '--goal-yearly': '#4CE0A0',
    '--goal-monthly': '#7DD3FC',
    '--goal-weekly': '#F5C451',
  },
  // RIZE — clean/airy/minimal, soft indigo accent, pure-white surfaces
  // with hairline borders instead of tonal separation
  // (task_tracker_v3_THEMES.py lines 904-943). Every token here is
  // legacy's exact hex; INPUT_BG legacy explicitly kept equal to BG
  // (see that theme's own "_INPUT_BG_WAS" comment — a flat theme defines
  // surfaces by border, not fill), hence --surface-2 === --surface here.
  rize: {
    '--progress-track': '#8D95A7',
    '--progress-ring': '#111827',
    ...BA_STATUS_LIGHT,
    ...CHART_SERIES_LIGHT,
    ...INPUT_SCHEME_LIGHT,
    ...BA_SECTION_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#0C4A6E',
    '--habit-health': '#036648',
    '--habit-relation': '#914207',
    '--habit-mind': '#373AED',
    '--habit-success': '#036648',
    '--habit-warning': '#864A03',
    '--habit-danger': '#AE1D1D',
    '--bg': '#FFFFFF',
    '--surface': '#FFFFFF',
    '--surface-2': '#FFFFFF',
    '--text': '#111827',
    '--text-muted': '#4C505A',
    '--text-faint': '#545964',
    '--border': '#8D95A7',
    '--accent': '#2A2DEB',
    '--danger': '#AE1D1D',
    '--warning': '#864A03',
    '--success': '#0E672F',
    '--accent-2': '#4F46E5',
    '--accent-light': '#EEF2FF',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#5255EF',
    '--running-bg': '#EEF2FF',
    '--phase-sleep': '#312E81',
    '--phase-morning': '#085A53',
    '--phase-work': '#9A1A1A',
    '--phase-evening': '#794203',
    '--goal-yearly': '#373AED',
    '--goal-monthly': '#AC1654',
    '--goal-weekly': '#0D645D',
  },
};

// Legacy's _PB_RAMPS (task_tracker_v3_THEMES.py 1263) — the gradient the
// TODAY PROGRESS bar falls back to when no project has been named yet.
// Eight ordered steps, so this is ramp DATA, not a CSS custom property:
// a var() can hold one color, and interpolating between the steps needs
// all eight at once.
export const PB_RAMPS: Record<Theme, string[]> = {
  focus: ['#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2960E6', '#2D5DD4', '#1E40AF', '#1E3A8A'],
  warroom: ['#A5F3FC', '#67E8F9', '#22D3EE', '#06B6D4', '#0891B2', '#0E7490', '#155E75', '#164E63'],
  energy: ['#FDE047', '#FACC15', '#FB923C', '#F97316', '#EF4444', '#D02222', '#B91C1C', '#991B1B'],
  corporate: ['#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#A15904', '#AE5009', '#92400E', '#78350F'],
  journey: ['#CFF9E4', '#A8F2CE', '#7EEAB8', '#4CE0A0', '#38B384', '#49836A', '#2A3731', '#17211D'],
  rize: ['#C7D2FE', '#A5B4FC', '#818CF8', '#5255EF', '#4F46E5', '#4338CA', '#3730A3', '#312E81'],
};

// applyTheme stamps data-theme on <html>, so any component that needs
// ramp DATA (not a token) can read the live theme without threading it
// through props from App.
export function currentTheme(): Theme {
  // Guarded so the function is callable outside a browser (render tests,
  // any future prerender step) rather than throwing on `document`.
  if (typeof document === 'undefined') return 'focus';
  const t = document.documentElement.getAttribute('data-theme');
  return (THEME_ORDER as string[]).includes(t ?? '') ? (t as Theme) : 'focus';
}

// Is this theme dark? DERIVED from its own background, never a written
// list. A hand-kept list is what made main.ts call FOCUS dark and put a
// black title bar over a near-white window; the fix there was a test
// that reads the palette, and the same fact should not be typed out a
// third time here.
export function isDarkTheme(theme: Theme): boolean {
  const hex = (PALETTES[theme] ?? PALETTES.focus)['--bg'];
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2] < 0.5;
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const palette = PALETTES[theme] ?? PALETTES.focus;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', theme);

  // Tell the browser which way round this theme runs.
  //
  // BUG THIS FIXES, found by tests/ux-audit.mjs at 1.02:1 — text that is
  // not there. Buttons in this app set `color: inherit` (index.css) but
  // no background, so they keep Chromium's DEFAULT button face. That
  // default is #EFEFEF unless the page declares color-scheme, so in WAR
  // ROOM and JOURNEY every unstyled button was near-white #EDEDEF text
  // on a light grey chip. `color: inherit` reads as obviously correct,
  // which is why six themes shipped with invisible buttons.
  //
  // This also fixes the scrollbars and the native form controls, which
  // had the same problem for the same reason.
  root.style.colorScheme = isDarkTheme(theme) ? 'dark' : 'light';
}

export function nextTheme(current: Theme, direction: 1 | -1 = 1): Theme {
  const i = THEME_ORDER.indexOf(current);
  const n = THEME_ORDER.length;
  return THEME_ORDER[(i + direction + n) % n];
}

// Swatch values for the theme-picker preview (SettingsDialog) — matches
// legacy's own picker exactly (BG/CARD_BG/GREEN/TEXT, in that order; see
// task_tracker_v3_THEMES.py lines 15420-15424).
export function themeSwatch(theme: Theme): [string, string, string, string] {
  const p = PALETTES[theme] ?? PALETTES.focus;
  return [p['--bg'], p['--surface'], p['--accent'], p['--text']];
}

// ─── Readable ink ────────────────────────────────────────────────────
//
// THE PROBLEM THIS SOLVES, and why it belongs here and not in the
// components. Every project carries its own accent colour, chosen from
// a GitHub-ish palette that was picked to look right as a FILL. Painted
// as TEXT on a dark theme those same colours are unreadable: the audit
// measured `#0550AE` on WAR ROOM's `#0C0C0F` at 2.57:1 against a 4.5:1
// requirement, and forty-odd findings were that one mistake repeated
// per project, per screen, per theme.
//
// The tempting fix is to pick darker-theme variants of the six accents.
// That is the same mistake with more entries: the accent is a value the
// USER can set per project, so any hand-written table is wrong for the
// seventh colour. The right shape is a function of the colour and the
// surface it lands on, computed at paint time.
//
// Two functions, because there are two situations and they are opposite:
//   inkOn(bg)          text drawn ON a filled accent — pick black or
//                      white, whichever the fill can carry.
//   readableInk(c, bg) the accent drawn AS text on a surface — keep the
//                      hue, move the lightness until it clears the bar.
//
// Non-text uses of an accent — bars, rails, chips, the fill itself —
// are deliberately untouched. WCAG 1.4.3 is about text, and washing out
// a 3px rail to satisfy a rule that does not apply to it would trade a
// real quality for an imaginary one.

function toRgb(color: string): [number, number, number] | null {
  const hex = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return [1, 2, 3].map((i) => parseInt(hex[i] + hex[i], 16)) as [number, number, number];
  }
  const m = hex.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p));
    if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
  }
  return null;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b]
    .map((c) => c / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: string, b: string): number {
  const ra = toRgb(a);
  const rb = toRgb(b);
  if (!ra || !rb) return 21;
  const la = relLuminance(ra);
  const lb = relLuminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white — whichever is readable on this fill. Legacy's _ink. */
export function inkOn(background: string): string {
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#000000', background)
    ? '#FFFFFF'
    : '#000000';
}

/**
 * The same colour, moved far enough in lightness to be readable as text
 * on `surface`. Hue and saturation are preserved, so a project still
 * reads as ITS colour — it is the same blue, lit for the room it is in.
 *
 * Walks in 4% steps away from the surface's own luminance and stops at
 * the first value that clears the bar, so a colour that already passes
 * is returned untouched and one that barely fails moves barely at all.
 */
export function readableInk(color: string, surface: string, target = 4.5): string {
  const rgb = toRgb(color);
  const surf = toRgb(surface);
  if (!rgb || !surf) return color;
  if (contrastRatio(color, surface) >= target) return color;

  const [h, s, l] = rgbToHsl(rgb);
  const towardLight = relLuminance(surf) < 0.5;
  for (let step = 1; step <= 25; step++) {
    const next = towardLight ? Math.min(1, l + step * 0.04) : Math.max(0, l - step * 0.04);
    const candidate = hslToHex(h, s, next);
    if (contrastRatio(candidate, surface) >= target) return candidate;
  }
  // Nothing in this hue clears the bar (a very dark surface and a very
  // dark hue) — fall back to plain readable ink rather than shipping
  // something that fails.
  return inkOn(surface);
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v);
  };
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The colour text should be, for an accent painted on the app's card
 * surface in the CURRENT theme. This is the call sites' entry point:
 * they hold a project's accent and want the readable version of it,
 * and they should not each be looking up which theme is on.
 */
export function accentText(accent: string, on?: string): string {
  const palette = PALETTES[currentTheme()] ?? PALETTES.focus;
  if (on) return readableInk(accent, palette[on] ?? palette['--surface'] ?? '#FFFFFF');

  // BOTH surfaces, not one.
  //
  // This used to resolve against --surface alone, on the assumption that
  // accent text sits on a card. Half of it does not: the project cards
  // draw a border and no background, so their title sits on --bg, and
  // in the light themes --bg is the DARKER of the two. axe-core caught
  // twelve inputs still failing after the "fix" for exactly that
  // reason — the colour cleared the surface it was computed against and
  // the one it was actually painted on was never checked.
  //
  // Which of the two is harsher flips with the theme (a light theme's
  // --bg is darker than its --surface; a dark theme's is lighter), so
  // there is no single right one to pick. Clear both.
  const bg = palette['--bg'] ?? '#FFFFFF';
  const surface = palette['--surface'] ?? bg;
  const first = readableInk(accent, bg);
  return contrastRatio(first, surface) >= 4.5 ? first : readableInk(first, surface);
}
