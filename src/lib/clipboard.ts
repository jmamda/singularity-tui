import { spawn } from 'node:child_process';

type Candidate = { command: string; args: string[] };

function candidatesForPlatform(): Candidate[] {
  if (process.platform === 'darwin') return [{ command: 'pbcopy', args: [] }];
  if (process.platform === 'win32') return [{ command: 'clip', args: [] }];
  return [
    { command: 'wl-copy', args: [] },
    { command: 'xclip', args: ['-selection', 'clipboard'] },
    { command: 'xsel', args: ['--clipboard', '--input'] },
  ];
}

function tryCopy(c: Candidate, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(c.command, c.args, { stdio: ['pipe', 'ignore', 'ignore'] });
    // ENOENT fires 'error'; without a handler it would crash the process.
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
    p.stdin.on('error', () => {});
    p.stdin.write(text);
    p.stdin.end();
  });
}

/** Copy text to the system clipboard. Resolves false (never throws) if no tool works. */
export async function copyToClipboard(text: string): Promise<boolean> {
  for (const c of candidatesForPlatform()) {
    if (await tryCopy(c, text)) return true;
  }
  return false;
}
