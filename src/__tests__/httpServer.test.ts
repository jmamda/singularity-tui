import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createHttpServer } from '../httpServer.js';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createHttpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => vi.unstubAllEnvs());

describe('routes', () => {
  it('serves the OpenAPI doc with the real package version', async () => {
    const res = await fetch(`${base}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = await res.json();
    const pkg = await import('../../package.json', { with: { type: 'json' } });
    expect(doc.info.version).toBe(pkg.default.version);
  });

  it('lists adapters on /panes', async () => {
    const res = await fetch(`${base}/panes`);
    expect(res.status).toBe(200);
    const panes = await res.json();
    expect(panes.map((p: { id: string }) => p.id)).toContain('claude');
  });

  it('404s unknown paths', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });
});

describe('/dispatch validation', () => {
  const post = (body: string) =>
    fetch(`${base}/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

  it('rejects invalid JSON', async () => {
    const res = await post('not json');
    expect(res.status).toBe(400);
  });

  it('rejects a missing prompt', async () => {
    const res = await post(JSON.stringify({ adapter: 'claude' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/prompt/);
  });

  it('rejects a non-string adapter', async () => {
    const res = await post(JSON.stringify({ adapter: 7, prompt: 'hi' }));
    expect(res.status).toBe(400);
  });

  it('rejects an unknown adapter', async () => {
    const res = await post(JSON.stringify({ adapter: 'hal9000', prompt: 'open the doors' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown adapter/);
  });
});

describe('auth', () => {
  it('requires the bearer token when a password is set', async () => {
    vi.stubEnv('SINGULARITY_SERVER_PASSWORD', 'hunter2');
    expect((await fetch(`${base}/panes`)).status).toBe(401);
    const wrong = await fetch(`${base}/panes`, {
      headers: { authorization: 'Bearer wrong' },
    });
    expect(wrong.status).toBe(401);
    const right = await fetch(`${base}/panes`, {
      headers: { authorization: 'Bearer hunter2' },
    });
    expect(right.status).toBe(200);
  });
});
