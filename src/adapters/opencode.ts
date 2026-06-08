import type { AdapterEvent } from './types.js';
import { makeSpawnCliAdapter } from './spawnCli.js';

// sst/opencode — `opencode run --format json "<message>"` emits one JSON event
// per line (step_start, text, etc). We surface text events as tokens and
// capture the sessionID for --session multi-turn resume.
export const opencodeAdapter = makeSpawnCliAdapter({
  id: 'opencode',
  label: 'OPENCODE',
  command: 'opencode',
  argsForPrompt: (prompt, opts) => {
    const args = ['run', '--format', 'json'];
    if (opts.resumeId) args.push('--session', opts.resumeId);
    args.push(prompt);
    return args;
  },
  parseLine: (line) => {
    if (!line.trim()) return null;
    try {
      const obj = JSON.parse(line);
      const events: AdapterEvent[] = [];
      // First event with a sessionID — surface it for resume
      if (obj.sessionID) {
        events.push({ type: 'session', sessionId: obj.sessionID });
      }
      if (obj.type === 'text' && typeof obj.part?.text === 'string') {
        events.push({ type: 'token', text: obj.part.text });
      }
      return events.length ? events : null;
    } catch {
      // Non-JSON line — treat as raw token (rare)
      return { type: 'token', text: line + '\n' };
    }
  },
  // opencode prints ANSI session-header noise to stderr; not actually errors.
  squelchStderr: true,
  // opencode has no --system flag; inline persona into the prompt.
  inlinePersona: true,
  // Default to Sonnet-class pricing; override per profile if needed.
  pricing: { inPerM: 3.0, outPerM: 15.0 },
});
