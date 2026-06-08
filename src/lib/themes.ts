/**
 * Theme system — multiple built-in palettes, switchable at runtime.
 *
 * NO_COLOR is honored independently and always wins (collapses any theme to
 * monochrome). Custom themes can be loaded from ~/.singularity/themes/<name>.json.
 */

export interface Palette {
  bg: string;
  primary: string;
  primaryDim: string;
  accent: string;
  accentDim: string;
  amber: string;
  white: string;
  text: string;
  inactive: string;
  faint: string;
}

export const THEMES: Record<string, Palette> = {
  'code-red': {
    bg: '#000000',
    primary: '#ff2a2a',
    primaryDim: '#aa1010',
    accent: '#00ff66',
    accentDim: '#00aa44',
    amber: '#ffb000',
    white: '#ffffff',
    text: '#d0d0d0',
    inactive: '#8a8a8a',
    faint: '#555555',
  },
  tokyonight: {
    bg: '#1a1b26',
    primary: '#f7768e',
    primaryDim: '#a13a4d',
    accent: '#9ece6a',
    accentDim: '#5a8042',
    amber: '#e0af68',
    white: '#c0caf5',
    text: '#a9b1d6',
    inactive: '#787c99',
    faint: '#414868',
  },
  catppuccin: {
    bg: '#1e1e2e',
    primary: '#f38ba8',
    primaryDim: '#a05f73',
    accent: '#a6e3a1',
    accentDim: '#6fa46c',
    amber: '#f9e2af',
    white: '#cdd6f4',
    text: '#bac2de',
    inactive: '#7f849c',
    faint: '#45475a',
  },
  gruvbox: {
    bg: '#282828',
    primary: '#fb4934',
    primaryDim: '#9d0006',
    accent: '#b8bb26',
    accentDim: '#79740e',
    amber: '#fabd2f',
    white: '#ebdbb2',
    text: '#d5c4a1',
    inactive: '#928374',
    faint: '#504945',
  },
  nord: {
    bg: '#2e3440',
    primary: '#bf616a',
    primaryDim: '#7e3e44',
    accent: '#a3be8c',
    accentDim: '#6b815c',
    amber: '#ebcb8b',
    white: '#eceff4',
    text: '#d8dee9',
    inactive: '#7b8294',
    faint: '#4c566a',
  },
  matrix: {
    bg: '#000000',
    primary: '#00ff41',
    primaryDim: '#00b32c',
    accent: '#39ff14',
    accentDim: '#287a0c',
    amber: '#a8ff60',
    white: '#d0ffd0',
    text: '#90ff90',
    inactive: '#5fbf5f',
    faint: '#2a4f2a',
  },
  ayu: {
    bg: '#0a0e14',
    primary: '#ff3333',
    primaryDim: '#a02525',
    accent: '#c2d94c',
    accentDim: '#7a8530',
    amber: '#ffb454',
    white: '#b3b1ad',
    text: '#a0a8b0',
    inactive: '#5c6773',
    faint: '#3e4451',
  },
  mono: {
    bg: '#000000',
    primary: '#ffffff',
    primaryDim: '#bbbbbb',
    accent: '#ffffff',
    accentDim: '#bbbbbb',
    amber: '#ffffff',
    white: '#ffffff',
    text: '#dddddd',
    inactive: '#999999',
    faint: '#666666',
  },
};

export const THEME_NAMES: string[] = Object.keys(THEMES);

const NO_COLOR = Boolean(process.env.NO_COLOR);

let active: Palette = NO_COLOR ? THEMES.mono! : (THEMES['code-red'] ?? THEMES.mono!);

export function setTheme(name: string): boolean {
  const t = THEMES[name];
  if (!t) return false;
  // Mutate active in place so consumers holding a reference also see it.
  Object.assign(active, NO_COLOR ? THEMES.mono! : t);
  return true;
}

export function currentTheme(): Palette {
  return active;
}

export function listThemes(): string[] {
  return THEME_NAMES.slice();
}
