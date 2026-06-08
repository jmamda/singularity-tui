import { describe, it, expect, beforeEach } from 'vitest';
import {
  sentinelVerdict,
  submitDualKey,
  pendingDualKeys,
  _resetSentinelState,
} from '../sentinel.js';

beforeEach(_resetSentinelState);

describe('sentinelVerdict', () => {
  it('vetos sensitive writes', () => {
    expect(sentinelVerdict({ kind: 'write', target: '.env', slot: 1 }).ok).toBe(false);
    expect(sentinelVerdict({ kind: 'write', target: '/etc/hosts', slot: 1 }).ok).toBe(false);
  });
  it('requires dual-key for dangerous execs', () => {
    const v = sentinelVerdict({ kind: 'exec', target: 'rm -rf /tmp/x', slot: 1 });
    expect(v.ok).toBe(true);
    expect(v.requiresDualKey).toBe(true);
  });
  it('allows benign exec without dual-key', () => {
    const v = sentinelVerdict({ kind: 'exec', target: 'npm test', slot: 1 });
    expect(v.ok).toBe(true);
    expect(v.requiresDualKey).toBeFalsy();
  });
});

describe('dual-key', () => {
  it('first submission pends, second matching submission acknowledges', () => {
    const action = { kind: 'exec' as const, target: 'git push --force', slot: 1 };
    const first = submitDualKey(action);
    expect(first.acknowledged).toBe(false);
    expect(pendingDualKeys()).toHaveLength(1);
    const second = submitDualKey({ ...action, slot: 3 });
    expect(second.acknowledged).toBe(true);
    expect(pendingDualKeys()).toHaveLength(0);
  });
  it('same-slot resubmission does not acknowledge itself', () => {
    const action = { kind: 'exec' as const, target: 'rm -rf x', slot: 1 };
    expect(submitDualKey(action).acknowledged).toBe(false);
    expect(submitDualKey(action).acknowledged).toBe(false);
  });
  it('different actions do not satisfy each other', () => {
    expect(submitDualKey({ kind: 'exec', target: 'a', slot: 1 }).acknowledged).toBe(false);
    expect(submitDualKey({ kind: 'exec', target: 'b', slot: 2 }).acknowledged).toBe(false);
    expect(pendingDualKeys()).toHaveLength(2);
  });
});
