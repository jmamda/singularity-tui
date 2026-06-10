import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { store, type PaneState, type Slot } from '../store.js';
import type { Adapter } from '../adapters/types.js';

const dummyAdapter: Adapter = {
  id: 'dummy',
  label: 'DUMMY',
  kind: 'cli',
  available: async () => true,
  stop: async () => {},
};

function makePane(slot: Slot): PaneState {
  return {
    id: `dummy-${slot}`,
    slot,
    label: `PANE${slot}`,
    kind: 'cli',
    status: 'STANDBY',
    output: [],
    adapter: dummyAdapter,
    faultSinceMs: null,
    metrics: {},
    locked: false,
    turns: [],
    history: [],
    historyCursor: null,
    draftBeforeScroll: '',
    retries: 0,
    maxRetries: 0,
    pendingClarifications: [],
  };
}

const pane = (slot: Slot) => store.getState().panes.find((p) => p.slot === slot)!;

beforeAll(() => {
  store.registerPane(makePane(1));
});

describe('appendOutput', () => {
  beforeEach(() => store.clearOutput(1));

  it('coalesces small streaming chunks into one entry', () => {
    store.appendOutput(1, 'hello ');
    store.appendOutput(1, 'world');
    expect(pane(1).output).toEqual(['hello world']);
  });

  it('starts a new entry once the current one is full', () => {
    store.appendOutput(1, 'x'.repeat(9_000));
    store.appendOutput(1, 'next');
    expect(pane(1).output).toHaveLength(2);
    expect(pane(1).output[1]).toBe('next');
  });

  it('caps the number of entries so memory stays bounded', () => {
    for (let i = 0; i < 600; i++) store.appendOutput(1, 'y'.repeat(9_000));
    expect(pane(1).output.length).toBeLessThanOrEqual(512);
  });
});

describe('notifications', () => {
  it('keeps at most 5 notifications', () => {
    for (let i = 0; i < 8; i++) store.notify('info', `note ${i}`);
    const items = store.getState().notifications;
    expect(items).toHaveLength(5);
    expect(items[items.length - 1]!.message).toBe('note 7');
  });
});

describe('pushHistory', () => {
  it('dedupes repeated prompts and keeps the latest at the end', () => {
    store.pushHistory(1, 'first');
    store.pushHistory(1, 'second');
    store.pushHistory(1, 'first');
    const h = pane(1).history;
    expect(h.filter((x) => x === 'first')).toHaveLength(1);
    expect(h[h.length - 1]).toBe('first');
  });

  it('caps history at 50 entries', () => {
    for (let i = 0; i < 60; i++) store.pushHistory(1, `prompt ${i}`);
    expect(pane(1).history.length).toBeLessThanOrEqual(50);
  });
});

describe('targets', () => {
  it('toggleTarget adds and removes a slot', () => {
    store.setTargets([]);
    store.toggleTarget(1);
    expect(store.getState().targetSlots).toEqual([1]);
    store.toggleTarget(1);
    expect(store.getState().targetSlots).toEqual([]);
  });

  it('setTargets dedupes and sorts', () => {
    store.setTargets([3, 1, 3] as Slot[]);
    expect(store.getState().targetSlots).toEqual([1, 3]);
    store.setTargets([]);
  });
});
