import React from 'react';
import { Box, Text } from 'ink';
import { color } from '../theme.js';
import { useStore } from '../store.js';
import { fmtCost } from '../lib/format.js';

export function PromptBar() {
  const targetSlots = useStore((s) => s.targetSlots);
  const draft = useStore((s) => s.promptDraft);
  const panes = useStore((s) => s.panes);
  const total = useStore((s) => s.totalCostUsd);
  const budget = useStore((s) => s.globalBudgetUsd);
  const notes = useStore((s) => s.sharedNotes);
  const awareness = useStore((s) => s.awareness);
  const autoNotes = useStore((s) => s.autoNotes);
  const clarifyingFor = useStore((s) => s.clarifyingFor);
  const focusMode = useStore((s) => s.focusMode);
  const compactMode = useStore((s) => s.compactMode);
  const broadcasting = draft.startsWith('!');
  const isSlash = draft.startsWith('/');

  // Clarify-mode rendering takes precedence over everything else.
  if (clarifyingFor !== null) {
    const asker = panes.find((p) => p.slot === clarifyingFor);
    const q = asker?.pendingClarifications[0];
    const queued = asker?.pendingClarifications.length ?? 0;
    return (
      <Box
        borderStyle="double"
        borderColor={color.amber}
        flexDirection="column"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Text color={color.amber} bold>
            ⚠ CLARIFY · [{clarifyingFor}] {asker?.label} is asking
            {queued > 1 ? ` (${queued} queued)` : ''}
          </Text>
          <Text color={color.inactive}>[Enter] send answer · [Esc] dismiss</Text>
        </Box>
        <Text color={color.white} wrap="truncate-end">
          Q: {q?.question ?? '(no question)'}
        </Text>
        <Box>
          <Text color={color.white}>
            ▌ {draft}
            <Text color={color.amber}>_</Text>
          </Text>
        </Box>
      </Box>
    );
  }

  const targets = targetSlots
    .map((slot) => panes.find((p) => p.slot === slot))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const targetLabel = broadcasting
    ? 'BROADCAST · all eligible panes'
    : isSlash
      ? 'COMMAND'
      : targets.length > 0
        ? `TARGETS: ${targets.map((t) => `[${t.slot}] ${t.label}`).join(' + ')}`
        : '1-4 target · ! broadcast · ? vote · @plan · /cmd · /grammar';

  const borderColor =
    broadcasting || targets.length > 0
      ? color.primary
      : isSlash
        ? color.accent
        : color.accentDim;

  const headerColor = borderColor;

  const budgetStr = budget !== null
    ? ` · ${fmtCost(total)} / ${fmtCost(budget)}`
    : ` · ${fmtCost(total)}`;
  const ctxStr =
    (awareness === 'roster' ? ' · ros' : '') +
    (autoNotes ? ' · auto' : '') +
    (focusMode ? ' · focus' : '') +
    (compactMode ? ' · compact' : '') +
    (notes.length > 0 ? ` · ${notes.length} note${notes.length === 1 ? '' : 's'}` : '');

  return (
    <Box
      borderStyle="double"
      borderColor={borderColor}
      flexDirection="column"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={headerColor} bold={targets.length > 0 || broadcasting}>
          ▶ {targetLabel}
        </Text>
        <Text color={color.inactive}>
          [1-4] toggle · [!] bcast · [?] vote · [&gt;N] relay · [/] cmd{budgetStr}{ctxStr}
        </Text>
      </Box>
      <Box>
        <Text color={targets.length > 0 || broadcasting || isSlash ? color.white : color.inactive}>
          ▌ {draft || (targets.length > 0 ? '' : 'type a prompt — pick mode with the first char')}
          <Text color={color.primary}>{targets.length > 0 || broadcasting || isSlash ? '_' : ''}</Text>
        </Text>
      </Box>
    </Box>
  );
}
