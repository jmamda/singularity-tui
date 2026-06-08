import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ItermSession } from './launch.js';

const DIR = join(homedir(), '.singularity');
const FILE = join(DIR, 'state.json');

export interface PersistedState {
  sessions: ItermSession[];
  createdAt: number;
}

export async function saveState(state: PersistedState): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function loadState(): Promise<PersistedState | null> {
  try {
    const text = await fs.readFile(FILE, 'utf8');
    return JSON.parse(text) as PersistedState;
  } catch {
    return null;
  }
}

export async function clearState(): Promise<void> {
  try {
    await fs.unlink(FILE);
  } catch {
    // ignore
  }
}
