import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { useStore } from '../store.js';

export function Notifications() {
  const items = useStore((s) => s.notifications);
  if (items.length === 0) return null;
  return (
    <Box flexDirection="column" paddingX={1}>
      {items.slice(-3).map((n) => {
        const c =
          n.level === 'error' ? color.amber : n.level === 'warn' ? color.amber : color.accent;
        const lines = n.message.split('\n');
        const head = lines[0] ?? '';
        const rest = lines.slice(1);
        const prefix = n.level === 'error' ? '✗' : n.level === 'warn' ? '⚠' : '·';
        return (
          <Box key={n.id} flexDirection="column">
            <Text>
              <Text color={c}>│ </Text>
              <Text color={c}>
                {prefix} {head}
              </Text>
            </Text>
            {rest.map((line, i) => (
              <Text key={i}>
                <Text color={c}>│ </Text>
                <Text color={c}>{line}</Text>
              </Text>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
