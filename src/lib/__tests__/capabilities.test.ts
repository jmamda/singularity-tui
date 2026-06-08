import { describe, it, expect } from 'vitest';
import {
  globMatch,
  checkCapabilities,
  parseCapabilityArg,
  type Capability,
} from '../capabilities.js';

describe('globMatch', () => {
  it('exact match', () => {
    expect(globMatch('exact.ts', 'exact.ts')).toBe(true);
    expect(globMatch('exact.ts', 'other.ts')).toBe(false);
  });
  it('* matches one segment', () => {
    expect(globMatch('src/*', 'src/a.ts')).toBe(true);
    expect(globMatch('src/*', 'src/a/b.ts')).toBe(false);
  });
  it('** matches across segments', () => {
    expect(globMatch('src/**', 'src/a/b.ts')).toBe(true);
    expect(globMatch('src/**', 'src/a.ts')).toBe(true);
    expect(globMatch('**', 'anything/anywhere')).toBe(true);
  });
});

describe('checkCapabilities', () => {
  const futureMs = Date.now() + 60_000;
  const expiredMs = Date.now() - 60_000;
  const cap = (over: Partial<Capability>): Capability => ({
    id: 't',
    kind: 'write',
    pattern: 'src/**',
    slot: 1,
    grantedBy: null,
    expiresAt: futureMs,
    ...over,
  });

  it('grants matching write', () => {
    const r = checkCapabilities([cap({})], { slot: 1, kind: 'write', target: 'src/a.ts' });
    expect(r.ok).toBe(true);
  });
  it('denies wrong slot', () => {
    const r = checkCapabilities([cap({})], { slot: 2, kind: 'write', target: 'src/a.ts' });
    expect(r.ok).toBe(false);
  });
  it('denies expired', () => {
    const r = checkCapabilities([cap({ expiresAt: expiredMs })], {
      slot: 1,
      kind: 'write',
      target: 'src/a.ts',
    });
    expect(r.ok).toBe(false);
  });
  it('exec pattern matches as regex', () => {
    const r = checkCapabilities(
      [cap({ kind: 'exec', pattern: '^npm test( |$)' })],
      { slot: 1, kind: 'exec', target: 'npm test' },
    );
    expect(r.ok).toBe(true);
  });
});

describe('parseCapabilityArg', () => {
  it('parses short forms', () => {
    expect(parseCapabilityArg('W:src/**')).toEqual({ kind: 'write', pattern: 'src/**' });
    expect(parseCapabilityArg('exec:^npm test')).toEqual({ kind: 'exec', pattern: '^npm test' });
  });
  it('returns null for garbage', () => {
    expect(parseCapabilityArg('asdf')).toBeNull();
  });
});
