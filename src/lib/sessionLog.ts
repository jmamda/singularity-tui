import { promises as fs } from 'node:fs';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { LOG_DIR } from './paths.js';
import type { Slot } from '../store.js';

export type LogEvent =
  | { kind: 'dispatch'; at: number; slot: Slot; prompt: string; persona?: string; broadcast?: boolean }
  | { kind: 'token'; at: number; slot: Slot; text: string }
  | { kind: 'status'; at: number; slot: Slot; status: string }
  | { kind: 'error'; at: number; slot: Slot; message: string }
  | { kind: 'cost'; at: number; slot: Slot; tokensIn: number; tokensOut: number; usd: number };

let stream: WriteStream | null = null;
let currentPath: string | null = null;

async function ensureStream(): Promise<WriteStream> {
  const dayPath = join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
  if (stream && currentPath === dayPath) return stream;
  if (stream) {
    stream.end();
    stream = null;
  }
  await fs.mkdir(LOG_DIR, { recursive: true });
  currentPath = dayPath;
  stream = createWriteStream(dayPath, { flags: 'a' });
  return stream;
}

export async function logEvent(ev: LogEvent): Promise<void> {
  const s = await ensureStream();
  s.write(JSON.stringify(ev) + '\n');
}

export function closeLog(): void {
  if (stream) {
    stream.end();
    stream = null;
    currentPath = null;
  }
}
