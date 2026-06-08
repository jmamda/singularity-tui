import { store, type Slot, type PaneState } from '../store.js';

const RELAY_RE = /^>(\d)\s+(.*)$/s;

export interface RelayParse {
  toSlot: Slot;
  prompt: string;
  fromPane?: PaneState;
  relayed: string;
}

export function parseRelay(text: string): RelayParse | null {
  const m = text.match(RELAY_RE);
  if (!m) return null;
  const slot = Number(m[1]) as Slot;
  if (slot < 1 || slot > 4) return null;
  const userPart = m[2]!.trim();
  const state = store.getState();
  const targetSlots = state.targetSlots;
  const fromSlot = targetSlots[0] ?? null;
  const fromPane = fromSlot ? state.panes.find((p) => p.slot === fromSlot) : undefined;
  const lastAssistant = fromPane
    ? [...fromPane.turns].reverse().find((t) => t.role === 'assistant')
    : undefined;
  const relayed = lastAssistant?.content?.trim() ?? '';
  if (!relayed) {
    return { toSlot: slot, prompt: userPart, fromPane, relayed: '' };
  }
  const composed = `[relay from pane ${fromPane!.slot} ${fromPane!.label}]\n${relayed}\n[/relay]\n\n${userPart}`;
  return { toSlot: slot, prompt: composed, fromPane, relayed };
}
