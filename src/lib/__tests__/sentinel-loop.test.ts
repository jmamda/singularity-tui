import { describe, it, expect, beforeEach } from 'vitest';
import { isDoomLoop, _resetSentinelState } from '../sentinel.js';

beforeEach(_resetSentinelState);

describe('isDoomLoop', () => {
  const action = { kind: 'exec' as const, target: 'npm test', slot: 1 };
  it('false on first two proposals', () => {
    expect(isDoomLoop(action)).toBe(false);
    expect(isDoomLoop(action)).toBe(false);
  });
  it('true on the third identical proposal', () => {
    isDoomLoop(action);
    isDoomLoop(action);
    expect(isDoomLoop(action)).toBe(true);
  });
  it('different targets do not count toward the same loop', () => {
    isDoomLoop({ ...action, target: 'a' });
    isDoomLoop({ ...action, target: 'b' });
    expect(isDoomLoop({ ...action, target: 'c' })).toBe(false);
  });
});
