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
const BA_STATUS_COLORS = {
  '--ba-go': '#2F9E44',
  '--ba-validate': '#F08C00',
  '--ba-pivot': '#4C6EF5',
  '--ba-nogo': '#E03131',
  '--ba-neutral': '#868E96',
};

// --bdp-* backs BdpPanel.tsx's status/priority chips (IDEA/OPPORTUNITY/
// RESEARCH/PLAN/ACTIVE/HOLD/DONE, HIGH/MEDIUM/LOW). Unlike BA_STATUS_COLORS
// above, legacy actually varies THIS palette — but only by a light/dark
// split, not per-theme: `night = self._mode in ("warroom", "journey")`
// picks _SC_DARK/_PRI_DARK for those two, _SC_LIGHT/_PRI_LIGHT for
// everything else (task_tracker_v3_THEMES.py lines 12537-12548). Applied
// here the same way: warroom/journey get the DARK set, the other 4 get
// LIGHT — no new runtime logic needed, just which constant each theme's
// palette spreads.
const BDP_LIGHT = {
  '--bdp-idea': '#5255EF',
  '--bdp-opportunity': '#117B38',
  '--bdp-research': '#0891B2',
  '--bdp-plan': '#A15904',
  '--bdp-active': '#7C3AED',
  '--bdp-hold': '#78716C',
  '--bdp-done': '#64748B',
  '--bdp-priority-high': '#D02222',
  '--bdp-priority-medium': '#A15904',
  '--bdp-priority-low': '#64748B',
};
const BDP_DARK = {
  '--bdp-idea': '#818CF8',
  '--bdp-opportunity': '#4ADE80',
  '--bdp-research': '#22D3EE',
  '--bdp-plan': '#FBBF24',
  '--bdp-active': '#A78BFA',
  '--bdp-hold': '#A1A1AA',
  '--bdp-done': '#94A3B8',
  '--bdp-priority-high': '#F87171',
  '--bdp-priority-medium': '#FBBF24',
  '--bdp-priority-low': '#94A3B8',
};

// --habit-money/health/relation/mind/success/warning/danger back
// HabitDashboard.tsx — legacy's own `_VB` dict (task_tracker_v3_THEMES.py
// lines 16660-16702), a self-contained mini-palette for this one screen,
// genuinely distinct PER THEME (not a light/dark split like BDP_LIGHT/
// DARK above) and distinct from the app-wide --success/--warning/
// --danger — e.g. warroom's habit "success" is cyan-teal (#00D4AA) while
// its app-wide --success is green; both are legacy-correct for their
// own screen, just not the same value.
const PALETTES: Record<Theme, Record<string, string>> = {
  focus: {
    '--progress-track': '#E8E5E0',
    '--progress-ring': '#1A1A1A',
    ...BA_STATUS_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#185FA5',
    '--habit-health': '#2D6A4F',
    '--habit-relation': '#8B5E1A',
    '--habit-mind': '#5B21B6',
    '--habit-success': '#2D6A4F',
    '--habit-warning': '#92400E',
    '--habit-danger': '#9B2335',
    '--bg': '#F7F6F3',
    '--surface': '#FFFFFF',
    '--surface-2': '#F0EEE9',
    '--text': '#1A1A1A',
    '--text-muted': '#514F4B',
    '--border': '#E8E5E0',
    '--accent': '#2960E6',
    '--danger': '#C41E3A',
    '--warning': '#926200',
    '--success': '#117B38',
    '--accent-2': '#2D5DD4',
    '--accent-light': '#EEF2FF',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#2960E6',
    '--running-bg': '#EEF2FF',
    '--phase-sleep': '#1E3A8A',
    '--phase-morning': '#0D9488',
    '--phase-work': '#D02222',
    '--phase-evening': '#EA8C1B',
    '--goal-yearly': '#2960E6',
    '--goal-monthly': '#6D28D9',
    '--goal-weekly': '#0F766E',
  },
  warroom: {
    '--progress-track': '#1A1A1E',
    '--progress-ring': '#FFFFFF',
    ...BA_STATUS_COLORS,
    ...BDP_DARK,
    '--habit-money': '#58A6FF',
    '--habit-health': '#00D4AA',
    '--habit-relation': '#FFB800',
    '--habit-mind': '#A855F7',
    '--habit-success': '#00D4AA',
    '--habit-warning': '#FFB800',
    '--habit-danger': '#FF4D6D',
    '--bg': '#0C0C0F',
    '--surface': '#141417',
    '--surface-2': '#0F0F13',
    '--text': '#EDEDEF',
    '--text-muted': '#A1A1A9',
    '--border': '#242428',
    '--accent': '#22D3EE',
    '--danger': '#F87171',
    '--warning': '#FBBF24',
    '--success': '#22D3EE',
    '--accent-2': '#06B6D4',
    '--accent-light': '#061820',
    '--on-accent': '#0C0C0F',
    '--header-accent': '#FBBF24',
    '--running-bg': '#051015',
    '--phase-sleep': '#1E40AF',
    '--phase-morning': '#0E7490',
    '--phase-work': '#EF4444',
    '--phase-evening': '#F59E0B',
    '--goal-yearly': '#22D3EE',
    '--goal-monthly': '#FBBF24',
    '--goal-weekly': '#A78BFA',
  },
  energy: {
    '--progress-track': '#EBEBEB',
    '--progress-ring': '#111111',
    ...BA_STATUS_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#185FA5',
    '--habit-health': '#059669',
    '--habit-relation': '#A15904',
    '--habit-mind': '#7C3AED',
    '--habit-success': '#059669',
    '--habit-warning': '#A15904',
    '--habit-danger': '#D02222',
    '--bg': '#FAFAF8',
    '--surface': '#FFFFFF',
    '--surface-2': '#F5F5F3',
    '--text': '#111111',
    '--text-muted': '#535353',
    '--border': '#EBEBEB',
    '--accent': '#D02222',
    '--danger': '#D02222',
    '--warning': '#A15904',
    '--success': '#117B38',
    '--accent-2': '#B91C1C',
    '--accent-light': '#FEE2E2',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#D02222',
    '--running-bg': '#FEE2E2',
    '--phase-sleep': '#1E3A8A',
    '--phase-morning': '#0F766E',
    '--phase-work': '#D02222',
    '--phase-evening': '#EA580C',
    '--goal-yearly': '#D02222',
    '--goal-monthly': '#A15904',
    '--goal-weekly': '#117B38',
  },
  // EXECUTIVE — legacy's "corporate" key. Warm ivory, deep amber accent,
  // inspired by Notion/FT (task_tracker_v3_THEMES.py lines 830-864).
  // Every token here is legacy's exact hex.
  corporate: {
    '--progress-track': '#E7E2DB',
    '--progress-ring': '#1C1917',
    ...BA_STATUS_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#0C4A6E',
    '--habit-health': '#059669',
    '--habit-relation': '#AE5009',
    '--habit-mind': '#7C3AED',
    '--habit-success': '#059669',
    '--habit-warning': '#A15904',
    '--habit-danger': '#D02222',
    '--bg': '#FAF8F5',
    '--surface': '#FFFFFF',
    '--surface-2': '#F5F1EC',
    '--text': '#1C1917',
    '--text-muted': '#55504D',
    '--border': '#E7E2DB',
    '--accent': '#AE5009',
    '--danger': '#D02222',
    '--warning': '#A15904',
    '--success': '#0C4A6E',
    '--accent-2': '#92400E',
    '--accent-light': '#FEF3C7',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#AE5009',
    '--running-bg': '#FFFBEB',
    '--phase-sleep': '#1E3A8A',
    '--phase-morning': '#0D9488',
    '--phase-work': '#C0392B',
    '--phase-evening': '#C96A15',
    '--goal-yearly': '#AE5009',
    '--goal-monthly': '#1D4ED8',
    '--goal-weekly': '#117B38',
  },
  journey: {
    '--progress-track': '#17211D',
    '--progress-ring': '#FFFFFF',
    ...BA_STATUS_COLORS,
    ...BDP_DARK,
    '--habit-money': '#4CE0A0',
    '--habit-health': '#38B384',
    '--habit-relation': '#F5C451',
    '--habit-mind': '#7C9EF5',
    '--habit-success': '#4CE0A0',
    '--habit-warning': '#F5C451',
    '--habit-danger': '#F0776B',
    '--bg': '#0D1110',
    '--surface': '#161B19',
    '--surface-2': '#121715',
    '--text': '#FFFFFF',
    '--text-muted': '#9FC2AE',
    '--border': '#2A3731',
    '--accent': '#4CE0A0',
    '--danger': '#F0776B',
    '--warning': '#F5C451',
    '--success': '#4CE0A0',
    '--accent-2': '#38B384',
    '--accent-light': '#17211D',
    '--on-accent': '#0D1110',
    '--header-accent': '#4CE0A0',
    '--running-bg': '#17211D',
    '--phase-sleep': '#3B82F6',
    '--phase-morning': '#2DD4BF',
    '--phase-work': '#F87171',
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
    '--progress-track': '#E5E7EB',
    '--progress-ring': '#111827',
    ...BA_STATUS_COLORS,
    ...BDP_LIGHT,
    '--habit-money': '#0C4A6E',
    '--habit-health': '#059669',
    '--habit-relation': '#AE5009',
    '--habit-mind': '#5255EF',
    '--habit-success': '#059669',
    '--habit-warning': '#A15904',
    '--habit-danger': '#D02222',
    '--bg': '#FFFFFF',
    '--surface': '#FFFFFF',
    '--surface-2': '#FFFFFF',
    '--text': '#111827',
    '--text-muted': '#545964',
    '--border': '#E5E7EB',
    '--accent': '#5255EF',
    '--danger': '#D02222',
    '--warning': '#A15904',
    '--success': '#117B38',
    '--accent-2': '#4F46E5',
    '--accent-light': '#EEF2FF',
    '--on-accent': '#FFFFFF',
    '--header-accent': '#5255EF',
    '--running-bg': '#EEF2FF',
    '--phase-sleep': '#312E81',
    '--phase-morning': '#0D9488',
    '--phase-work': '#D02222',
    '--phase-evening': '#A15904',
    '--goal-yearly': '#5255EF',
    '--goal-monthly': '#BE185D',
    '--goal-weekly': '#0F766E',
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

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const palette = PALETTES[theme] ?? PALETTES.focus;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', theme);
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
