import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_DIR } from './paths.js';
import type { Slot } from '../store.js';

export async function loadHistory(slot: Slot): Promise<string[]> {
  try {
    const text = await fs.readFile(join(HISTORY_DIR, `${slot}.json`), 'utf8');
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveHistory(slot: Slot, items: string[]): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.writeFile(join(HISTORY_DIR, `${slot}.json`), JSON.stringify(items.slice(-100)), 'utf8');
}
