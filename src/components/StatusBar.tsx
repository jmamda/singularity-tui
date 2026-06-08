import React from 'react';
import { Box, Text } from 'ink';
import { color, status as statusMap } from '../theme.js';
import { useStore, type Slot } from '../store.js';
import { fmtCost } from '../lib/format.js';

function clock(): string {
  const d = new Date();
  return d.toISOString().slice(11, 19);
}

const SLOTS: Slot[] = [1, 2, 3, 4];

export function StatusBar() {
  const [now, setNow] = React.useState(clock());
  React.useEffect(() => {
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, []);

  const panes = useStore((s) => s.panes);
  const targetSlots = useStore((s) => s.targetSlots);
  const total = useStore((s) => s.totalCostUsd);
  const notes = useStore((s) => s.sharedNotes);
  const langgraph = useStore((s) => s.langgraph);
  const broadcast = useStore((s) => s.broadcast);
  const artifacts = useStore((s) => s.artifacts);

  // Pane mini-chips: one box per slot, colored by status
  const chips = SLOTS.map((slot) => {
    const p = panes.find((pn) => pn.slot === slot);
    if (!p) {
      return (
        <Text key={slot} color={color.faint}>
          [{slot}]
        </Text>
      );
    }
    const s = statusMap[p.status];
    const isTargeted = targetSlots.includes(slot);
    const targetMark = isTargeted ? '▶' : ' ';
    return (
      <Text key={slot}>
        <Text color={isTargeted ? color.primary : color.inactive} bold={isTargeted}>
          {targetMark}
        </Text>
        <Text color={s.color} bold={isTargeted}>
          {String(slot)}
        </Text>
      </Text>
    );
  });

  const lgGlyph = langgraph
    ? langgraph.error
      ? '⚠'
      : langgraph.active > 0
        ? '◢'
        : '✓'
    : null;
  const lgColor = langgraph
    ? langgraph.error
      ? color.amber
      : langgraph.active > 0
        ? color.primary
        : color.accentDim
    : color.faint;

  return (
    <Box
      borderStyle="double"
      borderColor={color.primary}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={color.primary} bold>
          ● SINGULARITY{' '}
        </Text>
        <Text color={color.inactive}>// </Text>
        {chips.flatMap((c, i) =>
          i === 0 ? [c] : [
            <Text key={`s${i}`} color={color.faint}> </Text>,
            c,
          ],
        )}
        {broadcast ? (
          <Text color={color.primary} bold>
            {'  '}● {broadcast.quorum ? 'QUORUM' : 'BCAST'}
          </Text>
        ) : null}
      </Box>
      <Box>
        <Text color={color.accent}>{fmtCost(total)}</Text>
        {notes.length > 0 ? (
          <Text color={color.inactive}> · {notes.length}n</Text>
        ) : null}
        {artifacts.length > 0 ? (
          <Text color={color.inactive}> · {artifacts.length}a</Text>
        ) : null}
        {lgGlyph ? (
          <>
            <Text color={color.inactive}> · </Text>
            <Text color={lgColor}>{lgGlyph}lg</Text>
          </>
        ) : null}
        <Text color={color.inactive}>  {now}</Text>
      </Box>
    </Box>
  );
}
