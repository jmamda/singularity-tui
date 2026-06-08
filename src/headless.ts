import { claudeAdapter } from './adapters/claude.js';
import { opencodeAdapter } from './adapters/opencode.js';
import { codexAdapter } from './adapters/codex.js';
import { antigravityAdapter } from './adapters/antigravity.js';
import { langgraphAdapter } from './adapters/langgraph.js';
import type { Adapter } from './adapters/types.js';

const ADAPTERS: Record<string, Adapter> = {
  claude: claudeAdapter,
  opencode: opencodeAdapter,
  codex: codexAdapter,
  antigravity: antigravityAdapter,
  langgraph: langgraphAdapter,
};

export interface HeadlessOpts {
  target: string;
  prompt: string;
  persona?: string;
  json?: boolean;
}

export async function runHeadless(opts: HeadlessOpts): Promise<number> {
  const adapter = ADAPTERS[opts.target.toLowerCase()];
  if (!adapter) {
    process.stderr.write(`unknown target: ${opts.target}\n`);
    process.stderr.write(`known: ${Object.keys(ADAPTERS).join(', ')}\n`);
    return 2;
  }
  if (!adapter.send) {
    process.stderr.write(`target ${opts.target} is not a dispatchable adapter\n`);
    return 2;
  }
  const ok = await adapter.available();
  if (!ok) {
    process.stderr.write(`adapter ${opts.target} is not available on this system\n`);
    return 3;
  }

  let exitCode = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd = 0;

  for await (const ev of adapter.send(opts.prompt, { persona: opts.persona })) {
    if (opts.json) {
      process.stdout.write(JSON.stringify(ev) + '\n');
    } else {
      if (ev.type === 'token') process.stdout.write(ev.text);
      else if (ev.type === 'error') process.stderr.write(`[err] ${ev.message}\n`);
      else if (ev.type === 'status' && ev.status === 'FAULT') exitCode = 1;
    }
    if (ev.type === 'cost') {
      tokensIn += ev.tokensIn;
      tokensOut += ev.tokensOut;
      costUsd += ev.usd;
    }
  }

  if (!opts.json) {
    process.stderr.write(`\n[done · in=${tokensIn} out=${tokensOut} cost=$${costUsd.toFixed(4)}]\n`);
  }
  return exitCode;
}
