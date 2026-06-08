import type { Adapter, AdapterEvent } from './types.js';
import { makeSpawnCliAdapter } from './spawnCli.js';

// Antigravity 2.0 — Google's agentic dev tool. Its CLI surface isn't pinned
// down in Singularity's source. Configure via env vars instead of hardcoding:
//
//   SINGULARITY_ANTIGRAVITY_CMD   — the binary name (e.g. "antigravity", "ag")
//   SINGULARITY_ANTIGRAVITY_ARGS  — JSON array of args, with __PROMPT__ as the
//                                    placeholder, e.g. '["run","--prompt","__PROMPT__"]'
//
// When unset, the pane stays OFFLINE with a hint in the body.

const ENV_CMD = process.env.SINGULARITY_ANTIGRAVITY_CMD;
const ENV_ARGS = process.env.SINGULARITY_ANTIGRAVITY_ARGS;

function parseArgsTemplate(): string[] | null {
  if (!ENV_ARGS) return ['exec', '__PROMPT__'];
  try {
    const arr = JSON.parse(ENV_ARGS);
    if (Array.isArray(arr) && arr.every((a) => typeof a === 'string')) return arr;
    return null;
  } catch {
    return null;
  }
}

function makeFallback(): Adapter {
  return {
    id: 'antigravity',
    label: 'ANTIGRAVITY',
    kind: 'cli',
    async available() {
      return false;
    },
    async *send(): AsyncIterable<AdapterEvent> {
      yield {
        type: 'error',
        message:
          'Antigravity not configured. Set SINGULARITY_ANTIGRAVITY_CMD and (optionally) SINGULARITY_ANTIGRAVITY_ARGS to enable.',
      };
      yield { type: 'status', status: 'OFFLINE' };
    },
    async stop() {},
  };
}

function makeConfigured(cmd: string, template: string[]): Adapter {
  return makeSpawnCliAdapter({
    id: 'antigravity',
    label: 'ANTIGRAVITY',
    command: cmd,
    argsForPrompt: (prompt) => template.map((a) => (a === '__PROMPT__' ? prompt : a)),
    pricing: { inPerM: 2.0, outPerM: 12.0 },
  });
}

const template = parseArgsTemplate();
export const antigravityAdapter: Adapter =
  ENV_CMD && template ? makeConfigured(ENV_CMD, template) : makeFallback();
