import { describe, it, expect } from 'vitest';
import { extractPlan } from '../planExec.js';

describe('extractPlan', () => {
  it('parses a JSON code block of steps', () => {
    const text = [
      'Here is the plan:',
      '```json',
      '{ "steps": [',
      '  { "slot": 2, "task": "write the failing test" },',
      '  { "slot": 3, "task": "review it", "dependsOn": 0 }',
      '] }',
      '```',
    ].join('\n');
    expect(extractPlan(text)).toEqual([
      { slot: 2, task: 'write the failing test', dependsOn: undefined },
      { slot: 3, task: 'review it', dependsOn: 0 },
    ]);
  });

  it('filters out malformed steps', () => {
    const text = [
      '```json',
      '{ "steps": [',
      '  { "slot": "two", "task": "bad slot" },',
      '  { "slot": 1 },',
      '  { "slot": 4, "task": "good" }',
      '] }',
      '```',
    ].join('\n');
    expect(extractPlan(text)).toEqual([{ slot: 4, task: 'good', dependsOn: undefined }]);
  });

  it('falls back to numbered [pane N] lines', () => {
    const text = ['1. [pane 2] write the endpoint', '2. [pane 3] add tests for it'].join('\n');
    expect(extractPlan(text)).toEqual([
      { slot: 2, task: 'write the endpoint' },
      { slot: 3, task: 'add tests for it' },
    ]);
  });

  it('ignores out-of-range slots in the fallback', () => {
    expect(extractPlan('1. [pane 9] nope')).toEqual([]);
  });

  it('returns [] for prose with no plan', () => {
    expect(extractPlan('I would suggest refactoring the parser first.')).toEqual([]);
  });
});
