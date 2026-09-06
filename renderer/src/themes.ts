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

// focus/warroom/energy/journey's core 7 tokens (bg/surface/surface-2/
// text/text-muted/border/accent) are a "reasonable subset" reinterpretation
// of legacy's palette, not its exact swatches (see git history) — kept
// as-is rather than overwritten, to avoid an unrequested visual change to
// 4 already-shipped themes. corporate (Executive) and rize are net-new,
// so every one of their tokens is legacy's actual hex value
// (task_tracker_v3_THEMES.py lines 830-943).
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
const PALETTES: Record<Theme, Record<string, string>> = {
  focus: {
    '--bg': '#0f1115',
    '--surface': '#171a21',
    '--surface-2': '#1d212b',
    '--text': '#e8e8ea',
    '--text-muted': '#9aa0ab',
    '--border': '#2a2e37',
    '--accent': '#4f8cff',
    '--danger': '#C41E3A',
    '--warning': '#926200',
    '--success': '#117B38',
    '--accent-2': '#3f74d1',
    '--accent-light': '#16233f',
    '--on-accent': '#ffffff',
    '--header-accent': '#4f8cff',
    '--running-bg': '#16233f',
  },
  warroom: {
    '--bg': '#1a0e0e',
    '--surface': '#241414',
    '--surface-2': '#2c1717',
    '--text': '#f0e4e4',
    '--text-muted': '#b89a9a',
    '--border': '#3a2020',
    '--accent': '#c0392b',
    '--danger': '#F87171',
    '--warning': '#FBBF24',
    // NOT legacy's DONE_GREEN (#22D3EE, cyan) — that value is
    // accent-derived in legacy (warroom's own accent IS cyan there), not
    // an independent status color the way focus/energy's DONE_GREEN is.
    // Since the port's warroom accent is red, copying it verbatim would
    // show cyan "done" states in a red-branded theme. Uses the same
    // universal green focus/energy actually use instead.
    '--success': '#117B38',
    '--accent-2': '#a5301f',
    '--accent-light': '#331512',
    '--on-accent': '#ffffff',
    '--header-accent': '#c0392b',
    '--running-bg': '#331512',
  },
  energy: {
    '--bg': '#fff8ec',
    '--surface': '#ffffff',
    '--surface-2': '#fff1d6',
    '--text': '#2b2110',
    '--text-muted': '#8a7b5c',
    '--border': '#eddcb5',
    '--accent': '#e08a1e',
    '--danger': '#D02222',
    '--warning': '#A15904',
    '--success': '#117B38',
    '--accent-2': '#c07316',
    '--accent-light': '#fbe6c4',
    '--on-accent': '#2b2110',
    '--header-accent': '#e08a1e',
    '--running-bg': '#fbe6c4',
  },
  // EXECUTIVE — legacy's "corporate" key. Warm ivory, deep amber accent,
  // inspired by Notion/FT (task_tracker_v3_THEMES.py lines 830-864).
  // Every token here is legacy's exact hex.
  corporate: {
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
  },
  journey: {
    '--bg': '#0b1a1a',
    '--surface': '#122626',
    '--surface-2': '#163030',
    '--text': '#dff5f0',
    '--text-muted': '#8fb8b2',
    '--border': '#1e3a3a',
    '--accent': '#2fb8a6',
    '--danger': '#F0776B',
    '--warning': '#F5C451',
    '--success': '#4CE0A0',
    '--accent-2': '#26978a',
    '--accent-light': '#12302c',
    '--on-accent': '#ffffff',
    '--header-accent': '#2fb8a6',
    '--running-bg': '#12302c',
  },
  // RIZE — clean/airy/minimal, soft indigo accent, pure-white surfaces
  // with hairline borders instead of tonal separation
  // (task_tracker_v3_THEMES.py lines 904-943). Every token here is
  // legacy's exact hex; INPUT_BG legacy explicitly kept equal to BG
  // (see that theme's own "_INPUT_BG_WAS" comment — a flat theme defines
  // surfaces by border, not fill), hence --surface-2 === --surface here.
  rize: {
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
  },
};

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
