import { spawn } from 'node:child_process';

const CODE_HINT =
  /\b(fix|refactor|bug|test|review|implement|add|remove|rename|file|function|class|module|import|export|diff|commit|branch)\b/i;

function run(cmd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.on('error', () => resolve({ ok: false, out: '' }));
    p.on('exit', (code: number | null) => resolve({ ok: code === 0, out }));
  });
}

export function looksCodeRelated(prompt: string): boolean {
  return CODE_HINT.test(prompt);
}

export async function gitSummary(): Promise<string | null> {
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.out.trim() !== 'true') return null;
  const status = await run('git', ['status', '--short', '--branch']);
  if (!status.ok) return null;
  const trimmed = status.out.trim();
  if (!trimmed) return null;
  return `[git context]\n${trimmed}\n[/git]`;
}

export async function maybePrepend(prompt: string): Promise<string> {
  if (!looksCodeRelated(prompt)) return prompt;
  const ctx = await gitSummary();
  return ctx ? `${ctx}\n\n${prompt}` : prompt;
}
