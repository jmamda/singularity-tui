import type { Artifact } from './artifacts.js';

/**
 * COMMENT-ON: <ref> :: <text>
 *
 * <ref> can be:
 *   - #N    sequential number shown in the artifact pane
 *   - a substring of the artifact title (case-insensitive)
 *   - a substring of the artifact's source label (e.g. "CLAUDE")
 *
 * The separator can be `::`, `:`, or `—`. We're forgiving.
 */
const COMMENT_RE = /^\s*COMMENT[-_ ]ON\s*[:\-]\s*([^\n:]+?)\s*(?:::|—|:|-)\s*(.+?)\s*$/gim;

export interface ParsedComment {
  ref: string;
  text: string;
}

export function extractComments(text: string): ParsedComment[] {
  const out: ParsedComment[] = [];
  for (const m of text.matchAll(COMMENT_RE)) {
    const ref = (m[1] ?? '').trim();
    const body = (m[2] ?? '').trim();
    if (ref && body) out.push({ ref, text: body });
  }
  return out;
}

/**
 * Resolve a reference string to an artifact. Supports:
 *   - "#14" / "14"   → match by .seq
 *   - "calculate"     → case-insensitive substring of .title
 *   - "middleware.ts" → substring of .title or .content's first 200 chars
 *   - "claude"        → match by sourceLabel
 * Returns the most-recently-created match, or null if none.
 */
export function resolveArtifactRef(ref: string, artifacts: Artifact[]): Artifact | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  // #N or bare number
  const numMatch = trimmed.match(/^#?(\d+)$/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    return artifacts.find((a) => a.seq === n) ?? null;
  }

  const lc = trimmed.toLowerCase();
  // Walk newest-first
  for (let i = artifacts.length - 1; i >= 0; i--) {
    const a = artifacts[i]!;
    if ((a.title ?? '').toLowerCase().includes(lc)) return a;
    if (a.sourceLabel.toLowerCase() === lc) return a;
    if (a.content.slice(0, 200).toLowerCase().includes(lc)) return a;
  }
  return null;
}

export const COMMENT_HINT_FOR_MODEL =
  "To comment on another pane's artifact, emit `COMMENT-ON: #N :: <your critique or suggestion>` on its own line. Use the #N shown in [recent artifacts] (or the title) to refer to one. Use this for inline review, not for general discussion.";
