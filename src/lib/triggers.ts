/**
 * OS event triggers (#9). Singularity reacts to events instead of waiting for
 * typing. Triggers live in ~/.singularity/triggers.json and are loaded by the
 * daemon (`singularity daemon`) or, in TUI mode, can be re-imported via the
 * /triggers slash command.
 *
 * Three event sources to start:
 *   fs:change      — watch a directory; debounce changes (chokidar-less,
 *                    uses fs.watch).
 *   time:interval  — every N seconds.
 *   git:commit     — poll `git log -1 --format=%H`; fire when it changes.
 *
 * Each trigger has a prompt template that may include {{...}} placeholders
 * (e.g. {{file}}, {{interval}}, {{commit}}).
 */

import { promises as fs, watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { DIR } from './paths.js';

export type EventSource = 'fs:change' | 'time:interval' | 'git:commit';

export interface TriggerSpec {
  id: string;
  source: EventSource;
  /** dir for fs:change, seconds for time:interval, cwd for git:commit */
  match: string;
  /** slot to dispatch to */
  slot: number;
  /** prompt template, supports {{file}}, {{commit}}, etc */
  prompt: string;
  /** debounce ms (fs:change) */
  debounceMs?: number;
}

const TRIGGERS_FILE = join(DIR, 'triggers.json');

export async function loadTriggers(): Promise<TriggerSpec[]> {
  try {
    const raw = await fs.readFile(TRIGGERS_FILE, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveTriggers(triggers: TriggerSpec[]): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(TRIGGERS_FILE, JSON.stringify(triggers, null, 2), 'utf8');
}

export type Dispatcher = (slot: number, prompt: string) => void;

interface RunningTrigger {
  spec: TriggerSpec;
  stop: () => void;
}

export class TriggerRunner {
  private running: RunningTrigger[] = [];

  constructor(private dispatcher: Dispatcher) {}

  start(spec: TriggerSpec): void {
    if (spec.source === 'fs:change') this.startFsWatch(spec);
    else if (spec.source === 'time:interval') this.startInterval(spec);
    else if (spec.source === 'git:commit') this.startGitPoll(spec);
  }

  private startFsWatch(spec: TriggerSpec): void {
    let timer: NodeJS.Timeout | null = null;
    let lastFile = '';
    const watcher = watch(spec.match, { recursive: true }, (_evt, file) => {
      if (!file || typeof file !== 'string') return;
      if (file.startsWith('.') || file.includes('node_modules') || file.includes('dist/')) return;
      lastFile = file;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const p = spec.prompt.replace(/\{\{file\}\}/g, lastFile);
        this.dispatcher(spec.slot, p);
      }, spec.debounceMs ?? 700);
    });
    this.running.push({ spec, stop: () => watcher.close() });
  }

  private startInterval(spec: TriggerSpec): void {
    const secs = Number(spec.match);
    if (!Number.isFinite(secs) || secs <= 0) return;
    const t = setInterval(() => {
      this.dispatcher(spec.slot, spec.prompt.replace(/\{\{interval\}\}/g, String(secs)));
    }, secs * 1000);
    this.running.push({ spec, stop: () => clearInterval(t) });
  }

  private startGitPoll(spec: TriggerSpec): void {
    let last: string | null = null;
    const tick = () => {
      const p = spawn('git', ['log', '-1', '--format=%H'], { cwd: spec.match });
      let out = '';
      p.stdout.on('data', (c) => (out += c.toString('utf8')));
      p.on('exit', () => {
        const head = out.trim();
        if (!head) return;
        if (last !== null && head !== last) {
          this.dispatcher(spec.slot, spec.prompt.replace(/\{\{commit\}\}/g, head));
        }
        last = head;
      });
    };
    tick();
    const t = setInterval(tick, 5000);
    this.running.push({ spec, stop: () => clearInterval(t) });
  }

  stopAll(): void {
    for (const r of this.running) {
      try {
        r.stop();
      } catch {
        /* ignore */
      }
    }
    this.running = [];
  }
}
