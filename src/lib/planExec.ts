import type { Slot } from '../store.js';

export interface PlanStep {
  slot: Slot;
  task: string;
  dependsOn?: number;
}

/**
 * Extract structured plan steps from a planner's response.
 * Accepts:
 *   1. A JSON code block matching: { "steps": [{ "slot": 2, "task": "..." }, ...] }
 *   2. Numbered lines like "1. [pane 2] write the tests"
 */
export function extractPlan(text: string): PlanStep[] {
  // Try JSON code block first
  const jsonMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]!);
      if (Array.isArray(parsed?.steps)) {
        return parsed.steps
          .filter((s: any) => Number.isInteger(s.slot) && typeof s.task === 'string')
          .map((s: any) => ({
            slot: s.slot as Slot,
            task: s.task,
            dependsOn: typeof s.dependsOn === 'number' ? s.dependsOn : undefined,
          }));
      }
    } catch {
      // fall through to numbered-line fallback
    }
  }

  // Numbered-line fallback: "1. [pane 2] do the thing"
  const steps: PlanStep[] = [];
  const lineRe = /^\s*\d+\.\s*\[pane\s*(\d)\]\s*(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(text))) {
    const slot = Number(m[1]) as Slot;
    if (slot >= 1 && slot <= 4) {
      steps.push({ slot, task: m[2]!.trim() });
    }
  }
  return steps;
}

export const PLANNER_INSTRUCTION = `You are the planner in a 4-pane AI war-room.
Available worker panes (by slot number) and their roles:

The user will give you a goal. Output ONLY a JSON code block of the form:

\`\`\`json
{ "steps": [
  { "slot": 2, "task": "write the failing test for the new endpoint" },
  { "slot": 3, "task": "review the test for edge cases" }
] }
\`\`\`

Do not include any prose outside the code block. Each step's "slot" must be 1-4.
`;
