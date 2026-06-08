/**
 * Cross-platform URL opener. Uses macOS `open`, Windows `start`, Linux
 * `xdg-open`. Caller is responsible for capability check on the hostname.
 */

import { spawn } from 'node:child_process';

export async function openUrl(url: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    // Sanity: URL parse will throw on garbage.
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return { ok: false, reason: 'invalid URL' };
  }
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? { c: 'open', a: [url] }
    : platform === 'win32' ? { c: 'cmd', a: ['/c', 'start', url] }
    : { c: 'xdg-open', a: [url] };
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd.c, cmd.a, { stdio: 'ignore', detached: true });
      p.on('error', (e) => resolve({ ok: false, reason: String(e) }));
      p.on('spawn', () => {
        p.unref();
        resolve({ ok: true });
      });
    } catch (e) {
      resolve({ ok: false, reason: String(e) });
    }
  });
}
