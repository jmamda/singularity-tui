import { spawn } from 'node:child_process';
import { runHeadless } from './headless.js';

function gh(args: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn('gh', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.stderr.on('data', (c: Buffer) => (err += c.toString('utf8')));
    p.on('error', () => resolve({ ok: false, out, err: 'gh not installed' }));
    p.on('exit', (code: number | null) => resolve({ ok: code === 0, out, err }));
  });
}

const REVIEW_TEMPLATE = `You are reviewing a pull request. Read the diff carefully and respond with:

1. **Risks** — what could break in production
2. **Bugs** — concrete defects in the code
3. **Style/structure** — only if egregious
4. **Verdict** — APPROVE / REQUEST_CHANGES / COMMENT

Be terse. Skip generic praise.

---

## PR metadata
{{meta}}

## Diff
\`\`\`diff
{{diff}}
\`\`\`
`;

export async function runReview(prNumber: string, target: string): Promise<number> {
  const meta = await gh(['pr', 'view', prNumber, '--json', 'title,author,baseRefName,headRefName,body']);
  if (!meta.ok) {
    process.stderr.write(`gh pr view failed: ${meta.err.trim()}\n`);
    return 2;
  }
  const diff = await gh(['pr', 'diff', prNumber]);
  if (!diff.ok) {
    process.stderr.write(`gh pr diff failed: ${diff.err.trim()}\n`);
    return 2;
  }
  const prompt = REVIEW_TEMPLATE
    .replace('{{meta}}', meta.out.trim())
    .replace('{{diff}}', diff.out.slice(0, 60_000));
  return await runHeadless({ target, prompt });
}
