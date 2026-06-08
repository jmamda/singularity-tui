import type { PaneState, Slot } from '../store.js';
import type { Artifact } from './artifacts.js';
import { MARKER_HINT_FOR_MODEL } from './autoNotes.js';
import { CLARIFY_HINT_FOR_MODEL } from './clarify.js';
import { CONFIDENCE_HINT_FOR_MODEL } from './confidence.js';
import { COMMENT_HINT_FOR_MODEL } from './commentOn.js';

/**
 * Build a "war-room roster" preamble describing this pane's siblings.
 * Excludes the current pane. Excludes OFFLINE panes. Excludes the artifact
 * pane (it's passive, not an agent). Keeps it short — ~30-50 tokens.
 */
export function rosterPreamble(
  panes: PaneState[],
  currentSlot: Slot,
  recentArtifacts: Artifact[] = [],
): string {
  const others = panes.filter(
    (p) => p.slot !== currentSlot && p.status !== 'OFFLINE' && p.kind !== 'artifact',
  );
  const artifact = panes.find((p) => p.kind === 'artifact');

  const total = panes.length;
  const lines: string[] = [
    `[room context]`,
    `You are pane ${currentSlot} of ${total} in a Singularity war-room.`,
  ];

  if (others.length === 0) {
    lines.push('No other agent panes are active.');
  } else {
    lines.push('Other agent panes (running independently):');
    for (const p of others) {
      const role = p.persona ? ` — ${p.persona.slice(0, 80).replace(/\n/g, ' ')}` : '';
      lines.push(`  [${p.slot}] ${p.label}${role}`);
    }
  }

  if (artifact) {
    lines.push(
      `[${artifact.slot}] ${artifact.label} — passive collector of code blocks (not an agent).`,
    );
  }

  lines.push(
    'You do not see other panes\' work unless I explicitly relay or share it.',
  );
  lines.push('');
  lines.push('Conventions (use these on their own lines, exactly as shown):');
  lines.push(`  - ${CONFIDENCE_HINT_FOR_MODEL}`);
  lines.push(`  - ${MARKER_HINT_FOR_MODEL}`);
  lines.push(`  - ${CLARIFY_HINT_FOR_MODEL}`);
  lines.push(`  - ${COMMENT_HINT_FOR_MODEL}`);

  if (recentArtifacts.length > 0) {
    lines.push('');
    lines.push('Recent artifacts (use these #N when commenting):');
    const tail = recentArtifacts.slice(-6); // last 6
    for (const a of tail) {
      const title = (a.title ?? '').slice(0, 48);
      lines.push(`  #${a.seq} [${a.sourceSlot}] ${a.lang} · ${title}`);
    }
  }

  lines.push(`[/room context]`);

  return lines.join('\n');
}
