import { useSyncExternalStore, useRef } from 'react';
import type { PaneStatus } from './theme.js';
import type { Adapter } from './adapters/types.js';
import type { Artifact, ArtifactComment } from './lib/artifacts.js';
import type { LangSmithSnapshot } from './lib/langsmith.js';
import type { ClarifyRequest } from './lib/clarify.js';
import type { Capability } from './lib/capabilities.js';

export type Slot = 1 | 2 | 3 | 4 | 5;

export interface PaneMetrics {
  lastDispatchAt?: number;
  durationMs?: number;
  sessionId?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  confidence?: number; // 0..1, set when CONFIDENCE: line detected
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export type PaneKind = 'cli' | 'monitor' | 'artifact';

export interface PaneState {
  id: string;
  slot: Slot;
  label: string;
  kind: PaneKind;
  status: PaneStatus;
  output: string[];
  adapter: Adapter;
  faultSinceMs: number | null;
  metrics: PaneMetrics;
  locked: boolean;
  persona?: string;
  turns: Turn[];
  history: string[]; // past user prompts
  historyCursor: number | null; // null = not scrolling
  draftBeforeScroll: string;
  remoteSessionId?: string; // e.g. claude --resume id
  retries: number;
  maxRetries: number;
  budgetUsd?: number;
  gitContext?: boolean;
  lastPrompt?: string;
  pendingClarifications: ClarifyRequest[];
}

export interface BroadcastProgress {
  slot: Slot;
  tokens: number;
  status: PaneStatus;
  startedAt: number;
  endedAt?: number;
  responseSoFar: string;
  vote?: 'YES' | 'NO' | 'ABSTAIN';
}

export interface BroadcastState {
  active: boolean;
  prompt: string;
  startedAt: number;
  progress: BroadcastProgress[];
  dismissAt?: number;
  quorum: boolean;
}

export interface Notification {
  id: number;
  message: string;
  level: 'info' | 'warn' | 'error';
  at: number;
}

interface State {
  panes: PaneState[];
  targetSlots: Slot[];
  promptDraft: string;
  bootedAt: number;
  itermMode: boolean;
  history: Record<Slot, PaneStatus[]>;
  broadcast: BroadcastState | null;
  searchPattern: string | null;
  pendingProfile: string | null;
  notifications: Notification[];
  totalCostUsd: number;
  globalBudgetUsd: number | null;
  artifacts: Artifact[];
  artifactCounter: number;
  artifactComments: Record<string, ArtifactComment[]>;
  selectedArtifactIdx: number;
  langgraph: LangSmithSnapshot | null;
  sharedNotes: string[];
  awareness: 'none' | 'roster';
  autoNotes: boolean;
  /** When non-null, dispatch is paused waiting on a clarify answer for this slot. */
  clarifyingFor: Slot | null;
  artifactFilter: string;
  artifactFilterMode: boolean;
  pinnedArtifactIds: string[];
  focusMode: boolean;
  compactMode: boolean;
  helpVisible: boolean;
  paletteVisible: boolean;
  paletteQuery: string;
  paletteSelectedIdx: number;
  capabilities: Capability[];
  /** Per-slot trust score 0..1, default 0.5. Drives autonomy decay. */
  trust: Record<number, number>;
  requireDispatchCapability: boolean;
  /** Per-slot scrollback offset from the bottom (0 = live; >0 = N lines back). */
  scrollOffset: Record<number, number>;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const HISTORY_LIMIT = 240;

let notificationCounter = 0;

let state: State = {
  panes: [],
  targetSlots: [],
  promptDraft: '',
  bootedAt: Date.now(),
  itermMode: false,
  history: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  broadcast: null,
  searchPattern: null,
  pendingProfile: null,
  notifications: [],
  totalCostUsd: 0,
  globalBudgetUsd: null,
  artifacts: [],
  artifactCounter: 0,
  artifactComments: {},
  selectedArtifactIdx: 0,
  langgraph: null,
  sharedNotes: [],
  awareness: 'roster',
  autoNotes: true,
  clarifyingFor: null,
  artifactFilter: '',
  artifactFilterMode: false,
  pinnedArtifactIds: [],
  focusMode: false,
  compactMode: false,
  helpVisible: false,
  paletteVisible: false,
  paletteQuery: '',
  paletteSelectedIdx: 0,
  capabilities: [],
  trust: { 1: 0.5, 2: 0.5, 3: 0.5, 4: 0.5, 5: 0.5 },
  requireDispatchCapability: false,
  scrollOffset: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

function setState(updater: (s: State) => State) {
  state = updater(state);
  listeners.forEach((l) => l());
}

function updatePane(slot: Slot, patch: (p: PaneState) => PaneState) {
  setState((s) => ({
    ...s,
    panes: s.panes.map((p) => (p.slot === slot ? patch(p) : p)),
  }));
}

const MAX_OUTPUT_ENTRY_CHARS = 8 * 1024;
const MAX_OUTPUT_ENTRIES = 512; // ~4MB worst case per pane

export const store = {
  getState: () => state,
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  registerPane: (pane: PaneState) => setState((s) => ({ ...s, panes: [...s.panes, pane] })),

  setStatus: (slot: Slot, status: PaneStatus) =>
    updatePane(slot, (p) => ({
      ...p,
      status,
      faultSinceMs: status === 'FAULT' ? Date.now() : p.faultSinceMs,
    })),

  appendOutput: (slot: Slot, text: string) =>
    updatePane(slot, (p) => {
      // Coalesce streaming chunks into the last entry (Pane joins with '' so
      // entry boundaries are cosmetic), and cap entries so long sessions
      // don't grow memory without bound.
      const last = p.output[p.output.length - 1];
      const output =
        last !== undefined && last.length + text.length <= MAX_OUTPUT_ENTRY_CHARS
          ? [...p.output.slice(0, -1), last + text]
          : [...p.output, text].slice(-MAX_OUTPUT_ENTRIES);
      return { ...p, output };
    }),

  clearOutput: (slot: Slot) => updatePane(slot, (p) => ({ ...p, output: [] })),

  setTargets: (slots: Slot[]) =>
    setState((s) => ({ ...s, targetSlots: [...new Set(slots)].sort() as Slot[] })),

  toggleTarget: (slot: Slot) =>
    setState((s) => {
      const has = s.targetSlots.includes(slot);
      const next = has
        ? s.targetSlots.filter((x) => x !== slot)
        : ([...s.targetSlots, slot].sort() as Slot[]);
      return { ...s, targetSlots: next };
    }),

  cycleTarget: () =>
    setState((s) => {
      const cur = s.targetSlots[0] ?? 0;
      const next = ((cur % 5) + 1) as Slot;
      return { ...s, targetSlots: [next] };
    }),

  setPromptDraft: (text: string) => setState((s) => ({ ...s, promptDraft: text })),

  setMetrics: (slot: Slot, patch: Partial<PaneMetrics>) =>
    updatePane(slot, (p) => ({ ...p, metrics: { ...p.metrics, ...patch } })),

  setItermMode: (on: boolean) => setState((s) => ({ ...s, itermMode: on })),

  toggleLock: (slot: Slot) => updatePane(slot, (p) => ({ ...p, locked: !p.locked })),

  setSearch: (pattern: string | null) => setState((s) => ({ ...s, searchPattern: pattern })),

  setPendingProfile: (name: string | null) => setState((s) => ({ ...s, pendingProfile: name })),

  setRemoteSessionId: (slot: Slot, id: string | undefined) =>
    updatePane(slot, (p) => ({ ...p, remoteSessionId: id })),

  addCost: (usd: number) => setState((s) => ({ ...s, totalCostUsd: s.totalCostUsd + usd })),

  addArtifact: (artifact: Omit<Artifact, 'seq'>) =>
    setState((s) => {
      const seq = s.artifactCounter + 1;
      const next: Artifact = { ...artifact, seq };
      return {
        ...s,
        artifacts: [...s.artifacts, next].slice(-200),
        artifactCounter: seq,
        selectedArtifactIdx: Math.min(s.artifacts.length, 199),
      };
    }),

  addArtifactComment: (comment: ArtifactComment) =>
    setState((s) => ({
      ...s,
      artifactComments: {
        ...s.artifactComments,
        [comment.artifactId]: [...(s.artifactComments[comment.artifactId] ?? []), comment],
      },
    })),

  selectArtifact: (idx: number) =>
    setState((s) => {
      const clamped = Math.max(0, Math.min(s.artifacts.length - 1, idx));
      return { ...s, selectedArtifactIdx: clamped };
    }),

  setLanggraph: (snap: LangSmithSnapshot) => setState((s) => ({ ...s, langgraph: snap })),

  setSharedNotes: (notes: string[]) => setState((s) => ({ ...s, sharedNotes: notes })),

  addSharedNote: (note: string) =>
    setState((s) => ({ ...s, sharedNotes: [...s.sharedNotes, note].slice(-50) })),

  removeSharedNote: (idx: number) =>
    setState((s) => ({
      ...s,
      sharedNotes: s.sharedNotes.filter((_, i) => i !== idx),
    })),

  clearSharedNotes: () => setState((s) => ({ ...s, sharedNotes: [] })),

  setAwareness: (mode: 'none' | 'roster') => setState((s) => ({ ...s, awareness: mode })),

  setAutoNotes: (on: boolean) => setState((s) => ({ ...s, autoNotes: on })),

  queueClarifications: (slot: Slot, questions: string[]) =>
    updatePane(slot, (p) => ({
      ...p,
      pendingClarifications: [
        ...p.pendingClarifications,
        ...questions.map((q) => ({ question: q, askedAt: Date.now() })),
      ],
    })),

  enterClarifyMode: (slot: Slot) =>
    setState((s) => ({ ...s, clarifyingFor: slot, targetSlots: [slot] })),

  exitClarifyMode: () => setState((s) => ({ ...s, clarifyingFor: null })),

  popClarification: (slot: Slot) =>
    updatePane(slot, (p) => ({
      ...p,
      pendingClarifications: p.pendingClarifications.slice(1),
    })),

  selectArtifactDelta: (delta: number) =>
    setState((s) => {
      if (s.artifacts.length === 0) return s;
      const next = Math.max(0, Math.min(s.artifacts.length - 1, s.selectedArtifactIdx + delta));
      return { ...s, selectedArtifactIdx: next };
    }),

  setArtifactFilter: (text: string) => setState((s) => ({ ...s, artifactFilter: text })),

  setArtifactFilterMode: (on: boolean) =>
    setState((s) => ({ ...s, artifactFilterMode: on, artifactFilter: on ? s.artifactFilter : '' })),

  setHelpVisible: (on: boolean) => setState((s) => ({ ...s, helpVisible: on })),

  setPaletteVisible: (on: boolean) =>
    setState((s) => ({
      ...s,
      paletteVisible: on,
      paletteQuery: on ? '' : s.paletteQuery,
      paletteSelectedIdx: 0,
    })),

  setPaletteQuery: (q: string) =>
    setState((s) => ({ ...s, paletteQuery: q, paletteSelectedIdx: 0 })),

  movePaletteSelection: (delta: number) =>
    setState((s) => ({ ...s, paletteSelectedIdx: Math.max(0, s.paletteSelectedIdx + delta) })),

  addCapability: (cap: Capability) =>
    setState((s) => ({ ...s, capabilities: [...s.capabilities, cap] })),

  revokeCapability: (id: string) =>
    setState((s) => ({ ...s, capabilities: s.capabilities.filter((c) => c.id !== id) })),

  /** Sweep expired or auto-return capabilities. Call from the 1Hz tick. */
  pruneCapabilities: () =>
    setState((s) => {
      const now = Date.now();
      const live = s.capabilities.filter((c) => c.expiresAt > now);
      if (live.length === s.capabilities.length) return s;
      return { ...s, capabilities: live };
    }),

  setRequireDispatchCapability: (on: boolean) =>
    setState((s) => ({ ...s, requireDispatchCapability: on })),

  scrollPane: (slot: number, delta: number) =>
    setState((s) => {
      const next = Math.max(0, (s.scrollOffset[slot] ?? 0) + delta);
      return { ...s, scrollOffset: { ...s.scrollOffset, [slot]: next } };
    }),

  resetPaneScroll: (slot: number) =>
    setState((s) => ({ ...s, scrollOffset: { ...s.scrollOffset, [slot]: 0 } })),

  adjustTrust: (slot: number, delta: number) =>
    setState((s) => {
      const cur = s.trust[slot] ?? 0.5;
      const next = Math.max(0, Math.min(1, cur + delta));
      return { ...s, trust: { ...s.trust, [slot]: next } };
    }),

  setFocusMode: (on: boolean) => setState((s) => ({ ...s, focusMode: on })),

  setCompactMode: (on: boolean) => setState((s) => ({ ...s, compactMode: on })),

  togglePinArtifact: (id: string) =>
    setState((s) => {
      const has = s.pinnedArtifactIds.includes(id);
      return {
        ...s,
        pinnedArtifactIds: has
          ? s.pinnedArtifactIds.filter((x) => x !== id)
          : [...s.pinnedArtifactIds, id],
      };
    }),

  setGlobalBudget: (usd: number | null) => setState((s) => ({ ...s, globalBudgetUsd: usd })),

  bumpRetries: (slot: Slot) => updatePane(slot, (p) => ({ ...p, retries: (p.retries ?? 0) + 1 })),

  resetRetries: (slot: Slot) => updatePane(slot, (p) => ({ ...p, retries: 0 })),

  appendTurn: (slot: Slot, turn: Turn) =>
    updatePane(slot, (p) => ({ ...p, turns: [...p.turns, turn] })),

  /** Pop the last N turns (default 2 = last user+assistant pair). */
  popTurns: (slot: Slot, n: number = 2) =>
    updatePane(slot, (p) => ({
      ...p,
      turns: p.turns.slice(0, Math.max(0, p.turns.length - n)),
    })),

  pushHistory: (slot: Slot, prompt: string) =>
    updatePane(slot, (p) => {
      const next = [...p.history.filter((h) => h !== prompt), prompt].slice(-50);
      return { ...p, history: next, historyCursor: null, draftBeforeScroll: '' };
    }),

  setLastPrompt: (slot: Slot, prompt: string) =>
    updatePane(slot, (p) => ({ ...p, lastPrompt: prompt })),

  historyPrev: (slot: Slot, currentDraft: string) =>
    updatePane(slot, (p) => {
      if (p.history.length === 0) return p;
      const cursor =
        p.historyCursor === null ? p.history.length - 1 : Math.max(0, p.historyCursor - 1);
      const draftSave = p.historyCursor === null ? currentDraft : p.draftBeforeScroll;
      setState((s) => ({ ...s, promptDraft: p.history[cursor]! }));
      return { ...p, historyCursor: cursor, draftBeforeScroll: draftSave };
    }),

  historyNext: (slot: Slot) =>
    updatePane(slot, (p) => {
      if (p.historyCursor === null) return p;
      const next = p.historyCursor + 1;
      if (next >= p.history.length) {
        setState((s) => ({ ...s, promptDraft: p.draftBeforeScroll }));
        return { ...p, historyCursor: null };
      }
      setState((s) => ({ ...s, promptDraft: p.history[next]! }));
      return { ...p, historyCursor: next };
    }),

  notify: (level: Notification['level'], message: string) =>
    setState((s) => {
      const n: Notification = {
        id: ++notificationCounter,
        message,
        level,
        at: Date.now(),
      };
      const next = [...s.notifications, n].slice(-5);
      return { ...s, notifications: next };
    }),

  dismissNotificationsBefore: (cutoff: number) =>
    setState((s) => ({
      ...s,
      notifications: s.notifications.filter((n) => n.at >= cutoff),
    })),

  pushHistorySample: () =>
    setState((s) => {
      const next: Record<Slot, PaneStatus[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
      for (const slot of [1, 2, 3, 4, 5] as Slot[]) {
        const pane = s.panes.find((p) => p.slot === slot);
        const sample: PaneStatus = pane ? pane.status : 'OFFLINE';
        const prev = s.history[slot];
        next[slot] = prev.length >= HISTORY_LIMIT ? [...prev.slice(1), sample] : [...prev, sample];
      }
      return { ...s, history: next };
    }),

  startBroadcast: (prompt: string, slots: Slot[], quorum = false) =>
    setState((s) => ({
      ...s,
      broadcast: {
        active: true,
        prompt,
        startedAt: Date.now(),
        quorum,
        progress: slots.map((slot) => ({
          slot,
          tokens: 0,
          status: 'ENGAGED',
          startedAt: Date.now(),
          responseSoFar: '',
        })),
      },
    })),

  bumpBroadcast: (slot: Slot, deltaTokens: number, status: PaneStatus, addText?: string) =>
    setState((s) => {
      if (!s.broadcast) return s;
      const progress = s.broadcast.progress.map((p) => {
        if (p.slot !== slot) return p;
        const isFinal = status === 'DONE' || status === 'FAULT';
        return {
          ...p,
          tokens: p.tokens + deltaTokens,
          status,
          endedAt: isFinal && !p.endedAt ? Date.now() : p.endedAt,
          responseSoFar: addText ? p.responseSoFar + addText : p.responseSoFar,
        };
      });
      const allDone = progress.every((p) => p.status === 'DONE' || p.status === 'FAULT');
      return {
        ...s,
        broadcast: {
          ...s.broadcast,
          progress,
          dismissAt: allDone && !s.broadcast.dismissAt ? Date.now() + 5000 : s.broadcast.dismissAt,
        },
      };
    }),

  setBroadcastVote: (slot: Slot, vote: 'YES' | 'NO' | 'ABSTAIN') =>
    setState((s) => {
      if (!s.broadcast) return s;
      return {
        ...s,
        broadcast: {
          ...s.broadcast,
          progress: s.broadcast.progress.map((p) => (p.slot === slot ? { ...p, vote } : p)),
        },
      };
    }),

  maybeClearBroadcast: () =>
    setState((s) => {
      if (!s.broadcast?.dismissAt) return s;
      if (Date.now() < s.broadcast.dismissAt) return s;
      return { ...s, broadcast: null };
    }),
};

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => Object.is(v, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/**
 * Subscribe to a slice of the store. The selected value is memoized with a
 * shallow-equality guard so that selectors returning *derived* arrays/objects
 * (e.g. `s.panes.filter(...)`) don't return a fresh reference every call —
 * which would otherwise trip useSyncExternalStore's cached-snapshot invariant
 * and cause an infinite render loop.
 */
export function useStore<T>(selector: (s: State) => T): T {
  const lastRef = useRef<{ value: T } | null>(null);
  const getSnapshot = (): T => {
    const next = selector(state);
    if (lastRef.current && shallowEqual(lastRef.current.value, next)) {
      return lastRef.current.value;
    }
    lastRef.current = { value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
