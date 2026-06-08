import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { GRAMMAR } from '../lib/grammar.js';

interface Props {
  cols: number;
  rows: number;
}

const KEYS: Array<[string, string]> = [
  ['1-4', 'toggle target pane'],
  ['Tab', 'cycle single target'],
  ['↑ / ↓', 'prompt history (artifacts: navigate)'],
  ['Enter', 'dispatch / send'],
  ['Esc', 'clear target + draft'],
  ['?', 'toggle this help'],
  ['Ctrl+C', 'quit'],
];

const ARTIFACT_KEYS: Array<[string, string]> = [
  ['j / k', 'navigate artifacts'],
  ['p', 'pin / unpin'],
  ['/', 'filter'],
  ['s / c', 'save / copy'],
  ['>>N', 'dispatch artifact to pane N'],
];

export function HelpOverlay({ cols, rows }: Props) {
  return (
    <Box width={cols} height={rows} alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={color.primary}
        paddingX={2}
        paddingY={1}
      >
        <Text color={color.primary} bold>
          SINGULARITY — KEYS & GRAMMAR
        </Text>
        <Text color={color.inactive}>{'─'.repeat(46)}</Text>

        <Text color={color.accent} bold>
          Operators (first char of the prompt)
        </Text>
        {GRAMMAR.map((g) => (
          <Text key={g.op} color={color.text}>
            <Text color={color.primary}>{g.op.padEnd(10)}</Text>
            <Text color={color.inactive}>{g.description}</Text>
          </Text>
        ))}

        <Text> </Text>
        <Text color={color.accent} bold>
          Keys
        </Text>
        {KEYS.map(([k, v]) => (
          <Text key={k} color={color.text}>
            <Text color={color.primary}>{k.padEnd(10)}</Text>
            <Text color={color.inactive}>{v}</Text>
          </Text>
        ))}

        <Text> </Text>
        <Text color={color.accent} bold>
          Artifact pane (slot 4 targeted)
        </Text>
        {ARTIFACT_KEYS.map(([k, v]) => (
          <Text key={k} color={color.text}>
            <Text color={color.primary}>{k.padEnd(10)}</Text>
            <Text color={color.inactive}>{v}</Text>
          </Text>
        ))}

        <Text color={color.inactive}>{'─'.repeat(46)}</Text>
        <Text color={color.amber}>press ? or Esc to close · /grammar for slash commands</Text>
      </Box>
    </Box>
  );
}
