#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from './App.js';
import { isInsideIterm, launchSplits, killSession } from './iterm/launch.js';
import { saveState, loadState, clearState } from './iterm/state.js';
import { listProfiles } from './lib/profiles.js';
import { runHeadless } from './headless.js';
import { runWatch } from './watch.js';
import { runReview } from './review.js';
import { runMcpServer } from './mcp.js';
import { runWizard, hasWizardCompleted, confirmFirstRun } from './wizard.js';
import { loadEnvFile } from './lib/env.js';

const SPECS = [
  { slot: 1 as const, label: 'CLAUDE', command: 'claude' },
  { slot: 2 as const, label: 'OPENCODE', command: 'opencode' },
  { slot: 3 as const, label: 'CODEX', command: 'codex' },
  {
    slot: 4 as const,
    label: 'LANGGRAPH',
    command: 'echo "langgraph monitor placeholder — set LANGSMITH_API_KEY"',
  },
];

function getFlag(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function cmdLaunch() {
  if (process.platform !== 'darwin') {
    console.error('singularity launch requires macOS + iTerm2');
    process.exit(1);
  }
  process.stdout.write('● launching iTerm2 splits...\n');
  const sessions = await launchSplits(SPECS);
  await saveState({ sessions, createdAt: Date.now() });
  process.stdout.write('✓ launched 4 sessions:\n');
  for (const s of sessions) {
    process.stdout.write(
      `  [${s.slot}] ${s.label}  sid=${s.sessionId.slice(0, 12)}  tty=${s.tty}\n`,
    );
  }
}

async function cmdDown() {
  const state = await loadState();
  if (!state) {
    process.stdout.write('no active sessions\n');
    return;
  }
  for (const s of state.sessions) {
    try {
      await killSession(s.sessionId);
    } catch {}
  }
  await clearState();
  process.stdout.write('✓ closed sessions and cleared state\n');
}

async function cmdStatus() {
  const state = await loadState();
  if (!state) {
    process.stdout.write('iTerm2 mode: inactive\n');
    process.stdout.write(`inside iTerm2: ${isInsideIterm()}\n`);
    const profiles = await listProfiles();
    process.stdout.write(`profiles: ${profiles.join(', ') || '(none)'}\n`);
    return;
  }
  process.stdout.write(`iTerm2 mode: active (since ${new Date(state.createdAt).toISOString()})\n`);
  for (const s of state.sessions) {
    process.stdout.write(
      `  [${s.slot}] ${s.label}  sid=${s.sessionId.slice(0, 12)}  tty=${s.tty}\n`,
    );
  }
}

async function main() {
  await loadEnvFile();

  const [cmd, ...rest] = process.argv.slice(2);
  const wantsWizard = hasFlag('wizard') || cmd === 'wizard';

  if (wantsWizard) {
    const code = await runWizard();
    if (cmd === 'wizard') process.exit(code);
    // --wizard flag was passed alongside another command; fall through after wizard.
  }

  if (cmd === 'launch') return cmdLaunch();
  if (cmd === 'down') return cmdDown();
  if (cmd === 'status') return cmdStatus();

  if (cmd === 'run') {
    const target = getFlag('target');
    const prompt = getFlag('prompt');
    const persona = getFlag('persona');
    const json = hasFlag('json');
    if (!target || !prompt) {
      console.error(
        'usage: singularity run --target <id> --prompt "..." [--persona "..."] [--json]',
      );
      process.exit(2);
    }
    const code = await runHeadless({ target, prompt, persona, json });
    process.exit(code);
  }

  if (cmd === 'watch') {
    const dir = rest[0];
    const target = getFlag('target');
    const template = getFlag('on') ?? 'explain the latest change to {{file}}';
    if (!dir || !target) {
      console.error(
        'usage: singularity watch <dir> --target <id> [--on "<template with {{file}}>"]',
      );
      process.exit(2);
    }
    await runWatch({ dir, target, template });
    return;
  }

  if (cmd === 'review') {
    const prNumber = rest[0];
    const target = getFlag('target', 'claude')!;
    if (!prNumber) {
      console.error('usage: singularity review <pr#> [--target <id>]');
      process.exit(2);
    }
    const code = await runReview(prNumber, target);
    process.exit(code);
  }

  if (cmd === 'serve') {
    if (hasFlag('mcp')) {
      await runMcpServer();
      return;
    }
    if (hasFlag('http')) {
      const { runHttpServer } = await import('./httpServer.js');
      const port = Number(getFlag('port', '7777'));
      await runHttpServer(port);
      return;
    }
    console.error('usage: singularity serve --mcp | --http [--port 7777]');
    process.exit(2);
  }

  if (cmd === 'showcase') {
    const { runShowcase } = await import('./showcase.js');
    await runShowcase({ fast: hasFlag('fast') });
    return;
  }

  if (cmd === 'web') {
    const port = Number(getFlag('port', '7777'));
    const { runHttpServer } = await import('./httpServer.js');
    if (hasFlag('open')) {
      const { spawn } = await import('node:child_process');
      const url = `http://localhost:${port}`;
      try {
        if (process.platform === 'darwin')
          spawn('open', [url], { detached: true, stdio: 'ignore' });
        else if (process.platform === 'win32')
          spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' });
        else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
      } catch {
        /* ignore */
      }
    }
    await runHttpServer(port);
    return;
  }

  if (cmd === 'daemon') {
    const { loadTriggers, TriggerRunner } = await import('./lib/triggers.js');
    const triggers = await loadTriggers();
    if (triggers.length === 0) {
      console.error('no triggers configured (~/.singularity/triggers.json)');
      process.exit(2);
    }
    const { runHeadless } = await import('./headless.js');
    const adapterFor = (slot: number): string => {
      // best-effort lookup: ask the loaded profile what's at that slot
      const id = ['claude', 'opencode', 'codex', 'shell'][slot - 1] ?? 'claude';
      return id;
    };
    const runner = new TriggerRunner((slot, prompt) => {
      const target = adapterFor(slot);
      process.stdout.write(`\n[trigger → ${target}] ${prompt.slice(0, 100)}\n`);
      void runHeadless({ target, prompt });
    });
    for (const t of triggers) {
      process.stdout.write(`● armed: ${t.id} (${t.source} ${t.match})\n`);
      runner.start(t);
    }
    process.on('SIGINT', () => {
      runner.stopAll();
      process.exit(0);
    });
    // park
    await new Promise(() => {});
    return;
  }

  if (cmd === 'recipe') {
    const sub = rest[0];
    const { loadRecipe, listRecipes, runRecipe } = await import('./lib/recipes.js');
    const { runHeadless } = await import('./headless.js');
    if (!sub || sub === 'list') {
      const names = await listRecipes();
      process.stdout.write(
        names.length ? names.map((n) => `  ${n}`).join('\n') + '\n' : 'no recipes found\n',
      );
      return;
    }
    const recipe = await loadRecipe(sub);
    if (!recipe) {
      console.error(`recipe not found: ${sub}`);
      process.exit(2);
    }
    const slotToAdapter = (slot: number): string =>
      ['claude', 'opencode', 'codex'][slot - 1] ?? 'claude';
    const dispatcher = {
      dispatch: async (input: string, slots: number[]) => {
        const targets = slots.length ? slots : [1];
        const stripped = input.replace(/^[!?@]\S*\s*/, '').replace(/^>>?\d+\s*/, '');
        for (const s of targets) {
          process.stdout.write(`\n[recipe → ${slotToAdapter(s)}] ${stripped.slice(0, 80)}\n`);
          await runHeadless({ target: slotToAdapter(s), prompt: stripped });
        }
      },
      runSlash: async (text: string) => {
        process.stdout.write(`\n[recipe slash] ${text} (skipped — TUI-only in headless mode)\n`);
        return { ok: true };
      },
    };
    const vars: Record<string, string> = {};
    for (let i = 1; i < rest.length; i++) {
      const arg = rest[i]!;
      const m = arg.match(/^--([A-Za-z_][\w-]*)=(.*)$/);
      if (m) vars[m[1]!] = m[2]!;
    }
    const result = await runRecipe(recipe, dispatcher, vars);
    if (!result.ok) {
      process.stderr.write(
        `\nrecipe failed at step ${result.failed?.step}: ${result.failed?.reason}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`\n✓ recipe '${recipe.name}' ran ${result.stepsRun} steps\n`);
    return;
  }

  if (cmd === 'grammar') {
    const { renderGrammar, ANSI, NO_COLOR } = await import('./lib/grammar.js');
    const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
    process.stdout.write(renderGrammar(useColor ? ANSI : NO_COLOR));
    return;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(`singularity — code-red TUI dispatcher

usage:
  singularity [--profile <name>] [--no-wizard]     open the controller TUI
  singularity wizard                               run the first-run setup wizard (install/auth/env)
  singularity launch                               create iTerm2 splits running the AI CLIs
  singularity down                                 close iTerm2 sessions + clear state
  singularity status                               show iTerm2 mode + session ids + profiles
  singularity run --target <id> --prompt "..."     headless one-shot dispatch (good for scripts)
  singularity watch <dir> --target <id> --on "..." auto-dispatch on file change ({{file}} substituted)
  singularity review <pr#> [--target <id>]         pull a GitHub PR + dispatch a review prompt
  singularity serve --mcp                          run as MCP server (stdio); other agents call our adapters
  singularity serve --http [--port 7777]           run REST + SSE HTTP server with OpenAPI
  singularity web [--port 7777] [--open]           same HTTP server + tiny embedded browser UI
  singularity recipe list                          list available recipes (~/.singularity/recipes + examples/recipes)
  singularity recipe <name> [--key=value]          run a recipe (headless; vars substituted into {{...}})
  singularity grammar                              print the dispatch grammar cheat sheet
  singularity help                                 this text

first-run: the wizard auto-prompts the first time you launch the TUI.
           skip with --no-wizard, re-run any time with: singularity wizard

in-TUI input prefixes:
  text             dispatch to selected target(s)
  !text            broadcast to all eligible panes (race bars)
  ?text            quorum vote — broadcast + classify YES/NO across panes
  >N text          relay last response from current target into pane N
  >>N text         dispatch the selected artifact (slot 4) as the prompt to pane N
  @plan <goal>     planner pane drafts steps + auto-fans to workers
  /text            slash command (/help /clear /save /lock /search /profile /snippet /cost /budget /diff /note /awareness /grammar)

keys: [1-4] toggle target · [Tab] cycle single target · [↑↓] prompt history · [Esc] clear · [Ctrl+C] quit
`);
    return;
  }

  // Auto-prompt first-run wizard if we're about to launch the TUI and
  // ~/.singularity/wizard.json doesn't exist.
  if (!cmd && !hasFlag('no-wizard')) {
    const done = await hasWizardCompleted();
    if (!done) {
      const yes = await confirmFirstRun();
      if (yes) await runWizard();
    }
  }

  const wantsDemo = hasFlag('demo');
  let profile = getFlag('profile', wantsDemo ? 'demo' : 'default');
  if (wantsDemo) {
    const { ensureDemoProfile } = await import('./lib/profiles.js');
    await ensureDemoProfile();
    profile = 'demo';
  }
  const instance = render(<App profile={profile} />);

  // Crash safety: a throw in any fire-and-forget path must not leave the
  // terminal in raw mode with a half-rendered Ink tree. Unmount cleanly,
  // restore the cursor, then surface the error.
  const bail = (label: string) => (err: unknown) => {
    try {
      instance.unmount();
    } catch {
      /* ignore */
    }
    process.stderr.write(
      `\n[singularity] ${label}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
    process.exit(1);
  };
  process.on('unhandledRejection', bail('unhandled rejection'));
  process.on('uncaughtException', bail('uncaught exception'));

  await instance.waitUntilExit();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
