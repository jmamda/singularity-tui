/**
 * HTTP server mode (`singularity serve --http [--port 7777]`).
 *
 * Exposes the dispatch grammar over a small REST API with SSE streaming, plus
 * a typed OpenAPI document at /openapi.json. Symmetric to opencode's `serve`
 * subcommand. Auth via Bearer header against SINGULARITY_SERVER_PASSWORD.
 *
 * Routes:
 *   GET  /                     — embedded web UI
 *   GET  /openapi.json         — machine-readable spec
 *   GET  /panes                — list configured adapters
 *   POST /dispatch             — { adapter, prompt } → SSE stream of AdapterEvents
 *   GET  /grammar              — dispatch grammar JSON
 *
 * Binds 127.0.0.1 by default; a non-loopback host requires
 * SINGULARITY_SERVER_PASSWORD to be set.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { packageVersion } from './lib/version.js';
import { claudeAdapter } from './adapters/claude.js';
import { opencodeAdapter } from './adapters/opencode.js';
import { codexAdapter } from './adapters/codex.js';
import { langgraphAdapter } from './adapters/langgraph.js';
import type { Adapter } from './adapters/types.js';
import { GRAMMAR } from './lib/grammar.js';

const ADAPTERS: Record<string, Adapter> = {
  claude: claudeAdapter,
  opencode: opencodeAdapter,
  codex: codexAdapter,
  langgraph: langgraphAdapter,
};

const WEB_UI_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Singularity CLI</title>
<style>
  body { background: #000; color: #d0d0d0; font: 14px/1.4 ui-monospace, "Menlo", monospace; margin: 0; padding: 24px; }
  h1 { color: #ff2a2a; margin-top: 0; }
  .pane { border: 1px solid #444; padding: 12px; margin-bottom: 12px; }
  .label { color: #00ff66; font-weight: bold; }
  input, button { font: inherit; background: #111; color: #d0d0d0; border: 1px solid #444; padding: 6px 10px; }
  button { color: #ff2a2a; cursor: pointer; }
  #out { white-space: pre-wrap; min-height: 200px; border: 1px solid #444; padding: 12px; margin-top: 12px; }
  a { color: #00ff66; }
</style></head><body>
  <h1>● SINGULARITY // WEB</h1>
  <p>HTTP companion. The full TUI lives in the terminal — this page exposes the dispatch grammar over the network. See <a href="/openapi.json">/openapi.json</a>.</p>
  <div class="pane">
    <label>Adapter: <select id="adapter"></select></label>
    <label>Prompt: <input id="prompt" size="60" placeholder="answer in one sentence: what is 2+2"></label>
    <button onclick="dispatch()">Dispatch (SSE)</button>
  </div>
  <div id="out"></div>
  <script>
    fetch('/panes').then(r => r.json()).then(panes => {
      const sel = document.getElementById('adapter');
      panes.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.label;
        sel.appendChild(opt);
      });
    });
    async function dispatch() {
      const out = document.getElementById('out');
      out.textContent = '';
      const adapter = document.getElementById('adapter').value;
      const prompt = document.getElementById('prompt').value;
      const r = await fetch('/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ adapter, prompt })
      });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf('\\n\\n')) >= 0) {
          const event = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          for (const line of event.split('\\n')) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              if (data === '[DONE]') return;
              try {
                const ev = JSON.parse(data);
                if (ev.type === 'token') out.textContent += ev.text;
                else if (ev.type === 'status') out.textContent += '\\n[' + ev.status + ']';
                else if (ev.type === 'cost') out.textContent += '\\n[cost: $' + ev.usd.toFixed(4) + ']';
              } catch {}
            }
          }
        }
      }
    }
  </script>
</body></html>`;

const OPENAPI = {
  openapi: '3.0.3',
  info: {
    title: 'Singularity CLI HTTP API',
    version: packageVersion(),
    description: 'Dispatch grammar over HTTP. SSE streams for live token output.',
  },
  paths: {
    '/grammar': {
      get: {
        summary: 'Dispatch grammar (operators + meaning)',
        responses: { '200': { description: 'Grammar JSON' } },
      },
    },
    '/dispatch': {
      post: {
        summary: 'Send a prompt to a single adapter and stream the response (SSE)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['adapter', 'prompt'],
                properties: {
                  adapter: { type: 'string', enum: Object.keys(ADAPTERS) },
                  prompt: { type: 'string' },
                  persona: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'text/event-stream of AdapterEvent objects' } },
      },
    },
    '/panes': {
      get: { summary: 'List configured adapters', responses: { '200': { description: 'JSON' } } },
    },
  },
};

import { timingSafeEqual, createHash } from 'node:crypto';

function authOk(req: IncomingMessage): boolean {
  const required = process.env.SINGULARITY_SERVER_PASSWORD;
  if (!required) return true;
  const got = (req.headers.authorization ?? '').replace(/^Bearer\s+/, '');
  // Hash both sides so the compare is constant-time without leaking length.
  const a = createHash('sha256').update(got).digest();
  const b = createHash('sha256').update(required).digest();
  return timingSafeEqual(a, b);
}

const MAX_BODY = 256 * 1024; // 256KB request body cap

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = chunk as Buffer;
    size += b.length;
    if (size > MAX_BODY) throw new Error(`request body exceeds ${MAX_BODY} bytes`);
    chunks.push(b);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!authOk(req)) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }
  const url = req.url ?? '/';
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(WEB_UI_HTML);
    return;
  }
  if (url === '/openapi.json') return json(res, 200, OPENAPI);
  if (url === '/grammar') return json(res, 200, GRAMMAR);
  if (url === '/panes')
    return json(
      res,
      200,
      Object.entries(ADAPTERS).map(([id, a]) => ({ id, label: a.label })),
    );

  if (req.method === 'POST' && url === '/dispatch') {
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return json(res, 400, { error: 'invalid json body' });
    }
    if (typeof body !== 'object' || body === null) {
      return json(res, 400, { error: 'body must be a JSON object' });
    }
    const { adapter: adapterId, prompt, persona } = body as Record<string, unknown>;
    if (typeof adapterId !== 'string') return json(res, 400, { error: 'adapter must be a string' });
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return json(res, 400, { error: 'prompt must be a non-empty string' });
    }
    if (persona !== undefined && typeof persona !== 'string') {
      return json(res, 400, { error: 'persona must be a string' });
    }
    const adapter = ADAPTERS[adapterId];
    if (!adapter || !adapter.send) return json(res, 400, { error: 'unknown adapter' });
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    let closed = false;
    res.on('close', () => {
      closed = true;
      // Stop the underlying CLI process — don't keep burning tokens for a gone client.
      void adapter.stop().catch(() => {});
    });
    for await (const ev of adapter.send(prompt, { persona })) {
      if (closed) break;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    }
    if (!closed) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
    return;
  }

  json(res, 404, { error: 'not found' });
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/** Build the server without binding — lets tests listen on an ephemeral port and close it. */
export function createHttpServer() {
  return createServer((req, res) =>
    handle(req, res).catch((e) => {
      // Log full error server-side; return a generic message on the wire.
      process.stderr.write(
        `[http] handler error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
      );
      json(res, 500, { error: 'internal error' });
    }),
  );
}

export async function runHttpServer(port = 7777, host?: string): Promise<void> {
  const bindHost = host ?? process.env.SINGULARITY_SERVER_HOST ?? '127.0.0.1';
  if (!LOOPBACK_HOSTS.has(bindHost) && !process.env.SINGULARITY_SERVER_PASSWORD) {
    process.stderr.write(
      `refusing to bind ${bindHost} without auth — set SINGULARITY_SERVER_PASSWORD to expose the server beyond loopback\n`,
    );
    process.exit(2);
  }
  const server = createHttpServer();
  await new Promise<void>((resolve) => server.listen(port, bindHost, resolve));
  process.stdout.write(`● singularity http on ${bindHost}:${port}\n`);
  process.stdout.write(
    `  GET  /openapi.json\n  GET  /grammar\n  GET  /panes\n  POST /dispatch (SSE)\n`,
  );
  if (process.env.SINGULARITY_SERVER_PASSWORD) {
    process.stdout.write(
      `  Auth: Bearer ${'*'.repeat(8)} required (SINGULARITY_SERVER_PASSWORD set)\n`,
    );
  } else {
    process.stdout.write(`  Auth: none (set SINGULARITY_SERVER_PASSWORD to require Bearer)\n`);
  }
  await new Promise(() => {});
}
