/**
 * Replay-driven dispatch (#8) — agents emit a structured plan trace; the user
 * steps through it. Agents *propose* via `ACTION:` lines in their responses,
 * the same convention shape as NOTE: / CLARIFY:.
 *
 *   ACTION exec: npm test
 *   ACTION write: src/auth.ts (#14)
 *   ACTION lend: 1->2 write:dist/**  600
 */

import type { ProposedAction } from './sentinel.js';

const ACTION_RE = /^\s*ACTION\s+(exec|write|net|lend)\s*[:\-]\s*(.+?)\s*$/gim;

export interface TraceStep {
  id: string;
  kind: 'exec' | 'write' | 'net' | 'lend';
  target: string;
  raw: string;
}

export interface PlanTrace {
  id: string;
  fromSlot: number;
  createdAt: number;
  steps: TraceStep[];
  cursor: number;
}

let stepCounter = 0;

export function extractTrace(slot: number, text: string): PlanTrace | null {
  const steps: TraceStep[] = [];
  for (const m of text.matchAll(ACTION_RE)) {
    steps.push({
      id: `act_${Date.now().toString(36)}_${++stepCounter}`,
      kind: m[1]!.toLowerCase() as TraceStep['kind'],
      target: m[2]!.trim(),
      raw: m[0]!,
    });
  }
  if (steps.length === 0) return null;
  return {
    id: `trace_${Date.now().toString(36)}_${slot}`,
    fromSlot: slot,
    createdAt: Date.now(),
    steps,
    cursor: 0,
  };
}

export function toProposedAction(slot: number, step: TraceStep): ProposedAction | null {
  if (step.kind === 'lend') return null; // lend is meta; handle separately
  return { kind: step.kind, target: step.target, slot, label: step.raw };
}

export const ACTION_HINT_FOR_MODEL =
  'If you want me to PERFORM an action (run a command, write a file), emit it as `ACTION exec: <cmd>` or `ACTION write: <path>` on its own line. Singularity collects them into a trace I step through — you never execute directly.';
