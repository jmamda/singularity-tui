import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '../../store.js';
import { runSelfModTool } from '../selfMod.js';

beforeEach(() => {
  // Reset capability list and trust between tests by mutating store directly
  const s = store.getState();
  for (const cap of [...s.capabilities]) store.revokeCapability(cap.id);
});

describe('singularity_grant_capability (MCP)', () => {
  it('refuses to mint meta caps regardless of caller permission', async () => {
    // Even with a wide-open meta cap, MCP cannot mint another meta cap
    store.addCapability({
      id: 'priv',
      slot: 1,
      kind: 'meta',
      pattern: '**',
      grantedBy: null,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    await expect(
      runSelfModTool('singularity_grant_capability', {
        callerSlot: 1,
        slot: 2,
        kind: 'meta',
        pattern: '**',
      }),
    ).rejects.toThrow(/meta capabilities cannot be granted via MCP/);
  });

  it('refuses unknown capability kinds', async () => {
    await expect(
      runSelfModTool('singularity_grant_capability', {
        callerSlot: 1,
        slot: 2,
        kind: 'bogus',
        pattern: '*',
      }),
    ).rejects.toThrow(/invalid capability kind/);
  });

  it('requires a kind-specific meta cap, not a generic one', async () => {
    // Holding meta:grant:slot=2 is NOT enough to grant write — the caller
    // needs meta:grant:write:2 specifically.
    store.addCapability({
      id: 'g1',
      slot: 1,
      kind: 'meta',
      pattern: 'grant:2',
      grantedBy: null,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    await expect(
      runSelfModTool('singularity_grant_capability', {
        callerSlot: 1,
        slot: 2,
        kind: 'write',
        pattern: 'src/**',
        seconds: 60,
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('grants a write cap with kind-specific meta + caps the duration', async () => {
    // MCP caller is always reserved slot 0 — meta cap must be granted there.
    store.addCapability({
      id: 'g2',
      slot: 0,
      kind: 'meta',
      pattern: 'grant:write:2',
      grantedBy: null,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    // Asking for 1 year — should clamp to 1h default
    const result = await runSelfModTool('singularity_grant_capability', {
      slot: 2,
      kind: 'write',
      pattern: 'src/**',
      seconds: 31_536_000,
    });
    expect(JSON.stringify(result)).toMatch(/granted write:src/);
    const granted = store.getState().capabilities.find((c) => c.kind === 'write' && c.pattern === 'src/**');
    expect(granted).toBeDefined();
    const ttl = granted!.expiresAt - Date.now();
    expect(ttl).toBeLessThanOrEqual(3600 * 1000 + 1000);
  });

  it('ignores caller-supplied callerSlot — cannot impersonate a privileged pane', async () => {
    // A user grants meta cap to pane 1 expecting only pane 1 to be able to act.
    store.addCapability({
      id: 'priv-slot1',
      slot: 1,
      kind: 'meta',
      pattern: 'grant:write:2',
      grantedBy: null,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    // MCP caller claims callerSlot=1 trying to ride pane 1's meta cap.
    // Pre-fix this succeeded. Post-fix the caller identity is pinned to slot 0,
    // which has no caps, so the grant must fail.
    await expect(
      runSelfModTool('singularity_grant_capability', {
        callerSlot: 1, // ignored
        slot: 2,
        kind: 'write',
        pattern: 'src/**',
        seconds: 60,
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
