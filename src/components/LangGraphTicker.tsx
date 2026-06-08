import React from 'react';
import { Box, Text } from 'ink';
import { color, glyph } from '../theme.js';
import { useStore } from '../store.js';

interface Props {
  width: number;
}

function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function LangGraphTicker({ width }: Props) {
  const snap = useStore((s) => s.langgraph);
  if (!snap) return null;

  const borderColor =
    snap.error ? color.amber : snap.active > 0 ? color.primary : color.accentDim;
  const headerColor = borderColor;

  // Build a compact summary line: most recent 3 rows
  const recent = snap.rows.slice(0, 3);
  const summary = recent
    .map((r) => `${r.id} ${r.name.slice(0, 14)} ${r.status}`)
    .join('  ·  ');

  const status = snap.error
    ? `${glyph.warn} ${snap.error}`
    : `${snap.active} active · ${snap.faults} fault${snap.faults === 1 ? '' : 's'} · ${snap.rows.length} recent · ${ago(snap.fetchedAt)}`;

  return (
    <Box
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      width={width}
    >
      <Text color={headerColor} bold>
        ▣ LANGGRAPH{' '}
      </Text>
      <Text color={color.inactive}>{status}</Text>
      {summary ? (
        <>
          <Text color={color.inactive}>{'  ─  '}</Text>
          <Text color={color.text} wrap="truncate-end">
            {summary}
          </Text>
        </>
      ) : null}
    </Box>
  );
}
