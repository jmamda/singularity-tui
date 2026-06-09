import { color } from '../theme.js';

const PULSE_STEPS = [color.primary, '#e02020', '#b00000', '#7a0000', '#b00000', '#e02020'];
export function pulseColor(frame: number): string {
  return PULSE_STEPS[frame % PULSE_STEPS.length]!;
}

const SHIMMER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export function shimmerGlyph(frame: number): string {
  return SHIMMER_FRAMES[frame % SHIMMER_FRAMES.length]!;
}

const GLITCH_CHARS = ['▀', '▄', '█', '▒', '▓', '░', '╳', '╱', '╲'];
export function glitchLine(frame: number, width: number): string {
  let out = '';
  for (let i = 0; i < width; i++) {
    const seed = (frame * 31 + i * 17) % 100;
    out += seed < 50 ? GLITCH_CHARS[(frame + i) % GLITCH_CHARS.length] : ' ';
  }
  return out;
}

const BOOT_LINES = [
  '> CHECK PWR ............ OK',
  '> LINK ADAPTERS ........ OK',
  '> SCAN ROSTER .......... OK',
  '> ARM DISPATCH GRID .... OK',
  '> CALIBRATE ECG ........ OK',
  '> ARM CONSOLE .......... OK',
  '> CODE RED ............. ENGAGED',
];

const BOOT_PER_LINE = 250;
const BOOT_CHAR_DELAY = 8;

export function bootLineAt(elapsedMs: number, lineIdx: number): string {
  const start = lineIdx * BOOT_PER_LINE;
  if (elapsedMs < start) return '';
  const line = BOOT_LINES[lineIdx] ?? '';
  const charsShown = Math.min(line.length, Math.floor((elapsedMs - start) / BOOT_CHAR_DELAY));
  return line.slice(0, charsShown);
}

export const BOOT_TOTAL_MS = BOOT_LINES.length * BOOT_PER_LINE + 500;
export const BOOT_LINE_COUNT = BOOT_LINES.length;
