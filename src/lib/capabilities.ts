/**
 * Capability tokens — typed, scoped, expiring, revocable grants that gate every
 * action against the OS or filesystem. This is the trust substrate. Nothing in
 * `src/adapters/shell.ts`, `/apply`, or the shadow-fs is allowed to run without
 * a matching grant.
 */

export type CapabilityKind = 'read' | 'write' | 'exec' | 'net' | 'meta' | 'dispatch';

export interface Capability {
  id: string;
  kind: CapabilityKind;
  /** glob for read/write, regex pattern for exec, hostname for net, action name for meta */
  pattern: string;
  /** Slot that holds this capability. */
  slot: number;
  /** Slot that granted it (null = user). */
  grantedBy: number | null;
  /** Epoch ms when this capability expires; Infinity for non-expiring. */
  expiresAt: number;
  /** Origin token id if this is a lent/derived capability (for return-on-expiry). */
  parentId?: string;
}

export interface CheckRequest {
  slot: number;
  kind: CapabilityKind;
  target: string; // a concrete path / command / host
}

export interface CheckResult {
  ok: boolean;
  reason?: string;
  capability?: Capability;
}

/**
 * Wildcard glob match. "**" matches any sequence (incl. /). "*" matches any
 * sequence not containing /. Exact equality if no wildcards.
 */
export function globMatch(glob: string, target: string): boolean {
  if (glob === target) return true;
  if (glob === '**' || glob === '*') return true;
  const DOUBLE = '';
  const escaped = glob
    .replace(/\*\*/g, DOUBLE)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .split(DOUBLE)
    .join('.*');
  return new RegExp('^' + escaped + '$').test(target);
}

function matches(cap: Capability, req: CheckRequest): boolean {
  if (cap.kind !== req.kind) return false;
  if (cap.slot !== req.slot) return false;
  if (cap.expiresAt < Date.now()) return false;
  if (req.kind === 'dispatch') {
    // dispatch caps are coarse: "auto" or "supervised". Both act as allow.
    return cap.pattern === 'auto' || cap.pattern === 'supervised' || cap.pattern === '*';
  }
  if (req.kind === 'exec') {
    try {
      return new RegExp(cap.pattern).test(req.target);
    } catch {
      return cap.pattern === req.target;
    }
  }
  if (req.kind === 'net') {
    return cap.pattern === req.target || cap.pattern === '*';
  }
  return globMatch(cap.pattern, req.target);
}

export function checkCapabilities(caps: Capability[], req: CheckRequest): CheckResult {
  const m = caps.find((c) => matches(c, req));
  if (m) return { ok: true, capability: m };
  return {
    ok: false,
    reason: `no ${req.kind} capability matching ${req.target} for slot ${req.slot}`,
  };
}

export function fmtCapability(c: Capability): string {
  const sym =
    c.kind === 'read'
      ? 'R'
      : c.kind === 'write'
        ? 'W'
        : c.kind === 'exec'
          ? 'X'
          : c.kind === 'net'
            ? 'N'
            : 'M';
  const exp = Number.isFinite(c.expiresAt)
    ? ` ${Math.max(0, Math.round((c.expiresAt - Date.now()) / 1000))}s`
    : '';
  return `${sym}:${c.pattern}${exp}`;
}

let idCounter = 0;
export function nextCapabilityId(): string {
  return `cap_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
}

export function parseCapabilityArg(
  s: string,
): Omit<Capability, 'id' | 'slot' | 'grantedBy' | 'expiresAt'> | null {
  const m = s.match(/^([RWXNMrwxnm]|read|write|exec|net|meta)\s*:\s*(.+)$/i);
  if (!m) return null;
  const tag = m[1]!.toLowerCase();
  const kind: CapabilityKind =
    tag === 'r' || tag === 'read'
      ? 'read'
      : tag === 'w' || tag === 'write'
        ? 'write'
        : tag === 'x' || tag === 'exec'
          ? 'exec'
          : tag === 'n' || tag === 'net'
            ? 'net'
            : 'meta';
  return { kind, pattern: m[2]!.trim() };
}
