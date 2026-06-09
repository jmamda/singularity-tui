// Honor the NO_COLOR standard (https://no-color.org). When set, collapse the
// whole palette to a monochrome ramp so the TUI stays legible without color.
const NO_COLOR = Boolean(process.env.NO_COLOR);

interface Palette {
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

const COLORED: Palette = {
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
};

const MONO: Palette = {
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
};

// Re-export the active theme's palette from the new theme system. setTheme()
// mutates `color` in place so consumers (Pane, StatusBar, PromptBar, …) all
// see the new palette without prop-drilling. NO_COLOR is honored upstream.
import { currentTheme } from './lib/themes.js';
export const color: Palette = currentTheme();

// status colors read from `color` at render time — re-resolved each render
// thanks to JS getter semantics. We use plain refs so an existing reference
// stays up to date when the theme changes.
export const status = {
  get IDLE() {
    return { label: 'IDLE', color: color.accent };
  },
  get STANDBY() {
    return { label: 'STANDBY', color: color.accent };
  },
  get ENGAGED() {
    return { label: 'ENGAGED', color: color.primary };
  },
  get STREAMING() {
    return { label: 'STREAMING', color: color.primary };
  },
  get MONITOR() {
    return { label: 'MONITOR', color: color.amber };
  },
  get FAULT() {
    return { label: 'FAULT', color: color.amber };
  },
  get OFFLINE() {
    return { label: 'OFFLINE', color: color.inactive };
  },
  get DONE() {
    return { label: 'DONE', color: color.white };
  },
};

export type PaneStatus =
  | 'IDLE'
  | 'STANDBY'
  | 'ENGAGED'
  | 'STREAMING'
  | 'MONITOR'
  | 'FAULT'
  | 'OFFLINE'
  | 'DONE';

export const glyph = {
  active: '◢',
  stream: '▮',
  warn: '⚠',
  fault: '✗',
  pulse: '●',
  awaiting: '░',
  bullet: '▣',
  ok: '✓',
} as const;
