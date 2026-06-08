import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { useStore } from '../store.js';
import { fuzzyRank } from '../lib/fuzzy.js';
import { listCommands } from '../commands/registry.js';

interface PaletteItem {
  label: string;
  hint: string;
  /** Action on Enter; returns the prompt-bar text to insert (or null to do nothing). */
  invoke: () => string | null;
}

function buildItems(): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const c of listCommands()) {
    items.push({
      label: `/${c.name}`,
      hint: c.summary,
      invoke: () => `/${c.name} `,
    });
  }
  // Common operators
  items.push({ label: '! broadcast', hint: 'race all panes', invoke: () => '!' });
  items.push({ label: '? quorum', hint: 'YES/NO vote across panes', invoke: () => '?' });
  items.push({ label: '@plan', hint: 'planner → workers', invoke: () => '@plan ' });
  return items;
}

interface Props {
  cols: number;
  rows: number;
}

export function CommandPalette({ cols, rows }: Props) {
  const query = useStore((s) => s.paletteQuery);
  const selectedIdx = useStore((s) => s.paletteSelectedIdx);

  const items = React.useMemo(() => buildItems(), []);
  const ranked = fuzzyRank(query, items, (i) => `${i.label} ${i.hint}`).slice(0, 12);
  const sel = Math.min(selectedIdx, Math.max(0, ranked.length - 1));

  return (
    <Box width={cols} height={rows} alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={color.primary}
        paddingX={2}
        paddingY={1}
        width={Math.min(80, cols - 4)}
      >
        <Text color={color.primary} bold>
          ▶ COMMAND PALETTE
        </Text>
        <Box>
          <Text color={color.accent}>
            {'> '}
            <Text color={color.white}>{query || ' '}</Text>
            <Text color={color.primary}>_</Text>
          </Text>
        </Box>
        <Text color={color.inactive}>{'─'.repeat(Math.min(76, cols - 8))}</Text>
        {ranked.length === 0 ? (
          <Text color={color.inactive}>no matches · Esc to close</Text>
        ) : (
          ranked.map((r, i) => {
            const isSel = i === sel;
            return (
              <Text key={r.item.label} color={isSel ? color.white : color.text} bold={isSel}>
                {isSel ? '▶ ' : '  '}
                <Text color={isSel ? color.primary : color.accent}>{r.item.label.padEnd(22)}</Text>
                <Text color={color.inactive}>{r.item.hint}</Text>
              </Text>
            );
          })
        )}
        <Text color={color.inactive}>{'─'.repeat(Math.min(76, cols - 8))}</Text>
        <Text color={color.inactive}>↑/↓ navigate · Enter select · Esc close</Text>
      </Box>
    </Box>
  );
}

/** Look up the action for the currently-selected palette item. */
export function paletteSelectedAction(query: string, selectedIdx: number): string | null {
  const items = buildItems();
  const ranked = fuzzyRank(query, items, (i) => `${i.label} ${i.hint}`).slice(0, 12);
  const sel = ranked[Math.min(selectedIdx, ranked.length - 1)];
  return sel ? sel.item.invoke() : null;
}
