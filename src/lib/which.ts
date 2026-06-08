import { spawn } from 'node:child_process';

export async function which(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('which', [bin], { stdio: 'ignore' });
    p.on('exit', (code: number | null) => resolve(code === 0));
    p.on('error', () => resolve(false));
  });
}
