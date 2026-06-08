import { makeSpawnCliAdapter } from './spawnCli.js';

// OpenAI codex CLI — `codex exec "<prompt>"` runs non-interactively.
// Multi-turn isn't surfaced through Singularity yet (codex's session API
// differs from claude's --resume); each dispatch is a fresh run for now.
export const codexAdapter = makeSpawnCliAdapter({
  id: 'codex',
  label: 'CODEX',
  command: 'codex',
  // --skip-git-repo-check: don't bail when launched outside a git tree.
  // --sandbox read-only: don't prompt for trust on the cwd; we're just chatting,
  //   not letting the agent shell out.
  argsForPrompt: (prompt) => ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', prompt],
  // codex prints metadata sections to stderr (`exec`, `codex`, `tokens used`)
  // — those are informational, not errors. Mute them.
  squelchStderr: true,
  // codex has no --system flag; inline persona into the prompt.
  inlinePersona: true,
  // GPT-5-class pricing as a reasonable default; adjust per profile if needed.
  pricing: { inPerM: 1.25, outPerM: 10.0 },
});
