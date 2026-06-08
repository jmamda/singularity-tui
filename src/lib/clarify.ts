/**
 * CLARIFY: — agent → human callback.
 *
 * Agents can emit `CLARIFY: <question>` on its own line when they need
 * information to complete their task. We extract those lines, pop them to the
 * user via the prompt bar, capture the answer, and dispatch a follow-up turn
 * to the same pane carrying the question + answer.
 */
const CLARIFY_RE = /^\s*CLARIFY\s*[:\-]\s*(.+?)\s*$/gim;

export interface ClarifyRequest {
  question: string;
  askedAt: number;
}

const MAX_QUESTION_LEN = 240;

export function extractClarifications(text: string): string[] {
  const out: string[] = [];
  const matches = text.matchAll(CLARIFY_RE);
  for (const m of matches) {
    const q = (m[1] ?? '').trim().slice(0, MAX_QUESTION_LEN);
    if (q) out.push(q);
  }
  return out;
}

export const CLARIFY_HINT_FOR_MODEL =
  'If you need information to answer well, emit `CLARIFY: <one specific question>` on its own line. Singularity will pause, ask the user, and resume your dispatch with the answer. Prefer this over guessing.';

/** Compose the follow-up prompt sent back to the pane after the user answers. */
export function clarifyFollowup(question: string, answer: string): string {
  return `[answer to your clarification]\nQ: ${question}\nA: ${answer}\n[/answer]\n\nContinue with the original task using this answer.`;
}
