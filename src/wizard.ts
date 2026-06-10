import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { which } from './lib/which.js';
import { DIR, WIZARD_FILE } from './lib/paths.js';
import { upsertEnvFile, loadEnvFile } from './lib/env.js';

// ─── Tiny ANSI palette ────────────────────────────────────────────────────
const c = {
  red: (s: string) => `\x1b[91m${s}\x1b[0m`,
  green: (s: string) => `\x1b[92m${s}\x1b[0m`,
  amber: (s: string) => `\x1b[93m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  inv: (s: string) => `\x1b[7m${s}\x1b[0m`,
};

// ─── Subprocess helpers ───────────────────────────────────────────────────
function runInherited(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => resolve(code ?? 0));
    p.on('error', () => resolve(1));
  });
}

function runCapture(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (b: Buffer) => (out += b.toString('utf8')));
    p.stderr.on('data', (b: Buffer) => (out += b.toString('utf8')));
    p.on('error', () => resolve({ ok: false, out }));
    p.on('exit', (code) => resolve({ ok: code === 0, out }));
  });
}

// ─── Per-adapter checks ───────────────────────────────────────────────────
type CheckStatus = 'OK' | 'PARTIAL' | 'MISSING';

interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  action?: { label: string; run: (rl: readline.Interface) => Promise<void> };
}

async function checkClaude(): Promise<Check> {
  const present = await which('claude');
  if (!present) {
    return {
      id: 'claude',
      label: 'CLAUDE',
      status: 'MISSING',
      detail: '`claude` not on PATH',
      action: {
        label: 'install: npm install -g @anthropic-ai/claude-code',
        run: async () => {
          await runInherited('npm', ['install', '-g', '@anthropic-ai/claude-code']);
        },
      },
    };
  }
  // We don't programmatically verify Claude auth — if they have the binary,
  // they've almost certainly already logged in (this whole project depends on it).
  return {
    id: 'claude',
    label: 'CLAUDE',
    status: 'OK',
    detail: 'binary present (auth via `claude` itself)',
  };
}

async function checkCodex(): Promise<Check> {
  const present = await which('codex');
  if (!present) {
    return {
      id: 'codex',
      label: 'CODEX',
      status: 'MISSING',
      detail: '`codex` not on PATH',
      action: {
        label: 'install: npm install -g @openai/codex',
        run: async () => {
          await runInherited('npm', ['install', '-g', '@openai/codex']);
        },
      },
    };
  }
  const doctor = await runCapture('codex', ['doctor']);
  const authed = /auth is configured/i.test(doctor.out);
  if (!authed) {
    return {
      id: 'codex',
      label: 'CODEX',
      status: 'PARTIAL',
      detail: 'binary present, not logged in',
      action: {
        label: 'log in: `codex login` (opens OAuth in your browser)',
        run: async () => {
          await runInherited('codex', ['login']);
        },
      },
    };
  }
  return { id: 'codex', label: 'CODEX', status: 'OK', detail: 'binary present, auth configured' };
}

async function checkOpencode(): Promise<Check> {
  const present = await which('opencode');
  if (!present) {
    return {
      id: 'opencode',
      label: 'OPENCODE',
      status: 'MISSING',
      detail: '`opencode` not on PATH',
      action: {
        label: 'install: npm install -g opencode-ai',
        run: async () => {
          await runInherited('npm', ['install', '-g', 'opencode-ai']);
        },
      },
    };
  }
  // opencode runs with bundled defaults if no provider creds are configured —
  // "0 credentials" is NOT a failure state. We mark OK on binary presence and
  // offer login as an optional action for users who want their own provider.
  const list = await runCapture('opencode', ['providers', 'list']);
  const zero = /0\s+credentials/i.test(list.out);
  const detail = zero
    ? 'binary present (using bundled defaults; explicit provider login optional)'
    : 'binary present, custom provider credentials configured';
  return {
    id: 'opencode',
    label: 'OPENCODE',
    status: 'OK',
    detail,
    action: zero
      ? {
          label: 'optional: `opencode providers login` to wire your own provider',
          run: async () => {
            await runInherited('opencode', ['providers', 'login']);
          },
        }
      : undefined,
  };
}

async function checkLangSmith(rl: readline.Interface): Promise<Check> {
  if (process.env.LANGSMITH_API_KEY) {
    return {
      id: 'langgraph',
      label: 'LANGGRAPH',
      status: 'OK',
      detail: 'LANGSMITH_API_KEY set' + (process.env.LANGSMITH_PROJECT_ID ? ' + project id' : ''),
    };
  }
  return {
    id: 'langgraph',
    label: 'LANGGRAPH',
    status: 'PARTIAL',
    detail: 'LANGSMITH_API_KEY not set (monitor pane will stay OFFLINE)',
    action: {
      label: 'set LANGSMITH_API_KEY (saved to ~/.singularity/.env)',
      run: async () => {
        const key = (
          await rl.question(c.dim('  paste LANGSMITH_API_KEY (or empty to skip): '))
        ).trim();
        if (!key) return;
        await upsertEnvFile('LANGSMITH_API_KEY', key);
        process.env.LANGSMITH_API_KEY = key;
        const proj = (
          await rl.question(c.dim('  optional LANGSMITH_PROJECT_ID (empty to skip): '))
        ).trim();
        if (proj) {
          await upsertEnvFile('LANGSMITH_PROJECT_ID', proj);
          process.env.LANGSMITH_PROJECT_ID = proj;
        }
        console.log(c.green('  ✓ saved to ~/.singularity/.env'));
      },
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- deliberately parked; see the commented-out call in the wizard loop
async function checkAntigravity(rl: readline.Interface): Promise<Check> {
  if (process.env.SINGULARITY_ANTIGRAVITY_CMD) {
    return {
      id: 'antigravity',
      label: 'ANTIGRAVITY',
      status: 'OK',
      detail: `configured: ${process.env.SINGULARITY_ANTIGRAVITY_CMD}`,
    };
  }
  return {
    id: 'antigravity',
    label: 'ANTIGRAVITY',
    status: 'PARTIAL',
    detail: 'no CLI command configured (no public CLI surface pinned)',
    action: {
      label: 'configure binary + args (saved to ~/.singularity/.env)',
      run: async () => {
        const cmd = (await rl.question(c.dim('  binary name (empty to skip): '))).trim();
        if (!cmd) return;
        const args = (
          await rl.question(
            c.dim('  args JSON, use __PROMPT__ placeholder (default: ["exec","__PROMPT__"]): '),
          )
        ).trim();
        await upsertEnvFile('SINGULARITY_ANTIGRAVITY_CMD', cmd);
        process.env.SINGULARITY_ANTIGRAVITY_CMD = cmd;
        if (args) {
          await upsertEnvFile('SINGULARITY_ANTIGRAVITY_ARGS', args);
          process.env.SINGULARITY_ANTIGRAVITY_ARGS = args;
        }
        console.log(c.green('  ✓ saved to ~/.singularity/.env'));
      },
    },
  };
}

// ─── Render ───────────────────────────────────────────────────────────────
function renderBanner(): void {
  const lines = [
    '',
    c.red('  ╔═══════════════════════════════════════════════════════════════╗'),
    c.red('  ║   S I N G U L A R I T Y   //   FIRST-RUN SETUP                ║'),
    c.red('  ╚═══════════════════════════════════════════════════════════════╝'),
    '',
  ];
  console.log(lines.join('\n'));
}

function statusBadge(s: CheckStatus): string {
  if (s === 'OK') return c.green('✓ OK     ');
  if (s === 'PARTIAL') return c.amber('◐ PARTIAL');
  return c.red('✗ MISSING');
}

function renderChecks(checks: Check[]): void {
  console.log(c.bold('  System status'));
  console.log(c.dim('  ─────────────────────────────────────────────────────────────'));
  for (const ch of checks) {
    console.log(`  ${statusBadge(ch.status)}   ${ch.label.padEnd(13)} ${c.dim(ch.detail)}`);
  }
  console.log('');
}

function renderActions(checks: Check[]): Check[] {
  const actionable = checks.filter((c) => c.action);
  if (actionable.length === 0) {
    console.log(c.green('  All systems ready. No outstanding setup actions.'));
    return [];
  }
  console.log(c.bold('  Available actions'));
  console.log(c.dim('  ─────────────────────────────────────────────────────────────'));
  actionable.forEach((ch, i) => {
    console.log(`  ${c.amber(`[${i + 1}]`)} ${ch.label.padEnd(13)} ${c.dim(ch.action!.label)}`);
  });
  console.log('');
  return actionable;
}

async function markWizardComplete(): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(WIZARD_FILE, JSON.stringify({ completedAt: Date.now() }, null, 2), 'utf8');
}

export async function hasWizardCompleted(): Promise<boolean> {
  try {
    await fs.access(WIZARD_FILE);
    return true;
  } catch {
    return false;
  }
}

// ─── Main wizard loop ─────────────────────────────────────────────────────
export async function runWizard(): Promise<number> {
  await loadEnvFile();
  renderBanner();

  // Non-TTY (piped/CI) — print status and exit cleanly without hanging on prompts.
  if (!process.stdin.isTTY) {
    const rlDummy = readline.createInterface({ input, output });
    const checks = await Promise.all([
      checkClaude(),
      checkCodex(),
      checkOpencode(),
      checkLangSmith(rlDummy),
    ]);
    rlDummy.close();
    renderChecks(checks);
    const actionable = checks.filter((c) => c.action);
    if (actionable.length > 0) {
      console.log(c.dim('  (non-TTY mode — skipping interactive actions)'));
      console.log(c.dim('  re-run interactively with: singularity wizard') + '\n');
    } else {
      console.log(c.green('  ✓ all systems ready') + '\n');
    }
    await markWizardComplete();
    return 0;
  }

  const rl = readline.createInterface({ input, output });
  try {
    let iteration = 0;
    while (true) {
      iteration++;
      const checks = await Promise.all([
        checkClaude(),
        checkCodex(),
        checkOpencode(),
        checkLangSmith(rl),
        // Antigravity check omitted — default profile uses an ARTIFACTS pane
        // in slot 4. Re-add by editing the profile + uncommenting below.
        // checkAntigravity(rl),
      ]);
      renderChecks(checks);
      const actionable = renderActions(checks);

      if (actionable.length === 0) break;

      const answer = (
        await rl.question(
          c.bold(
            '  > pick action [1-' +
              actionable.length +
              ', `a` all, `s` skip rest, Enter to refresh]: ',
          ),
        )
      )
        .trim()
        .toLowerCase();

      if (answer === 's' || answer === 'skip') break;

      const indices =
        answer === 'a' || answer === 'all'
          ? actionable.map((_, i) => i)
          : answer
            ? answer
                .split(/[,\s]+/)
                .map((x) => Number(x) - 1)
                .filter((i) => Number.isInteger(i) && i >= 0 && i < actionable.length)
            : []; // empty → just refresh status

      for (const i of indices) {
        const ch = actionable[i]!;
        console.log('\n' + c.inv(` running: ${ch.label} `) + ' ' + c.dim(ch.action!.label) + '\n');
        try {
          await ch.action!.run(rl);
        } catch (e) {
          console.log(c.red(`  ✗ action failed: ${e}`));
        }
        console.log('');
      }

      if (iteration > 12) {
        console.log(c.amber('  (too many iterations, breaking out of wizard loop)'));
        break;
      }
    }
  } finally {
    rl.close();
  }

  await markWizardComplete();
  console.log('\n' + c.green('  ✓ wizard complete. Saved to ~/.singularity/wizard.json'));
  console.log(c.dim('     re-run any time with: singularity wizard') + '\n');
  return 0;
}

/** Yes/no prompt — used by cli.tsx when auto-detecting first run. */
export async function confirmFirstRun(): Promise<boolean> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (
      await rl.question('\n' + c.amber('  ◐ first-run detected. Run setup wizard? [Y/n]: '))
    )
      .trim()
      .toLowerCase();
    return answer !== 'n' && answer !== 'no';
  } finally {
    rl.close();
  }
}
