import { promises as fs } from 'node:fs';
import { DIR, NOTES_FILE } from './paths.js';

export async function loadNotes(): Promise<string[]> {
  try {
    const text = await fs.readFile(NOTES_FILE, 'utf8');
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
    return [];
  } catch {
    return [];
  }
}

export async function saveNotes(notes: string[]): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf8');
}

/**
 * Build the [shared notes] block prepended to dispatches when notes is non-empty.
 */
export function notesBlock(notes: string[]): string {
  if (notes.length === 0) return '';
  const lines = notes.map((n) => `- ${n}`).join('\n');
  return `[shared notes]\n${lines}\n[/shared notes]`;
}
