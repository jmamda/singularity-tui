import { spawn, type ChildProcess } from 'node:child_process';
import type { Adapter, AdapterEvent, SendOpts } from './types.js';
import { which } from '../lib/which.js';

// Rough Claude Sonnet 4.6 pricing for /cost approximation (per million tokens).
const PRICE_IN = 3.0;
const PRICE_OUT = 15.0;

let proc: ChildProcess | null = null;

export const claudeAdapter: Adapter = {
  id: 'claude',
  label: 'CLAUDE',
  kind: 'cli',
  async available() {
    return which('claude');
  },
  async *send(prompt: string, opts: SendOpts = {}): AsyncIterable<AdapterEvent> {
    yield { type: 'status', status: 'ENGAGED' };

    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
    if (opts.resumeId) args.push('--resume', opts.resumeId);
    if (opts.persona) args.push('--append-system-prompt', opts.persona);

    proc = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const child = proc;

    const queue: AdapterEvent[] = [];
    let resolveNext: ((value: IteratorResult<AdapterEvent>) => void) | null = null;
    let done = false;

    const push = (ev: AdapterEvent) => {
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: ev, done: false });
      } else {
        queue.push(ev);
      }
    };

    let buffer = '';
    let tokensIn = 0;
    let tokensOut = 0;

    child.stdout!.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.type === 'system' && obj.session_id) {
            push({ type: 'session', sessionId: obj.session_id });
          }
          if (obj.type === 'assistant' && obj.message?.content) {
            for (const block of obj.message.content) {
              if (block.type === 'text' && block.text) {
                push({ type: 'token', text: block.text });
              }
            }
            if (obj.message.usage) {
              tokensIn += obj.message.usage.input_tokens ?? 0;
              tokensOut += obj.message.usage.output_tokens ?? 0;
            }
          }
        } catch {
          push({ type: 'token', text: line + '\n' });
        }
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      push({ type: 'error', message: chunk.toString('utf8') });
    });

    const finish = () => {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined, done: true });
      }
    };

    child.on('error', (e) => {
      if (done) return;
      push({ type: 'error', message: String(e) });
      push({ type: 'status', status: 'FAULT' });
      finish();
    });

    child.on('exit', (code: number | null) => {
      if (done) return;
      const usd = (tokensIn * PRICE_IN + tokensOut * PRICE_OUT) / 1_000_000;
      push({ type: 'cost', tokensIn, tokensOut, usd });
      push({ type: 'status', status: code === 0 ? 'DONE' : 'FAULT' });
      finish();
    });

    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (done) return;
      const ev = await new Promise<IteratorResult<AdapterEvent>>((resolve) => {
        resolveNext = resolve;
      });
      if (ev.done) return;
      yield ev.value;
    }
  },
  async stop() {
    if (proc && !proc.killed) proc.kill('SIGTERM');
    proc = null;
  },
};
