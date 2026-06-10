import { spawn, type ChildProcess } from 'node:child_process';
import type { Adapter, AdapterEvent, SendOpts } from './types.js';
import { which } from '../lib/which.js';

export interface SpawnCliConfig {
  id: string;
  label: string;
  command: string;
  /** Build argv for a given prompt. Return null to skip dispatch (e.g., not supported). */
  argsForPrompt: (prompt: string, opts: SendOpts) => string[];
  /** Optional per-token-million pricing for cost approximation. */
  pricing?: { inPerM: number; outPerM: number };
  /** Optional line parser. Default: emit each line as a token event. */
  parseLine?: (line: string) => AdapterEvent | AdapterEvent[] | null;
  /** Extra environment variables for the child process. */
  env?: Record<string, string>;
  /** Optional helper to estimate output token count when pricing is set. */
  estimateTokens?: (text: string) => number;
  /** If true, suppress stderr (treat it as informational not error). */
  squelchStderr?: boolean;
  /** If true, inline opts.persona into the prompt (for adapters with no --system flag). */
  inlinePersona?: boolean;
  /** Kill the child if a dispatch runs longer than this. Default 10 minutes. */
  timeoutMs?: number;
}

const defaultEstimate = (text: string) => Math.max(1, Math.ceil(text.length / 4));

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const SIGKILL_GRACE_MS = 5_000;

/** SIGTERM, then SIGKILL if the process is still alive after a grace period. */
function killWithEscalation(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const killer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, SIGKILL_GRACE_MS);
  killer.unref();
}

export function makeSpawnCliAdapter(config: SpawnCliConfig): Adapter {
  // One adapter can have multiple in-flight dispatches (broadcast/race); track all.
  const procs = new Set<ChildProcess>();

  return {
    id: config.id,
    label: config.label,
    kind: 'cli',
    async available() {
      return which(config.command);
    },
    async *send(prompt: string, opts: SendOpts = {}): AsyncIterable<AdapterEvent> {
      yield { type: 'status', status: 'ENGAGED' };

      // Inline persona for adapters that don't natively support a system prompt.
      const effectivePrompt =
        config.inlinePersona && opts.persona
          ? `[system]\n${opts.persona}\n[/system]\n\n${prompt}`
          : prompt;
      const args = config.argsForPrompt(effectivePrompt, opts);
      const child = spawn(config.command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: config.env ? { ...process.env, ...config.env } : process.env,
      });
      procs.add(child);

      const queue: AdapterEvent[] = [];
      let resolveNext: ((value: IteratorResult<AdapterEvent>) => void) | null = null;
      let done = false;

      const push = (ev: AdapterEvent | AdapterEvent[]) => {
        const items = Array.isArray(ev) ? ev : [ev];
        for (const e of items) {
          if (resolveNext) {
            const r = resolveNext;
            resolveNext = null;
            r({ value: e, done: false });
          } else {
            queue.push(e);
          }
        }
      };

      let buffer = '';
      let outputText = '';
      const estimate = config.estimateTokens ?? defaultEstimate;
      const inTokens = estimate(effectivePrompt);

      const emitParsed = (line: string) => {
        const ev = config.parseLine!(line);
        if (!ev) return;
        // accumulate token text so cost estimation works for parseLine adapters too
        const items = Array.isArray(ev) ? ev : [ev];
        for (const e of items) {
          if (e.type === 'token') outputText += e.text;
        }
        push(ev);
      };

      child.stdout!.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        // If no custom parser, stream the chunk as-is (good for plain text).
        if (!config.parseLine) {
          push({ type: 'token', text: chunk.toString('utf8') });
          outputText += chunk.toString('utf8');
          return;
        }
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          emitParsed(line);
        }
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        if (config.squelchStderr) return;
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

      const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timeout = setTimeout(() => {
        if (done) return;
        push({ type: 'error', message: `dispatch timed out after ${timeoutMs}ms` });
        killWithEscalation(child);
      }, timeoutMs);
      timeout.unref();

      child.on('error', (e) => {
        if (done) return; // error + exit can both fire; first one wins
        push({ type: 'error', message: String(e) });
        push({ type: 'status', status: 'FAULT' });
        finish();
      });

      child.on('exit', (code: number | null) => {
        if (done) return;
        // Flush trailing buffer (no newline at EOF)
        if (buffer) {
          if (config.parseLine) {
            emitParsed(buffer);
          } else {
            push({ type: 'token', text: buffer });
            outputText += buffer;
          }
          buffer = '';
        }
        if (config.pricing && outputText) {
          const outTokens = estimate(outputText);
          const usd =
            (inTokens * config.pricing.inPerM + outTokens * config.pricing.outPerM) / 1_000_000;
          push({ type: 'cost', tokensIn: inTokens, tokensOut: outTokens, usd });
        }
        push({ type: 'status', status: code === 0 ? 'DONE' : 'FAULT' });
        finish();
      });

      try {
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
      } finally {
        // Runs on normal completion AND when the consumer abandons the
        // iterator (break/throw/stop) — never leave an orphaned child.
        clearTimeout(timeout);
        procs.delete(child);
        killWithEscalation(child);
      }
    },
    async stop() {
      for (const child of procs) killWithEscalation(child);
      procs.clear();
    },
  };
}
