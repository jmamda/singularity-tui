import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { useStore } from '../store.js';
import { tally } from '../lib/quorum.js';
import { fmtTokens } from '../lib/format.js';

interface Props {
  width: number;
}

function bar(filledFrac: number, w: number): { fill: string; empty: string } {
  const filled = Math.max(0, Math.min(w, Math.round(filledFrac * w)));
  return { fill: '█'.repeat(filled), empty: '░'.repeat(w - filled) };
}

export function RaceBars({ width }: Props) {
  const broadcast = useStore((s) => s.broadcast);
  const panes = useStore((s) => s.panes);
  if (!broadcast) return null;

  const maxTokens = Math.max(1, ...broadcast.progress.map((p) => p.tokens));
  const barW = Math.max(10, width - 56);
  const isQuorum = broadcast.quorum;
  const t = isQuorum
    ? tally(
        broadcast.progress.map((p) => {
          const pn = panes.find((x) => x.slot === p.slot);
          return { vote: p.vote ?? 'ABSTAIN', confidence: pn?.metrics.confidence ?? 1 };
        }),
      )
    : null;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color.primary} paddingX={1}>
      <Box justifyContent="space-between">
        <Text color={color.primary} bold>
          ▶ {isQuorum ? 'QUORUM' : 'BROADCAST'} · "{broadcast.prompt.slice(0, 50)}"
        </Text>
        {t ? (
          <Text
            color={
              t.verdict === 'YES' ? color.accent : t.verdict === 'NO' ? color.amber : color.inactive
            }
            bold
          >
            verdict: {t.verdict} ({t.yes}Y · {t.no}N · {t.abstain}—) w({t.yesWeighted.toFixed(1)}/
            {t.noWeighted.toFixed(1)})
          </Text>
        ) : null}
      </Box>
      {broadcast.progress.map((p) => {
        const pane = panes.find((pn) => pn.slot === p.slot);
        const label = pane ? pane.label : `slot${p.slot}`;
        const frac = p.tokens / maxTokens;
        const { fill, empty } = bar(frac, barW);
        const elapsed = (p.endedAt ?? Date.now()) - p.startedAt;
        const tps = elapsed > 0 ? Math.round((p.tokens / elapsed) * 1000) : 0;
        const cap = p.status === 'DONE' ? '✓' : p.status === 'FAULT' ? '✗' : ' ';
        const c =
          p.status === 'DONE' ? color.accent : p.status === 'FAULT' ? color.amber : color.primary;
        const voteChip = isQuorum
          ? p.vote === 'YES'
            ? ` ${color.accent === '#00ff66' ? 'YES' : 'YES'}`
            : p.vote === 'NO'
              ? ' NO '
              : ' —— '
          : '';
        const voteColor =
          p.vote === 'YES' ? color.accent : p.vote === 'NO' ? color.amber : color.inactive;
        return (
          <Box key={p.slot}>
            <Box width={12}>
              <Text color={c}>
                [{p.slot}] {label.padEnd(8)}
              </Text>
            </Box>
            <Text color={c}>{fill}</Text>
            <Text color={color.faint}>{empty}</Text>
            <Text color={color.inactive}>
              {' '}
              {fmtTokens(p.tokens).padStart(5)} tok · {String(tps).padStart(4)} t/s {cap}
            </Text>
            {isQuorum ? (
              <Text color={voteColor} bold>
                {voteChip}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
