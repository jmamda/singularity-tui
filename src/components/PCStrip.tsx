import React from 'react';
import { Box, Text } from 'ink';
import { color, status as statusMap, glyph } from '../theme.js';
import { useStore } from '../store.js';
import { useTick } from '../lib/useTick.js';
import { pulseColor, shimmerGlyph } from '../lib/effects.js';
import { fmtCapability } from '../lib/capabilities.js';

interface Props {
  width: number;
}

export function PCStrip({ width }: Props) {
  const panes = useStore((s) => s.panes);
  const targetSlots = useStore((s) => s.targetSlots);
  const caps = useStore((s) => s.capabilities);
  const trust = useStore((s) => s.trust);
  const tick = useTick(8);

  const pc = panes.find((p) => p.slot === 5);
  if (!pc) return null;

  const targeted = targetSlots.includes(5);
  const isEngaged = pc.status === 'ENGAGED' || pc.status === 'STREAMING';
  const isFault = pc.status === 'FAULT';
  const s = statusMap[pc.status];

  const borderColor = targeted
    ? pulseColor(tick)
    : isEngaged
      ? color.primary
      : isFault
        ? color.amber
        : color.accentDim;

  const headerGlyph = targeted ? '▶' : isEngaged ? shimmerGlyph(tick) : isFault ? glyph.fault : glyph.bullet;

  // Last ~width-50 chars of output, on one line
  const tail = pc.output.join('').split('\n').slice(-1)[0] ?? '';
  const truncated = tail.length > Math.max(20, width - 60) ? '…' + tail.slice(-(width - 60)) : tail;

  const pcCaps = caps.filter((c) => c.slot === 5);
  const capStr = pcCaps.length === 0 ? 'no caps · ungranted' : pcCaps.map(fmtCapability).join(' ');
  const trustVal = trust[5] ?? 0.5;
  const trustColor = trustVal >= 0.7 ? color.accent : trustVal >= 0.4 ? color.amber : color.primary;

  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1} width={width}>
      <Text color={borderColor} bold={targeted}>
        {headerGlyph} [5] PC{'  '}
      </Text>
      <Text color={s.color}>{s.label.padEnd(8)}</Text>
      <Text color={trustColor}>{' '}t{Math.round(trustVal * 100)}%{'  '}</Text>
      <Text color={color.inactive} wrap="truncate-end">
        {pcCaps.length === 0 ? capStr : capStr}{tail ? '  ·  ' : ''}
      </Text>
      <Text color={color.text} wrap="truncate-end">
        {truncated}
      </Text>
    </Box>
  );
}
