import { describe, it, expect } from 'vitest';
import { parseYaml, runRecipe, type Recipe, type Dispatcher } from '../recipes.js';

function mockDispatcher(): Dispatcher & { calls: string[]; slashes: string[] } {
  const calls: string[] = [];
  const slashes: string[] = [];
  return {
    calls,
    slashes,
    async dispatch(input, slots) {
      calls.push(`${input}|${slots.join(',')}`);
    },
    async runSlash(text) {
      slashes.push(text);
      return { ok: true };
    },
  };
}

describe('parseYaml', () => {
  it('parses a recipe YAML', () => {
    const y = `name: hello
description: a test
usecase: 99
steps:
  - do: "say hi"
    target: 1
  - do: "/share x.md"
    timeoutSec: 10
`;
    const out = parseYaml(y) as Recipe;
    expect(out.name).toBe('hello');
    expect(out.usecase).toBe(99);
    expect(out.steps.length).toBe(2);
    expect(out.steps[0]!.do).toBe('say hi');
    expect(out.steps[0]!.target).toBe(1);
    expect(out.steps[1]!.timeoutSec).toBe(10);
  });

  it('coerces booleans and ints', () => {
    const y = `a: true\nb: false\nc: 42\nd: "wrapped"`;
    const out = parseYaml(y) as any;
    expect(out.a).toBe(true);
    expect(out.b).toBe(false);
    expect(out.c).toBe(42);
    expect(out.d).toBe('wrapped');
  });
});

describe('runRecipe', () => {
  it('runs every step in order', async () => {
    const d = mockDispatcher();
    const r = await runRecipe(
      {
        name: 't',
        description: '',
        steps: [{ do: 'one', target: 1 }, { do: 'two', target: 2 }, { do: '/share file.md' }],
      },
      d,
    );
    expect(r.ok).toBe(true);
    expect(r.stepsRun).toBe(3);
    expect(d.calls).toEqual(['one|1', 'two|2']);
    expect(d.slashes).toEqual(['/share file.md']);
  });

  it('substitutes template vars', async () => {
    const d = mockDispatcher();
    await runRecipe({ name: 't', description: '', steps: [{ do: 'hi {{who}}', target: 1 }] }, d, {
      who: 'world',
    });
    expect(d.calls[0]).toBe('hi world|1');
  });

  it('halts on failure without continueOnError', async () => {
    const d: Dispatcher = {
      async dispatch() {
        throw new Error('boom');
      },
      async runSlash() {
        return { ok: true };
      },
    };
    const r = await runRecipe(
      {
        name: 't',
        description: '',
        steps: [
          { do: 'a', target: 1 },
          { do: 'b', target: 1 },
        ],
      },
      d,
    );
    expect(r.ok).toBe(false);
    expect(r.failed?.step).toBe(0);
  });

  it('continueOnError skips past failures', async () => {
    let n = 0;
    const d: Dispatcher = {
      async dispatch() {
        n++;
        if (n === 1) throw new Error('boom');
      },
      async runSlash() {
        return { ok: true };
      },
    };
    const r = await runRecipe(
      {
        name: 't',
        description: '',
        steps: [
          { do: 'a', target: 1, continueOnError: true },
          { do: 'b', target: 1 },
        ],
      },
      d,
    );
    expect(r.ok).toBe(true);
    expect(r.stepsRun).toBe(2);
  });

  it('times out a hanging step', async () => {
    const d: Dispatcher = {
      dispatch: () => new Promise(() => {}),
      runSlash: async () => ({ ok: true }),
    };
    const r = await runRecipe(
      { name: 't', description: '', steps: [{ do: 'hang', target: 1, timeoutSec: 0.05 }] },
      d,
    );
    expect(r.ok).toBe(false);
    expect(r.failed?.reason).toContain('timed out');
  });
});
