import { spawn } from 'node:child_process';

export function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('osascript', ['-l', 'AppleScript', '-e', script]);
    let out = '';
    let err = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.stderr.on('data', (c: Buffer) => (err += c.toString('utf8')));
    p.on('error', reject);
    p.on('exit', (code: number | null) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`osascript exit ${code}: ${err.trim()}`));
    });
  });
}

export function escapeAppleString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
