import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { useStore, type Slot } from '../store.js';
import type { PaneStatus } from '../theme.js';

const SLOTS: Slot[] = [1, 2, 3, 4];

function cellFor(status: PaneStatus): { ch: string; color: string } {
  switch (status) {
    case 'ENGAGED':
    case 'STREAMING':
      return { ch: '█', color: color.primary };
    case 'FAULT':
      return { ch: '▓', color: color.amber };
    case 'MONITOR':
      return { ch: '▒', color: color.amber };
    case 'STANDBY':
    case 'IDLE':
    case 'DONE':
      return { ch: '▁', color: color.accentDim };
    case 'OFFLINE':
    default:
      return { ch: '·', color: color.faint };
  }
}

interface Props {
  width: number;
}

export function TimelineStrip({ width }: Props) {
  const history = useStore((s) => s.history);
  const panes = useStore((s) => s.panes);
  // label column ~12 chars
  const labelW = 12;
  const stripW = Math.max(8, width - labelW - 2);

  return (
    <Box flexDirection="column">
      {SLOTS.map((slot) => {
        const samples = history[slot].slice(-stripW);
        const pane = panes.find((p) => p.slot === slot);
        const label = pane ? `[${slot}] ${pane.label}` : `[${slot}]`;
        const labelColor =
          pane?.status === 'ENGAGED' || pane?.status === 'STREAMING'
            ? color.primary
            : pane?.status === 'OFFLINE'
              ? color.inactive
              : pane?.status === 'FAULT'
                ? color.amber
                : color.accent;
        // Pad samples on the left so most-recent is on the right
        const pad = stripW - samples.length;
        return (
          <Box key={slot}>
            <Box width={labelW}>
              <Text color={labelColor}>{label.padEnd(labelW)}</Text>
            </Box>
            <Box>
              <Text color={color.faint}>{'·'.repeat(Math.max(0, pad))}</Text>
              {samples.map((s, i) => {
                const c = cellFor(s);
                return (
                  <Text key={i} color={c.color}>
                    {c.ch}
                  </Text>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
