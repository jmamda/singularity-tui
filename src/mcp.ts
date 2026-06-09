import { claudeAdapter } from './adapters/claude.js';
import { opencodeAdapter } from './adapters/opencode.js';
import { codexAdapter } from './adapters/codex.js';
import { antigravityAdapter } from './adapters/antigravity.js';
import { langgraphAdapter } from './adapters/langgraph.js';
import type { Adapter } from './adapters/types.js';

const ADAPTERS: Adapter[] = [
  claudeAdapter,
  opencodeAdapter,
  codexAdapter,
  antigravityAdapter,
  langgraphAdapter,
];

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: any;
}

function send(msg: object): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id: any, result: any): void {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id: any, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function callTool(name: string, args: any): Promise<any> {
  // Singularity self-modify tools — gated by an in-process meta capability.
  // Outside callers cannot grant meta caps over the wire; only the human user
  // running the TUI can. (#10 self-mod MCP.)
  if (name.startsWith('singularity_')) {
    const { runSelfModTool } = await import('./lib/selfMod.js');
    return runSelfModTool(name, args);
  }
  const m = name.match(/^dispatch_(.+)$/);
  if (!m) throw new Error(`unknown tool: ${name}`);
  const adapterId = m[1]!;
  const adapter = ADAPTERS.find((a) => a.id === adapterId);
  if (!adapter || !adapter.send) throw new Error(`no dispatchable adapter: ${adapterId}`);
  const prompt = String(args?.prompt ?? '');
  const persona = args?.persona ? String(args.persona) : undefined;
  if (!prompt) throw new Error('prompt required');

  let out = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;
  let status = 'UNKNOWN';

  for await (const ev of adapter.send(prompt, { persona })) {
    if (ev.type === 'token') out += ev.text;
    else if (ev.type === 'status') status = ev.status;
    else if (ev.type === 'error') out += `[err] ${ev.message}\n`;
    else if (ev.type === 'cost') {
      tokensIn += ev.tokensIn;
      tokensOut += ev.tokensOut;
      costUsd += ev.usd;
    }
  }
  return {
    content: [{ type: 'text', text: out.trim() }],
    metadata: { adapter: adapterId, status, tokensIn, tokensOut, costUsd },
  };
}

function toolList() {
  const dispatchTools = ADAPTERS.filter((a) => a.send).map((a) => ({
    name: `dispatch_${a.id}`,
    description: `Dispatch a prompt to the ${a.label} pane. Returns the streamed text response and metrics.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to send.' },
        persona: { type: 'string', description: 'Optional system-prompt prefix.' },
      },
      required: ['prompt'],
    },
  }));
  const selfModTools = [
    {
      name: 'singularity_set_persona',
      description:
        "Set a pane's persona. Requires the caller to hold a meta:configure capability for the target slot.",
      inputSchema: {
        type: 'object',
        properties: {
          slot: { type: 'number' },
          persona: { type: 'string' },
        },
        required: ['slot', 'persona'],
      },
    },
    {
      name: 'singularity_grant_capability',
      description: 'Grant a capability to a pane. Requires meta:configure for the target slot.',
      inputSchema: {
        type: 'object',
        properties: {
          slot: { type: 'number' },
          kind: { type: 'string', enum: ['read', 'write', 'exec', 'net'] },
          pattern: { type: 'string' },
          seconds: { type: 'number' },
        },
        required: ['slot', 'kind', 'pattern'],
      },
    },
    {
      name: 'singularity_status',
      description: 'Read-only snapshot of panes, capabilities, trust. No meta cap required.',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
  return { tools: [...dispatchTools, ...selfModTools] };
}

export async function runMcpServer(): Promise<number> {
  process.stdin.setEncoding('utf8');
  const MAX_BUFFER = 8 * 1024 * 1024; // 8 MiB ceiling against unbounded peer input
  let buffer = '';
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    if (buffer.length > MAX_BUFFER) {
      // Drop oversized input, resync at next newline boundary.
      const nl = buffer.lastIndexOf('\n');
      buffer = nl >= 0 ? buffer.slice(nl + 1) : '';
      return;
    }
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: JsonRpcRequest;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      void handle(msg);
    }
  });
  return new Promise(() => {});
}

async function handle(msg: JsonRpcRequest): Promise<void> {
  try {
    if (msg.method === 'initialize') {
      reply(msg.id, {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'singularity', version: '0.2.0' },
        capabilities: { tools: {} },
      });
      return;
    }
    if (msg.method === 'tools/list') {
      reply(msg.id, toolList());
      return;
    }
    if (msg.method === 'tools/call') {
      const name = msg.params?.name as string;
      const args = msg.params?.arguments ?? {};
      const result = await callTool(name, args);
      reply(msg.id, result);
      return;
    }
    if (msg.method?.startsWith('notifications/')) return; // ignore notifications
    replyError(msg.id, -32601, `method not found: ${msg.method}`);
  } catch (e: any) {
    replyError(msg.id, -32000, String(e?.message ?? e));
  }
}
