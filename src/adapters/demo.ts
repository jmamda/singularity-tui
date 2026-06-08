/**
 * Demo adapter — simulates a streaming LLM response so first-time users can
 * try Singularity (boot screen, dispatch grammar, race bars, artifacts, etc.)
 * without installing any AI CLI or configuring any API keys.
 *
 * Active when no real adapter is available OR when the profile explicitly
 * specifies adapterId: 'demo'.
 */

import type { Adapter, AdapterEvent, SendOpts } from './types.js';

const FILLER = [
  'CONFIDENCE: 0.7\n\n',
  'Sure — here is a demo response so you can see what dispatching feels like.\n\n',
  '```python\n',
  'def fizzbuzz(n: int) -> str:\n',
  '    if n % 15 == 0: return "fizzbuzz"\n',
  '    if n % 3 == 0:  return "fizz"\n',
  '    if n % 5 == 0:  return "buzz"\n',
  '    return str(n)\n',
  '```\n\n',
  'NOTE: this is the demo adapter — install `claude`, `opencode`, or `codex` for real responses.\n',
];

export const demoAdapter: Adapter = {
  id: 'demo',
  label: 'DEMO',
  kind: 'cli',
  async available() {
    return true;
  },
  async *send(prompt: string, _opts: SendOpts = {}): AsyncIterable<AdapterEvent> {
    yield { type: 'status', status: 'ENGAGED' };
    // First emit a small acknowledgment of the prompt so quorum/relay still feel right.
    const head = prompt.slice(0, 80).replace(/\n/g, ' ');
    if (head) yield { type: 'token', text: `> ${head}\n\n` };
    for (const chunk of FILLER) {
      yield { type: 'token', text: chunk };
      await new Promise((r) => setTimeout(r, 60));
    }
    // Fake cost so the meter shows something.
    yield { type: 'cost', tokensIn: Math.max(1, Math.ceil(prompt.length / 4)), tokensOut: 80, usd: 0.0002 };
    yield { type: 'status', status: 'DONE' };
  },
  async stop() {},
};
