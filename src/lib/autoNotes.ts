/**
 * Extract auto-promotable notes from arbitrary text. Two sources:
 *  1. Marker lines: NOTE: foo · IMPORTANT: foo · FACT: foo · CONTEXT: foo · REMEMBER: foo
 *  2. Bulleted items under a `## Notes` or `## Context` section heading.
 *
 * Returns deduped, trimmed, length-capped strings.
 */
const MARKER_RE = /^\s*(?:NOTE|IMPORTANT|FACT|CONTEXT|REMEMBER)\s*[:\-]\s*(.+?)\s*$/im;
const MARKER_RE_GLOBAL = /^\s*(?:NOTE|IMPORTANT|FACT|CONTEXT|REMEMBER)\s*[:\-]\s*(.+?)\s*$/gim;
const SECTION_RE = /^\s*##\s+(?:notes|context)\b\s*$/im;
const BULLET_RE = /^\s*(?:[-*•]|\d+\.)\s+(.+?)\s*$/;

const MAX_NOTE_LEN = 180;

function clean(s: string): string {
  return s.trim().replace(/\s+/g, ' ').slice(0, MAX_NOTE_LEN);
}

export function extractNotes(text: string): string[] {
  const out: string[] = [];

  // Marker lines anywhere
  const markerMatches = text.matchAll(MARKER_RE_GLOBAL);
  for (const m of markerMatches) {
    const note = clean(m[1] ?? '');
    if (note) out.push(note);
  }

  // Bulleted lines under a ## Notes / ## Context heading (until next ## or EOF)
  const lines = text.split('\n');
  let inSection = false;
  for (const line of lines) {
    if (/^\s*##\s+/.test(line)) {
      inSection = SECTION_RE.test(line);
      continue;
    }
    if (!inSection) continue;
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const note = clean(bullet[1] ?? '');
      if (note) out.push(note);
    }
  }

  // Dedupe (case-insensitive) preserving order
  const seen = new Set<string>();
  const result: string[] = [];
  for (const n of out) {
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(n);
  }
  return result;
}

/** Returns only notes from `incoming` that aren't already in `existing` (case-insensitive). */
export function newNotesOnly(incoming: string[], existing: string[]): string[] {
  const have = new Set(existing.map((n) => n.toLowerCase()));
  return incoming.filter((n) => !have.has(n.toLowerCase()));
}

export const MARKER_HINT_FOR_MODEL =
  'If you learn a fact that other panes should know (versions, paths, decisions, constraints), put it on its own line prefixed with `NOTE:` — Singularity auto-shares those across panes.';

// Re-exported for tests/debugging
export const _MARKER_RE = MARKER_RE;
