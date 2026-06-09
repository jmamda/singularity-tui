import React from 'react';
import { Box, Text } from 'ink';
import { color, glyph } from '../theme.js';
import { useStore, type Slot } from '../store.js';
import { useTick } from '../lib/useTick.js';
import { pulseColor } from '../lib/effects.js';
import { partialFor, sniffLanguage, inferTitle } from '../lib/artifacts.js';

interface Props {
  targeted: boolean;
  width: number;
  height: number;
}

const SLOT_COLOR: Record<number, string> = {
  1: color.primary,
  2: color.accent,
  3: color.amber,
  4: color.white,
};

const SLOTS: Slot[] = [1, 2, 3, 4];
const JUST_ADDED_MS = 2200;
const FLASH_FPS = 12;

function shortAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

interface ListEntry {
  kind: 'partial' | 'artifact';
  slot: Slot;
  label: string;
  lang: string;
  title: string;
  content: string;
  createdAt: number;
  artifactId?: string;
  seq?: number;
  pinned?: boolean;
  justAdded?: boolean;
  commentCount?: number;
}

export function ArtifactPane({ targeted, width, height }: Props) {
  const tick = useTick(FLASH_FPS);
  const artifacts = useStore((s) => s.artifacts);
  const selectedIdx = useStore((s) => s.selectedArtifactIdx);
  const filterText = useStore((s) => s.artifactFilter);
  const filterMode = useStore((s) => s.artifactFilterMode);
  const pinnedIds = useStore((s) => s.pinnedArtifactIds);
  const comments = useStore((s) => s.artifactComments);
  const panes = useStore((s) => s.panes);

  // Pull live partials from any pane currently mid-block
  const partials: ListEntry[] = [];
  for (const slot of SLOTS) {
    const partial = partialFor(slot);
    if (partial && partial.content.trim()) {
      const pane = panes.find((p) => p.slot === slot);
      const lang = sniffLanguage(partial.content, partial.lang);
      partials.push({
        kind: 'partial',
        slot,
        label: pane?.label ?? `slot${slot}`,
        lang,
        title: inferTitle(partial.content),
        content: partial.content,
        createdAt: partial.startedAt,
      });
    }
  }

  // Build artifact entries with pin + just-added metadata
  const now = Date.now();
  const artifactEntries: ListEntry[] = artifacts.map((a) => ({
    kind: 'artifact',
    slot: a.sourceSlot,
    label: a.sourceLabel,
    lang: a.lang,
    title: a.title ?? '(untitled)',
    content: a.content,
    createdAt: a.createdAt,
    artifactId: a.id,
    seq: a.seq,
    pinned: pinnedIds.includes(a.id),
    justAdded: now - a.createdAt < JUST_ADDED_MS,
    commentCount: (comments[a.id] ?? []).length,
  }));

  // Apply filter (case-insensitive substring over title/lang/label)
  const f = filterText.trim().toLowerCase();
  const filtered = f
    ? artifactEntries.filter(
        (e) =>
          e.title.toLowerCase().includes(f) ||
          e.lang.toLowerCase().includes(f) ||
          e.label.toLowerCase().includes(f),
      )
    : artifactEntries;

  // Order: pinned first, then by index (oldest→newest in original artifact array)
  const ordered = [...filtered].sort((a, b) => {
    if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) return a.pinned ? -1 : 1;
    return 0;
  });

  // Partials go on top, regardless of pin
  const listEntries: ListEntry[] = [...partials, ...ordered];

  // Map selectedIdx (against full artifacts list) to position in listEntries
  const selectedId = artifacts[selectedIdx]?.id;
  const selectedListIdx = selectedId
    ? listEntries.findIndex((e) => e.artifactId === selectedId)
    : -1;

  const borderColor =
    partials.length > 0 ? color.primary : targeted ? pulseColor(tick) : color.accentDim;
  const headerColor =
    partials.length > 0 ? pulseColor(tick) : targeted ? pulseColor(tick) : color.accent;

  const innerHeight = Math.max(2, height - 4);
  const listW = Math.max(22, Math.floor(width * 0.42));
  const detailW = Math.max(20, width - listW - 4);

  // Detail = live partial if it's selected, otherwise the current artifact
  const current = listEntries[selectedListIdx >= 0 ? selectedListIdx : 0] ?? null;

  const windowStart = Math.max(
    0,
    Math.min(
      Math.max(0, listEntries.length - innerHeight),
      Math.max(0, selectedListIdx) - Math.floor(innerHeight / 2),
    ),
  );
  const windowItems = listEntries.slice(windowStart, windowStart + innerHeight);

  const detailLines = current ? current.content.split('\n') : [];
  const visibleDetail = detailLines.slice(0, innerHeight);

  // "Just-added" flashing color (alternates white↔accent every ~80ms)
  const flashOn = tick % 2 === 0;
  const flashColor = flashOn ? color.white : color.accent;

  const producing =
    partials.length > 0 ? partials.map((p) => `[${p.slot}] producing…`).join(' · ') : null;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box paddingX={1} justifyContent="space-between">
        <Text color={headerColor} bold={targeted || partials.length > 0}>
          {partials.length > 0 ? '◢' : targeted ? glyph.pulse : glyph.bullet} [4] ARTIFACTS
          {producing ? <Text color={color.primary}> · {producing}</Text> : null}
        </Text>
        <Text color={color.inactive}>
          {filterMode ? (
            <>
              filter: <Text color={color.amber}>{filterText || '_'}</Text>
            </>
          ) : artifacts.length === 0 ? (
            'awaiting code blocks…'
          ) : (
            `${Math.max(1, selectedIdx + 1)}/${artifacts.length}${filterText ? ` (${filtered.length} shown)` : ''}`
          )}
        </Text>
      </Box>
      <Box borderStyle="single" borderColor={borderColor} height={height - 3} width={width}>
        {/* LIST */}
        <Box flexDirection="column" width={listW} paddingX={1}>
          {listEntries.length === 0 ? (
            <Text color={color.inactive}>
              {glyph.awaiting} {filterText ? `no matches for "${filterText}"` : 'no artifacts yet'}{' '}
              {glyph.awaiting}
            </Text>
          ) : (
            windowItems.map((e, i) => {
              const globalIdx = windowStart + i;
              const isSel = globalIdx === selectedListIdx;
              const c = SLOT_COLOR[e.slot] ?? color.white;
              const isPartial = e.kind === 'partial';
              const lineColor = isPartial
                ? pulseColor(tick)
                : e.justAdded
                  ? flashColor
                  : isSel
                    ? color.white
                    : color.text;
              const seqLabel = e.seq !== undefined ? `#${String(e.seq).padEnd(3)}` : '   ';
              return (
                <Text
                  key={`${e.kind}-${e.artifactId ?? e.slot}`}
                  color={lineColor}
                  bold={isSel || isPartial}
                  wrap="truncate-end"
                >
                  {e.pinned ? '📌' : isPartial ? '◢' : ' '}
                  <Text color={color.inactive}>{seqLabel}</Text>
                  <Text color={c}>[{e.slot}]</Text>{' '}
                  <Text color={color.accent}>{e.lang.padEnd(5)}</Text> {e.title}
                  {e.commentCount && e.commentCount > 0 ? (
                    <Text color={color.amber}> 💬{e.commentCount}</Text>
                  ) : null}
                  {isPartial ? <Text color={color.inactive}> …</Text> : null}
                </Text>
              );
            })
          )}
        </Box>
        {/* DETAIL */}
        <Box flexDirection="column" width={detailW} paddingX={1}>
          {current ? (
            <>
              <Text color={color.inactive} wrap="truncate-end">
                {glyph.bullet}
                {current.seq !== undefined ? (
                  <Text color={color.accent}> #{current.seq}</Text>
                ) : null}{' '}
                {current.lang} · from [{current.slot}] {current.label} ·{' '}
                {current.kind === 'partial' ? (
                  <Text color={color.primary}>streaming…</Text>
                ) : (
                  `${shortAgo(current.createdAt)} ago`
                )}
              </Text>
              {(() => {
                const currentComments = current.artifactId
                  ? (comments[current.artifactId] ?? [])
                  : [];
                const commentRows = Math.min(currentComments.length, 3);
                const codeRows = Math.max(2, innerHeight - commentRows - (commentRows > 0 ? 1 : 0));
                const codeLines = detailLines.slice(0, codeRows);
                return (
                  <>
                    {codeLines.map((line, i) => (
                      <Text key={i} color={color.text} wrap="truncate-end">
                        {line || ' '}
                      </Text>
                    ))}
                    {current.kind === 'partial' ? (
                      <Text color={color.primary}>▮</Text>
                    ) : detailLines.length > codeRows ? (
                      <Text color={color.inactive}>
                        … +{detailLines.length - codeRows} more lines
                      </Text>
                    ) : null}
                    {commentRows > 0 ? (
                      <Box flexDirection="column">
                        <Text color={color.faint}>{'─'.repeat(Math.max(4, detailW - 8))}</Text>
                        {currentComments.slice(-3).map((cm, idx, arr) => {
                          const cc = SLOT_COLOR[cm.fromSlot] ?? color.white;
                          const isLast = idx === arr.length - 1;
                          const branch = isLast ? '└─' : '├─';
                          return (
                            <Text key={cm.id} color={color.text} wrap="truncate-end">
                              <Text color={color.inactive}>{branch}</Text>
                              <Text color={cc}>
                                💬 [{cm.fromSlot}] {cm.fromLabel}
                              </Text>
                              <Text color={color.inactive}>: </Text>
                              {cm.text}
                            </Text>
                          );
                        })}
                      </Box>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : (
            <Text color={color.inactive}>code blocks streamed from any pane appear here</Text>
          )}
        </Box>
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text color={color.inactive}>
          j/k · p pin · / filter · s save · c copy · &gt;&gt;N send to pane
        </Text>
        <Text color={color.inactive}>
          {pinnedIds.length > 0 ? `${pinnedIds.length} pinned · ` : ''}
          {artifacts.length} total
        </Text>
      </Box>
    </Box>
  );
}
