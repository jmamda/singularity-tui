import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { SNIPPETS_DIR } from './paths.js';

export async function loadSnippet(name: string): Promise<string | null> {
  try {
    const safe = name.replace(/[^a-z0-9_-]/gi, '');
    return await fs.readFile(join(SNIPPETS_DIR, `${safe}.txt`), 'utf8');
  } catch {
    return null;
  }
}

export async function saveSnippet(name: string, body: string): Promise<void> {
  const safe = name.replace(/[^a-z0-9_-]/gi, '');
  if (!safe) throw new Error('invalid snippet name');
  await fs.mkdir(SNIPPETS_DIR, { recursive: true });
  await fs.writeFile(join(SNIPPETS_DIR, `${safe}.txt`), body, 'utf8');
}

export async function listSnippets(): Promise<string[]> {
  try {
    const entries = await fs.readdir(SNIPPETS_DIR);
    return entries.filter((e) => e.endsWith('.txt')).map((e) => e.slice(0, -4));
  } catch {
    return [];
  }
}
