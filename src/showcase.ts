/**
 * `singularity showcase` — a scripted walkthrough that exercises every operator
 * deterministically for screen recording (asciinema) without needing any AI
 * CLI installed. Streams to stdout; no TUI, no provider calls.
 */

const STEPS: Array<{ prompt: string; output: string; delay?: number }> = [
  {
    prompt: '',
    output: `\n● SINGULARITY CLI — SHOWCASE\n────────────────────────────\nDeterministic walkthrough. No models called. No keys needed.\nFor the real UI: \`npm run dev\` or \`npx singularity-tui --demo\`.\n\n`,
  },
  {
    prompt: 'fizzbuzz in python',
    output:
      `▶ TARGETS: [1] DEMO-1\n[1] streaming...\n` +
      'CONFIDENCE: 0.9\n```python\ndef fizzbuzz(n: int) -> str:\n    if n % 15 == 0: return "fizzbuzz"\n    if n % 3 == 0:  return "fizz"\n    if n % 5 == 0:  return "buzz"\n    return str(n)\n```\nNOTE: this is the demo\n[done · cost: $0.0002]\n',
  },
  {
    prompt: '!implement fizzbuzz in three languages',
    output: `\n▶ BROADCAST · all eligible panes\n────────────────────────────────────\nDEMO-1 ████████████████░░░░ 80%  120 t/s\nDEMO-2 ██████████░░░░░░░░░░ 50%   89 t/s\nDEMO-3 ███████████████░░░░░ 75%  102 t/s\n────────────────────────────────────\n[3 artifacts collected → slot 4]\n  #1 python · def fizzbuzz(n)\n  #2 typescript · const fizzbuzz = (n) =>\n  #3 rust · fn fizzbuzz(n: u32)\n\n`,
  },
  {
    prompt: '?is shipping a refactor on Friday afternoon a good idea',
    output: `\n▶ QUORUM · "is shipping on Friday safe"\n────────────────────────────────────\n[1] DEMO-1   NO  — Friday refactors concentrate weekend risk\n[2] DEMO-2   NO  — limited team coverage if it breaks\n[3] DEMO-3   YES — small changes are fine; ship the small ones\n────────────────────────────────────\nverdict: NO (2Y · 1N · 0—) w(0.9/1.7)\n\n`,
  },
  {
    prompt: '>>3 review #1 for edge cases',
    output: `\n▶ artifact #1 → pane [3] DEMO-3\n[3] streaming...\nCONFIDENCE: 0.7\nLooks correct. Missing: negative n, zero, large n overflow.\nCOMMENT-ON: #1 :: handle n <= 0 explicitly\n[done · cost: $0.0001]\n\n`,
  },
  {
    prompt: '@plan migrate the user table to postgres 17',
    output: `\n▶ @plan · planner=[1] DEMO-1\n[1] producing plan...\n\`\`\`json\n{ "steps": [\n  { "slot": 2, "task": "write the migration SQL with backfill" },\n  { "slot": 3, "task": "review the migration for backwards-compatibility" }\n] }\n\`\`\`\n→ dispatching 2 plan step(s)\n  [2] streaming the migration...\n  [3] reviewing for backwards-compat...\n\n`,
  },
  {
    prompt: '/grant 5 exec:^npm test 600',
    output: `\n· granted exec:^npm test → slot 5 (600s)\n  PC capability chips: [5] X:^npm test  600s\n\n`,
  },
  {
    prompt: '5 npm test',
    output: `\n▶ TARGETS: [5] PC\n[5] ENGAGED · sentinel: ok · journaled\nrunning npm test...\n  Test Files  14 passed\n      Tests  80 passed (80)\n[done · cost: $0]\n  trust [5] → 55%\n\n`,
  },
  {
    prompt: '/rollback root',
    output: `\n· rolled back: 0 restored · 0 deleted  (clean session)\n\n`,
  },
  {
    prompt: '',
    output: `\n────────────────────────────\nThat's the dispatch grammar.\nFull TUI: \`npm run dev\` or \`npx singularity-tui --demo\`.\nManifesto: docs/manifesto.md\nPatterns: PATTERNS.md\n────────────────────────────\n`,
  },
];

export async function runShowcase(opts: { fast?: boolean } = {}): Promise<void> {
  const charDelay = opts.fast ? 0 : 8;
  const stepGap = opts.fast ? 100 : 700;
  for (const step of STEPS) {
    if (step.prompt) {
      process.stdout.write(`\n▌ `);
      for (const ch of step.prompt) {
        process.stdout.write(ch);
        if (charDelay > 0) await new Promise((r) => setTimeout(r, charDelay));
      }
      process.stdout.write('\n');
      await new Promise((r) => setTimeout(r, 200));
    }
    process.stdout.write(step.output);
    await new Promise((r) => setTimeout(r, step.delay ?? stepGap));
  }
}
