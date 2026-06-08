/**
 * Cross-platform voice output. Uses macOS `say`, Linux `espeak`/`espeak-ng`,
 * Windows PowerShell SpeechSynthesizer. Returns ok/fail without throwing.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function which(cmd: string): Promise<boolean> {
  return new Promise((r) => {
    const p = spawn('which', [cmd], { stdio: 'ignore' });
    p.on('exit', (code) => r(code === 0));
    p.on('error', () => r(false));
  });
}

export async function speak(text: string): Promise<{ ok: boolean; reason?: string }> {
  if (process.platform === 'darwin') {
    return run('say', [text]);
  }
  if (process.platform === 'win32') {
    // PowerShell speech
    const script = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak("${text.replace(/"/g, '\\"')}")`;
    return run('powershell', ['-NoProfile', '-Command', script]);
  }
  // Linux: try espeak-ng then espeak
  if (await which('espeak-ng')) return run('espeak-ng', [text]);
  if (await which('espeak')) return run('espeak', [text]);
  return { ok: false, reason: 'no TTS engine found (install espeak / espeak-ng)' };
}

function run(cmd: string, args: string[]): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', (e) => resolve({ ok: false, reason: String(e) }));
    p.on('exit', (code) => resolve({ ok: code === 0, reason: code === 0 ? undefined : `${cmd} exit ${code}` }));
  });
}

/** Optional: transcribe a wav with whisper.cpp if installed. Stub for v1. */
export async function listen(path: string): Promise<{ ok: boolean; text?: string; reason?: string }> {
  if (!(await which('whisper'))) {
    return { ok: false, reason: 'whisper CLI not installed' };
  }
  return new Promise((resolve) => {
    const p = spawn('whisper', [path, '--output_format', 'txt', '--model', 'base.en']);
    let out = '';
    p.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    p.on('error', (e) => resolve({ ok: false, reason: String(e) }));
    p.on('exit', (code) => resolve({ ok: code === 0, text: out.trim() }));
  });
}

/** Convenience: write text to a tmp .txt and return the path (for testing). */
export async function _writeTmpText(text: string): Promise<string> {
  const p = join(tmpdir(), `singularity-tts-${Date.now()}.txt`);
  await fs.writeFile(p, text, 'utf8');
  return p;
}
