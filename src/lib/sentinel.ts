/**
 * Sentinel — an in-process watchdog that observes proposed actions and decides
 * whether to allow or veto them.
 *
 * The default sentinel is a *deterministic* rule-based vetoer (so it can run
 * for free, in unit tests, and in headless mode). A user may opt to also route
 * proposals to an LLM-backed sentinel pane; that integration lives in
 * `src/App.tsx` and reuses the regular adapter machinery — emit `VETO:` or
 * `OK` as the first line.
 */

export interface ProposedAction {
  kind: 'write' | 'exec' | 'net';
  /** Target path / command / host. */
  target: string;
  /** Slot proposing the action. */
  slot: number;
  /** Free-form context / payload hash. */
  label?: string;
}

export interface SentinelVerdict {
  ok: boolean;
  reason?: string;
  requiresDualKey?: boolean;
}

const DANGEROUS_EXEC: RegExp[] = [
  /\brm\s+-rf?\b/,
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bnpm\s+publish\b/,
  /\bsudo\b/,
  /\bdd\b/,
  /\bmkfs\b/,
  /:\s*\(\s*\)\s*\{.*:\|:.*&.*\}/, // fork bomb
];

const SENSITIVE_WRITE: RegExp[] = [
  /(^|\/)\.ssh\//,
  /\.env(\..+)?$/,
  /(^|\/)etc\//,
  /(^|\/)private\//,
];

/**
 * Verdict on a proposed action.
 *
 * @returns ok=false (veto) for hard blocks; ok=true with requiresDualKey=true
 *          for actions that need a second pane's independent agreement before
 *          executing.
 */
export function sentinelVerdict(action: ProposedAction): SentinelVerdict {
  if (action.kind === 'exec') {
    for (const re of DANGEROUS_EXEC) {
      if (re.test(action.target)) {
        return {
          ok: true,
          requiresDualKey: true,
          reason: `dangerous exec: ${re.source}`,
        };
      }
    }
  }
  if (action.kind === 'write') {
    for (const re of SENSITIVE_WRITE) {
      if (re.test(action.target)) {
        return {
          ok: false,
          reason: `refused: writes to ${action.target} are not permitted (sensitive path: ${re.source})`,
        };
      }
    }
  }
  return { ok: true };
}

// ─── Trust decay ───────────────────────────────────────────────────────

export const TRUST_DELTAS = {
  cleanExecution: +0.05,
  rollback: -0.15,
  veto: -0.1,
  fault: -0.05,
  dualKeyAck: +0.02,
} as const;

/** Required trust for an action, scaled by predicted blast radius (0..1). */
export function trustRequiredForBlast(blast: number): number {
  return Math.max(0, Math.min(1, blast));
}

// ─── Dual-key ──────────────────────────────────────────────────────────

export interface PendingDualKey {
  id: string;
  action: ProposedAction;
  firstSlot: number;
  proposedAt: number;
}

const DUAL_KEY_WINDOW_MS = 60_000;

let pending: PendingDualKey[] = [];
let dkCounter = 0;

/**
 * Submit an action for dual-key consideration. If a matching proposal from a
 * *different* slot is already pending and within the window, returns
 * `acknowledged`. Otherwise this becomes the first key.
 */
export function submitDualKey(action: ProposedAction): {
  acknowledged: boolean;
  id: string;
  reason: string;
} {
  const now = Date.now();
  pending = pending.filter((p) => now - p.proposedAt < DUAL_KEY_WINDOW_MS);
  const match = pending.find(
    (p) =>
      p.action.kind === action.kind &&
      p.action.target === action.target &&
      p.firstSlot !== action.slot,
  );
  if (match) {
    pending = pending.filter((p) => p.id !== match.id);
    return {
      acknowledged: true,
      id: match.id,
      reason: `dual-key satisfied: [${match.firstSlot}] + [${action.slot}]`,
    };
  }
  const id = `dk_${Date.now().toString(36)}_${++dkCounter}`;
  pending.push({ id, action, firstSlot: action.slot, proposedAt: now });
  return {
    acknowledged: false,
    id,
    reason: `dual-key pending: another pane must independently propose the same action within ${DUAL_KEY_WINDOW_MS / 1000}s`,
  };
}

export function pendingDualKeys(): PendingDualKey[] {
  const now = Date.now();
  pending = pending.filter((p) => now - p.proposedAt < DUAL_KEY_WINDOW_MS);
  return pending.slice();
}

/** For tests. */
export function _resetSentinelState(): void {
  pending = [];
  dkCounter = 0;
  recent = [];
}

// ─── Doom-loop detection ──────────────────────────────────────────────

const RECENT_LIMIT = 6;
const LOOP_THRESHOLD = 3;
let recent: Array<{ target: string; at: number }> = [];

/**
 * Returns true if the same action has been proposed 3+ times within the last
 * 60s (i.e., the agent is stuck in a loop).
 */
export function isDoomLoop(action: ProposedAction): boolean {
  const now = Date.now();
  recent = recent.filter((r) => now - r.at < 60_000);
  recent.push({ target: action.target, at: now });
  if (recent.length > RECENT_LIMIT) recent = recent.slice(-RECENT_LIMIT);
  const same = recent.filter((r) => r.target === action.target).length;
  return same >= LOOP_THRESHOLD;
}
