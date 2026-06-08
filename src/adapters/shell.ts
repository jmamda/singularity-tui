/**
 * PC-as-pane — slot 5's adapter. The OS is a peer in the war-room: dispatchable,
 * observable, faultable. Every command runs only if the slot holds a matching
 * `exec` capability. The shell starts with zero capabilities — the user grants.
 *
 * The "prompt" sent to this adapter IS the command to run. Pre-processing
 * supports basic forms; complex pipes/redirects are explicitly out of scope and
 * should be moved to a script file (then `/grant 5 exec:bash my-script.sh`).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Adapter, AdapterEvent, SendOpts } from './types.js';
import { checkCapabilities, type Capability } from '../lib/capabilities.js';
import { sentinelVerdict, submitDualKey } from '../lib/sentinel.js';

// The shell adapter needs the capability list at dispatch time. We accept it
// via a registered getter to avoid coupling the adapter file to store.ts (which
// would create a cycle).
let capabilitiesGetter: (() => Capability[]) | null = null;
export function registerCapabilitiesGetter(getter: () => Capability[]): void {
  capabilitiesGetter = getter;
}

let proc: ChildProcess | null = null;

function getCaps(): Capability[] {
  return capabilitiesGetter ? capabilitiesGetter() : [];
}

export const shellAdapter: Adapter = {
  id: 'shell',
  label: 'PC',
  kind: 'cli',
  async available() {
    return true;
  },
  async *send(prompt: string, _opts: SendOpts = {}): AsyncIterable<AdapterEvent> {
    const cmd = prompt.trim();
    if (!cmd) {
      yield { type: 'error', message: 'empty command' };
      yield { type: 'status', status: 'FAULT' };
      return;
    }

    // Capability gate
    const check = checkCapabilities(getCaps(), {
      slot: 5,
      kind: 'exec',
      target: cmd,
    });
    if (!check.ok) {
      yield {
        type: 'error',
        message:
          `permission denied: ${check.reason}\n` +
          `grant with: /grant 5 exec:<regex matching this command>`,
      };
      yield { type: 'status', status: 'FAULT' };
      return;
    }

    // Sentinel pass: hard veto on certain patterns; dual-key requirement on others.
    const verdict = sentinelVerdict({ kind: 'exec', target: cmd, slot: 5 });
    if (!verdict.ok) {
      yield { type: 'error', message: `sentinel veto: ${verdict.reason}` };
      yield { type: 'status', status: 'FAULT' };
      return;
    }
    if (verdict.requiresDualKey) {
      const dk = submitDualKey({ kind: 'exec', target: cmd, slot: 5 });
      if (!dk.acknowledged) {
        yield {
          type: 'error',
          message: `${dk.reason} (id ${dk.id}). Have another pane propose the same exec to confirm.`,
        };
        yield { type: 'status', status: 'FAULT' };
        return;
      }
    }

    yield { type: 'status', status: 'ENGAGED' };

    // We deliberately do NOT use a shell here unless the user opts in via a
    // capability whose pattern starts with `bash:` — otherwise we tokenize.
    const useShell = check.capability?.pattern.startsWith('bash:') ?? false;
    proc = useShell
      ? spawn('bash', ['-lc', cmd], { stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(cmd.split(/\s+/)[0]!, cmd.split(/\s+/).slice(1), {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

    const child = proc;
    const queue: AdapterEvent[] = [];
    let resolveNext: ((v: IteratorResult<AdapterEvent>) => void) | null = null;
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
    const finish = () => {
      done = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined, done: true });
      }
    };

    child.stdout!.on('data', (c: Buffer) => push({ type: 'token', text: c.toString('utf8') }));
    child.stderr!.on('data', (c: Buffer) => push({ type: 'token', text: c.toString('utf8') }));
    child.on('error', (e) => {
      if (done) return;
      push({ type: 'error', message: String(e) });
      push({ type: 'status', status: 'FAULT' });
      finish();
    });
    child.on('exit', (code: number | null) => {
      if (done) return;
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
