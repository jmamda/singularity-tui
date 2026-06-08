import { promises as fs } from 'node:fs';
import { DIR, TRUST_FILE } from './paths.js';

export async function loadTrust(): Promise<Record<number, number> | null> {
  try {
    const text = await fs.readFile(TRUST_FILE, 'utf8');
    const obj = JSON.parse(text);
    if (typeof obj !== 'object' || obj === null) return null;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(k);
      if (Number.isInteger(n) && typeof v === 'number' && v >= 0 && v <= 1) out[n] = v;
    }
    return out;
  } catch {
    return null;
  }
}

export async function saveTrust(trust: Record<number, number>): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(TRUST_FILE, JSON.stringify(trust, null, 2), 'utf8');
}
