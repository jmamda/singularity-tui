/**
 * MCP client (#14) — connect to an external MCP server (stdio) and expose its
 * tools as a Singularity adapter. Symmetric counterpart to `src/mcp.ts`
 * (Singularity-as-server).
 *
 * Minimal JSON-RPC over stdio. Tool calls are issued sequentially.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface McpToolSpec {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpClientConfig {
  /** Display name (e.g. "fs", "github"). */
  name: string;
  /** Binary + argv to spawn. */
  command: string;
  args: string[];
  /** Optional env vars merged into child env. */
  env?: Record<string, string>;
}

export class McpClient {
  private proc: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private buf = '';
  public tools: McpToolSpec[] = [];

  constructor(public config: McpClientConfig) {}

  async start(): Promise<void> {
    this.proc = spawn(this.config.command, this.config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...(this.config.env ?? {}) },
    });
    this.proc.stdout!.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')));
    this.proc.stderr!.on('data', () => {
      /* discard server logs */
    });
    this.proc.on('exit', () => {
      this.proc = null;
      for (const { reject } of this.pending.values()) reject(new Error('mcp server exited'));
      this.pending.clear();
    });
    // Initialize handshake
    await this.call('initialize', {
      protocolVersion: '2024-11-05',
      clientInfo: { name: 'singularity', version: '0.3.0' },
      capabilities: {},
    });
    const list = await this.call('tools/list', {});
    this.tools = Array.isArray(list?.tools) ? list.tools : [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return await this.call('tools/call', { name, arguments: args });
  }

  async stop(): Promise<void> {
    if (this.proc && !this.proc.killed) this.proc.kill('SIGTERM');
    this.proc = null;
  }

  private onData(text: string): void {
    this.buf += text;
    let nl = this.buf.indexOf('\n');
    while (nl >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.handleLine(line);
      nl = this.buf.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    try {
      const msg = JSON.parse(line);
      if (typeof msg?.id === 'number' && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message ?? 'mcp error'));
        else p.resolve(msg.result);
      }
    } catch {
      /* ignore */
    }
  }

  private call(method: string, params: unknown): Promise<any> {
    if (!this.proc) return Promise.reject(new Error('mcp client not started'));
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    this.proc.stdin!.write(payload + '\n');
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`mcp call ${method} timed out`));
        }
      }, 30_000);
    });
  }
}
