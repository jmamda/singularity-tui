import { describe, it, expect } from 'vitest';
import { makeSpawnCliAdapter } from '../spawnCli.js';
import type { AdapterEvent } from '../types.js';

async function collect(stream: AsyncIterable<AdapterEvent>): Promise<AdapterEvent[]> {
  const out: AdapterEvent[] = [];
  for await (const ev of stream) out.push(ev);
  return out;
}

describe('makeSpawnCliAdapter (against real child processes)', () => {
  it('streams stdout, ends with DONE, and drains the queue in order', async () => {
    const adapter = makeSpawnCliAdapter({
      id: 'echo',
      label: 'ECHO',
      command: 'printf',
      argsForPrompt: () => ['hello world'],
    });
    const events = await collect(adapter.send!('ignored'));
    const text = events
      .filter((e) => e.type === 'token')
      .map((e: any) => e.text)
      .join('');
    expect(text).toContain('hello world');
    expect(events[0]).toEqual({ type: 'status', status: 'ENGAGED' });
    expect(events.at(-1)).toEqual({ type: 'status', status: 'DONE' });
    // exactly one terminal status (no double-resolve from error+exit)
    expect(
      events.filter((e) => e.type === 'status' && (e.status === 'DONE' || e.status === 'FAULT')),
    ).toHaveLength(1);
  });

  it('emits FAULT exactly once when the binary does not exist', async () => {
    const adapter = makeSpawnCliAdapter({
      id: 'nope',
      label: 'NOPE',
      command: 'this-binary-does-not-exist-xyz',
      argsForPrompt: () => [],
    });
    const events = await collect(adapter.send!('x'));
    const terminal = events.filter(
      (e) => e.type === 'status' && (e.status === 'DONE' || e.status === 'FAULT'),
    );
    expect(terminal).toHaveLength(1);
    expect(terminal[0]).toEqual({ type: 'status', status: 'FAULT' });
  });

  it('applies parseLine and computes cost when pricing is set', async () => {
    const adapter = makeSpawnCliAdapter({
      id: 'lines',
      label: 'LINES',
      command: 'printf',
      argsForPrompt: () => ['a\\nb\\n'],
      parseLine: (line) => (line ? { type: 'token', text: line.toUpperCase() } : null),
      pricing: { inPerM: 1, outPerM: 1 },
    });
    const events = await collect(adapter.send!('in'));
    const text = events
      .filter((e) => e.type === 'token')
      .map((e: any) => e.text)
      .join('');
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(events.some((e) => e.type === 'cost')).toBe(true);
  });
});
