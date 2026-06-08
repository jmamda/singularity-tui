import { promises as fs } from 'node:fs';
import { ENV_FILE, DIR } from './paths.js';

/** Read ~/.singularity/.env and merge into process.env (does not override existing values). */
export async function loadEnvFile(): Promise<void> {
  try {
    const text = await fs.readFile(ENV_FILE, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      const key = m[1]!;
      let val = m[2]!;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // file missing is fine
  }
}

export async function upsertEnvFile(key: string, value: string): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  let lines: string[] = [];
  try {
    const text = await fs.readFile(ENV_FILE, 'utf8');
    lines = text.split('\n').filter((l) => !l.match(new RegExp(`^\\s*${key}\\s*=`, 'i')));
  } catch {
    // new file
  }
  // strip trailing empties
  while (lines.length && !lines[lines.length - 1]!.trim()) lines.pop();
  lines.push(`${key}=${value}`);
  await fs.writeFile(ENV_FILE, lines.join('\n') + '\n', 'utf8');
}
