import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX = join(tmpdir(), `singularity-triggers-${Date.now()}`);
process.env.SINGULARITY_DIR = SANDBOX;

const { loadTriggers, saveTriggers, TriggerRunner } = await import('../triggers.js');
type TriggerSpec = import('../triggers.js').TriggerSpec;

describe('trigger persistence', () => {
  beforeEach(async () => {
    await fs.rm(SANDBOX, { recursive: true, force: true });
  });

  it('returns [] when no triggers file exists', async () => {
    expect(await loadTriggers()).toEqual([]);
  });

  it('round-trips trigger specs', async () => {
    const specs: TriggerSpec[] = [
      { id: 't1', source: 'time:interval', match: '30', slot: 1, prompt: 'status check' },
      { id: 't2', source: 'fs:change', match: '/tmp/x', slot: 2, prompt: 'review {{file}}' },
    ];
    await saveTriggers(specs);
    expect(await loadTriggers()).toEqual(specs);
  });
});

describe('TriggerRunner time:interval', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('dispatches on each interval with {{interval}} substituted', () => {
    const calls: Array<[number, string]> = [];
    const runner = new TriggerRunner((slot, prompt) => calls.push([slot, prompt]));
    runner.start({
      id: 't',
      source: 'time:interval',
      match: '2',
      slot: 3,
      prompt: 'tick every {{interval}}s',
    });
    vi.advanceTimersByTime(4_000);
    expect(calls).toEqual([
      [3, 'tick every 2s'],
      [3, 'tick every 2s'],
    ]);
    runner.stopAll();
    vi.advanceTimersByTime(10_000);
    expect(calls).toHaveLength(2);
  });

  it('rejects non-numeric or non-positive intervals', () => {
    const calls: unknown[] = [];
    const runner = new TriggerRunner((slot, prompt) => calls.push([slot, prompt]));
    runner.start({ id: 'a', source: 'time:interval', match: 'soon', slot: 1, prompt: 'x' });
    runner.start({ id: 'b', source: 'time:interval', match: '0', slot: 1, prompt: 'x' });
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual([]);
    runner.stopAll();
  });
});
