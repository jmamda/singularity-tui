import React from 'react';
import { Box, Text } from 'ink';
import { color, status as statusMap, glyph } from '../theme.js';
import type { PaneState } from '../store.js';
import { useTick } from '../lib/useTick.js';
import { pulseColor, shimmerGlyph, glitchLine } from '../lib/effects.js';
import { advanceEcg, emptyEcg, renderEcg } from '../lib/ecg.js';
import { confidenceBadge, confidenceColor } from '../lib/confidence.js';
import { fmtCost, fmtAgo, fmtDuration } from '../lib/format.js';

interface Props {
  pane: PaneState;
  targeted: boolean;
  width: number;
  height: number;
  faultSinceMs: number | null;
  metrics?: {
    lastDispatchAt?: number;
    durationMs?: number;
    sessionId?: string;
    costUsd?: number;
    confidence?: number;
  };
  searchPattern?: string | null;
  compact?: boolean;
  scrollOffset?: number;
}

function compileSearch(pattern: string | null | undefined): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

export function Pane({
  pane,
  targeted,
  width,
  height,
  faultSinceMs,
  metrics,
  searchPattern,
  compact = false,
  scrollOffset = 0,
}: Props) {
  const tick = useTick(
    targeted || pane.status === 'ENGAGED' || pane.status === 'STREAMING' || pane.status === 'FAULT'
      ? 10
      : 4,
  );
  const s = statusMap[pane.status];

  const isFault = pane.status === 'FAULT';
  const isEngaged = pane.status === 'ENGAGED' || pane.status === 'STREAMING';
  const isOffline = pane.status === 'OFFLINE';
  const isHealthy = pane.status === 'STANDBY' || pane.status === 'IDLE' || pane.status === 'DONE';

  const inGlitchWindow = isFault && faultSinceMs !== null && Date.now() - faultSinceMs < 1000;

  let borderColor: string;
  if (inGlitchWindow) borderColor = color.amber;
  else if (targeted) borderColor = pulseColor(tick);
  else if (isEngaged) borderColor = color.primary;
  else if (isOffline) borderColor = color.faint;
  else if (isHealthy) borderColor = color.accentDim;
  else borderColor = color.inactive;

  const innerWidth = Math.max(4, width - 2);
  // chrome rows: header(1) + border-top(1) + border-bot(1) [+ ecg(1) + footer(1)]
  const chromeRows = compact ? 3 : 5;
  const innerHeight = Math.max(2, height - chromeRows);
  const lines = pane.output.join('').split('\n');
  // Scroll: 0 = live view (bottom). Positive offset = scrolled back N lines.
  const totalLines = lines.length;
  const sliceEnd = Math.max(innerHeight, totalLines - Math.max(0, scrollOffset));
  const visible = lines.slice(Math.max(0, sliceEnd - innerHeight), sliceEnd);
  const scrolledBack = scrollOffset > 0;

  const ecgRef = React.useRef<number[]>(emptyEcg(innerWidth));
  if (ecgRef.current.length !== innerWidth) ecgRef.current = emptyEcg(innerWidth);
  ecgRef.current = advanceEcg(ecgRef.current, innerWidth, pane.status, tick);
  const ecgStr = renderEcg(ecgRef.current);

  const ecgColor = isFault
    ? color.amber
    : isEngaged
      ? color.primary
      : isOffline
        ? color.faint
        : isHealthy
          ? color.accentDim
          : color.inactive;

  const cornerGlyph = pane.locked
    ? '⛔'
    : targeted
      ? '▶'
      : isEngaged
        ? shimmerGlyph(tick)
        : isFault
          ? glyph.fault
          : isHealthy
            ? glyph.ok
            : glyph.bullet;

  const headerColor = targeted
    ? pulseColor(tick)
    : isEngaged
      ? color.primary
      : isOffline
        ? color.inactive
        : isHealthy
          ? color.accent
          : color.inactive;

  const glitchOverlay = inGlitchWindow ? glitchLine(tick, innerWidth) : null;

  const re = compileSearch(searchPattern ?? null);
  let matchCount = 0;
  const renderedLines = visible.map((line, i) => {
    const isMatch = re ? re.test(line) : false;
    if (isMatch) matchCount++;
    return (
      <Text key={i} color={isMatch ? color.amber : color.text} bold={isMatch} wrap="truncate-end">
        {line || ' '}
      </Text>
    );
  });

  const since = fmtAgo(metrics?.lastDispatchAt);
  const dur = metrics?.durationMs ? fmtDuration(metrics.durationMs) : '—';
  const cost = metrics?.costUsd ? fmtCost(metrics.costUsd) : '—';
  const retries = pane.retries > 0 ? `· retry ${pane.retries}/${pane.maxRetries}` : '';

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={1} justifyContent="space-between">
        <Text color={headerColor} bold={targeted || isEngaged}>
          {cornerGlyph} [{pane.slot}] {pane.label}
          {pane.pendingClarifications.length > 0 ? ' ⚠?' : ''}
        </Text>
        <Box>
          {metrics?.confidence !== undefined ? (
            <Text color={confidenceColor(metrics.confidence, color)}>
              {confidenceBadge(metrics.confidence)} {metrics.confidence.toFixed(2)}
              {'  '}
            </Text>
          ) : null}
          <Text color={s.color} bold={targeted || isFault || isEngaged}>
            {re && matchCount > 0 ? `${matchCount}✦  ` : ''}
            {s.label}
          </Text>
        </Box>
      </Box>
      <Box
        borderStyle="single"
        borderColor={borderColor}
        flexDirection="column"
        paddingX={1}
        height={height - (compact ? 2 : 4)}
        width={width}
      >
        {glitchOverlay ? <Text color={color.amber}>{glitchOverlay}</Text> : null}
        {visible.length === 0 || (visible.length === 1 && !visible[0]) ? (
          <Text color={color.inactive}>
            {glyph.awaiting} awaiting orders {glyph.awaiting}
          </Text>
        ) : (
          renderedLines
        )}
      </Box>
      {compact ? null : (
        <>
          <Box paddingX={1}>
            <Text color={ecgColor}>{ecgStr}</Text>
          </Box>
          <Box paddingX={1} justifyContent="space-between">
            <Text color={color.inactive}>
              last: {since} · dur: {dur} {retries}
              {scrolledBack ? <Text color={color.amber}> · ↑{scrollOffset}</Text> : null}
            </Text>
            <Text color={color.inactive}>cost: {cost}</Text>
          </Box>
        </>
      )}
    </Box>
  );
}
