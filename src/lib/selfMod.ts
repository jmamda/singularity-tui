/**
 * Self-modifying MCP tools (#10). Allows agents outside Singularity (via the
 * MCP server) to read state and — when granted the `meta:configure`
 * capability — mutate it.
 *
 * The trust model: meta capabilities can only be granted *by the human user*
 * through the local TUI (`/grant <slot> meta:configure`). MCP callers cannot
 * grant themselves a meta cap; they can only act using one already held by
 * the originating slot they claim.
 *
 * MCP callers cannot identify themselves as any pane: their effective caller
 * slot is always the reserved MCP_CALLER_SLOT (0). For an MCP caller to do
 * anything gated, the human user must grant the relevant meta cap to slot 0
 * via the TUI (`/grant 0 meta:set_persona:2 600`). The caller-supplied
 * `callerSlot`/`slot` fields are NEVER used as caller identity — the `slot`
 * field is reserved for the *target* of the operation.
 */

import { store } from '../store.js';
import { checkCapabilities, nextCapabilityId, type Capability } from './capabilities.js';

export const MCP_CALLER_SLOT = 0;

function requireMeta(target: string): void {
  const caps = store.getState().capabilities;
  const check = checkCapabilities(caps, { slot: MCP_CALLER_SLOT, kind: 'meta', target });
  if (!check.ok) {
    throw new Error(
      `permission denied: MCP caller (slot ${MCP_CALLER_SLOT}) lacks meta:${target} (${check.reason})`,
    );
  }
}

export async function runSelfModTool(name: string, args: any): Promise<any> {
  // Caller identity is fixed — args.callerSlot / args.slot are ignored for
  // *caller* identity (args.slot is still used as the *target* slot below).
  const callerSlot = MCP_CALLER_SLOT;
  if (name === 'singularity_status') {
    const s = store.getState();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              panes: s.panes.map((p) => ({
                slot: p.slot,
                label: p.label,
                kind: p.kind,
                status: p.status,
              })),
              capabilities: s.capabilities.map((c) => ({
                slot: c.slot,
                kind: c.kind,
                pattern: c.pattern,
              })),
              trust: s.trust,
              artifacts: s.artifacts.length,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (name === 'singularity_set_persona') {
    requireMeta(`set_persona:${args.slot}`);
    // We mutate persona in place — see store's panes structure.
    const s = store.getState();
    const pane = s.panes.find((p) => p.slot === Number(args.slot));
    if (!pane) throw new Error(`no pane at slot ${args.slot}`);
    // Direct mutation is safe here because the React tree reads via the store
    // subscription; we need to push a re-render. Use the existing notify hook.
    pane.persona = String(args.persona);
    store.notify('info', `mcp: set persona on slot ${args.slot}`);
    return { content: [{ type: 'text', text: 'ok' }] };
  }
  if (name === 'singularity_grant_capability') {
    const kind = String(args.kind ?? '').toLowerCase();
    // HARD REFUSAL: MCP callers can never mint `meta` capabilities. Meta caps
    // (incl. `meta:configure`, `meta:grant:*`) are user-only and granted from
    // the TUI. Without this, holding a single `meta:grant:slot=X` cap would
    // let MCP elevate to `meta:configure` for itself.
    if (kind === 'meta') {
      throw new Error('meta capabilities cannot be granted via MCP; use the TUI /grant');
    }
    if (!['read', 'write', 'exec', 'net'].includes(kind)) {
      throw new Error(`invalid capability kind: ${args.kind}`);
    }
    // Caller must hold a kind-specific meta cap that covers the target slot,
    // not just a generic `grant:` cap.
    requireMeta(`grant:${kind}:${args.slot}`);

    // Sanity cap on duration to prevent permanent grants over MCP.
    const secs = Number(args.seconds);
    const expiresAt =
      Number.isFinite(secs) && secs > 0 && secs <= 86_400
        ? Date.now() + secs * 1000
        : Date.now() + 3600 * 1000; // default 1h
    const cap: Capability = {
      id: nextCapabilityId(),
      slot: Number(args.slot),
      kind: kind as Capability['kind'],
      pattern: String(args.pattern),
      grantedBy: callerSlot,
      expiresAt,
    };
    store.addCapability(cap);
    return {
      content: [
        {
          type: 'text',
          text: `granted ${cap.kind}:${cap.pattern} → slot ${cap.slot} (expires in ${Math.round((expiresAt - Date.now()) / 1000)}s)`,
        },
      ],
    };
  }
  throw new Error(`unknown self-mod tool: ${name}`);
}
