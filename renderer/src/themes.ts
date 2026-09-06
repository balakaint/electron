export type Theme = 'focus' | 'warroom' | 'energy' | 'journey';

export const THEME_ORDER: Theme[] = ['focus', 'warroom', 'energy', 'journey'];

export const THEME_LABELS: Record<Theme, string> = {
  focus: 'Focus',
  warroom: 'War Room',
  energy: 'Energy',
  journey: 'Journey',
};

// A reasonable subset of the legacy app's 6 named themes, translated to
// CSS custom properties applied at the document root — matches the
// spirit (dark focus theme, warm/aggressive war-room, bright energy,
// calm teal journey) without porting every exact swatch.
const PALETTES: Record<Theme, Record<string, string>> = {
  focus: {
    '--bg': '#0f1115',
    '--surface': '#171a21',
    '--surface-2': '#1d212b',
    '--text': '#e8e8ea',
    '--text-muted': '#9aa0ab',
    '--border': '#2a2e37',
    '--accent': '#4f8cff',
  },
  warroom: {
    '--bg': '#1a0e0e',
    '--surface': '#241414',
    '--surface-2': '#2c1717',
    '--text': '#f0e4e4',
    '--text-muted': '#b89a9a',
    '--border': '#3a2020',
    '--accent': '#c0392b',
  },
  energy: {
    '--bg': '#fff8ec',
    '--surface': '#ffffff',
    '--surface-2': '#fff1d6',
    '--text': '#2b2110',
    '--text-muted': '#8a7b5c',
    '--border': '#eddcb5',
    '--accent': '#e08a1e',
  },
  journey: {
    '--bg': '#0b1a1a',
    '--surface': '#122626',
    '--surface-2': '#163030',
    '--text': '#dff5f0',
    '--text-muted': '#8fb8b2',
    '--border': '#1e3a3a',
    '--accent': '#2fb8a6',
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
