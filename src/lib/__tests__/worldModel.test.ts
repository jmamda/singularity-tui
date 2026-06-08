import { describe as vDescribe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeGraphView } from '../worldModel/graphView.js';
import {
  describe as wDescribe,
  callers,
  impact,
  uncertain,
  nextLikelyPrompt,
  know,
} from '../worldModel/query.js';
import type { WorldContext } from '../worldModel/query.js';
import type { BuildSnapshot, AgentSnapshot } from '../worldModel/gitBuildView.js';

const STALE_BUILD: BuildSnapshot = {
  typecheck: { ok: false, at: 0, errors: 0 },
  tests: { ok: false, at: 0, passed: 0, failed: 0 },
  build: { ok: false, at: 0 },
};
const FRESH_BUILD: BuildSnapshot = {
  typecheck: { ok: true, at: Date.now(), errors: 0 },
  tests: { ok: true, at: Date.now(), passed: 80, failed: 0 },
  build: { ok: true, at: Date.now() },
};
const EMPTY_AGENT: AgentSnapshot = { trust: {}, caps: [], costUsd: 0 };

async function makeFixture(): Promise<string> {
  const root = join(tmpdir(), `worldmodel-fixture-${Date.now()}`);
  await fs.mkdir(join(root, 'src'), { recursive: true });
  await fs.writeFile(join(root, 'src', 'a.ts'), `export function alpha() { return 1; }\nexport const X = 2;\n`);
  await fs.writeFile(join(root, 'src', 'b.ts'), `import { alpha } from './a';\nexport function beta() { return alpha(); }\n`);
  return root;
}

vDescribe('GraphView', () => {
  it('walks files, parses symbols, parses imports', async () => {
    const root = await makeFixture();
    const g = makeGraphView(root);
    await g.fresh();
    expect(g.files.length).toBe(2);
    expect(g.symbols.find((s) => s.name === 'alpha')).toBeTruthy();
    expect(g.symbols.find((s) => s.name === 'beta')).toBeTruthy();
    expect(g.imports.some((e) => e.specifiers.includes('alpha'))).toBe(true);
  });
  it('query finds callers via import edges', async () => {
    const root = await makeFixture();
    const g = makeGraphView(root);
    await g.fresh();
    const r = g.query({ symbol: 'alpha' });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.callers.some((c) => c.from.includes('b.ts'))).toBe(true);
  });
});

async function makeCtx(): Promise<WorldContext> {
  const root = await makeFixture();
  const g = makeGraphView(root);
  await g.fresh();
  return { graph: g, git: null, build: FRESH_BUILD, agent: EMPTY_AGENT };
}

vDescribe('query', () => {
  it('describe lists files + languages', async () => {
    const ctx = await makeCtx();
    const r = wDescribe(ctx);
    expect(r.message).toContain('2 files');
    expect(r.message).toContain('ts');
  });
  it('callers finds the import', async () => {
    const ctx = await makeCtx();
    const r = callers(ctx, 'alpha');
    expect(r.message).toContain('b.ts');
  });
  it('impact lists downstream', async () => {
    const ctx = await makeCtx();
    const r = impact(ctx, './a');
    expect(r.message.includes('b.ts') || r.message.includes('No downstream')).toBe(true);
  });
  it('know filters notes by topic', () => {
    const r = know({} as WorldContext, 'postgres', [
      'staging uses postgres 17',
      'token expiry is 24h',
      'we use redis for caching',
    ]);
    expect(r.message).toContain('postgres');
  });
  it('uncertain reports stale build when at=0', async () => {
    const ctx = await makeCtx();
    const stale = { ...ctx, build: STALE_BUILD };
    const r = uncertain(stale);
    expect(r.message).toContain('stale');
  });
  it('nextLikelyPrompt uses last verb + noun', () => {
    const r = nextLikelyPrompt({} as WorldContext, ['refactor the auth middleware']);
    expect(r.message.toLowerCase()).toContain('refactor');
  });
});
