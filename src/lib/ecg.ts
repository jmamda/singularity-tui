import type { PaneStatus } from '../theme.js';

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export function blockChar(level: number): string {
  const i = Math.max(0, Math.min(7, Math.round(level)));
  return BLOCKS[i]!;
}

/** Pseudo-random based on a counter — stable per-frame, varies frame-to-frame. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Advance an ECG-style activity buffer one tick.
 * Higher activity for ENGAGED/STREAMING (occasional spikes), low decay for idle states.
 */
export function advanceEcg(
  buffer: number[],
  width: number,
  status: PaneStatus,
  frame: number,
): number[] {
  // Ensure correct size
  const buf = buffer.length === width
    ? buffer.slice()
    : Array.from({ length: width }, (_, i) => buffer[buffer.length - width + i] ?? 0);

  buf.shift();

  let next = 0;
  switch (status) {
    case 'ENGAGED':
    case 'STREAMING': {
      // Sharp pulse pattern — periodic spike
      const beat = frame % 6;
      if (beat === 0) next = 7;
      else if (beat === 1) next = 5;
      else if (beat === 2) next = 2;
      else next = Math.floor(noise(frame) * 2);
      break;
    }
    case 'MONITOR': {
      // Slow rolling wave
      next = 2 + Math.floor(Math.sin(frame / 3) * 1.5 + 1.5);
      break;
    }
    case 'FAULT': {
      // Erratic
      next = Math.floor(noise(frame * 7) * 7);
      break;
    }
    case 'OFFLINE': {
      next = 0;
      break;
    }
    case 'IDLE':
    case 'STANDBY':
    case 'DONE':
    default: {
      // Faint heartbeat every ~10 frames
      next = frame % 18 === 0 ? 1 : 0;
      break;
    }
  }

  buf.push(next);
  return buf;
}

export function renderEcg(buffer: number[]): string {
  return buffer.map(blockChar).join('');
}

export function emptyEcg(width: number): number[] {
  return Array.from({ length: width }, () => 0);
}
