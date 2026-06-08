import { spawn } from 'node:child_process';
import { promises as fs, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { DIR } from '../paths.js';
import { store } from '../../store.js';

export interface GitSnapshot {
  branch: string;
  head: string;
  ahead: number;
  behind: number;
  dirty: string[];
  recentSubjects: string[];
  takenAt: number;
}

export interface BuildSnapshot {
  typecheck: { ok: boolean; at: number; errors: number };
  tests: { ok: boolean; at: number; passed: number; failed: number };
  build: { ok: boolean; at: number };
}

export interface AgentSnapshot {
  trust: Record<number, number>;
  caps: Array<{ slot: number; kind: string; pattern: string; expiresIn: number }>;
  costUsd: number;
}

const BUILD_CACHE = join(DIR, 'build.json');

const DEFAULT_BUILD: BuildSnapshot = {
  typecheck: { ok: false, at: 0, errors: 0 },
  tests: { ok: false, at: 0, passed: 0, failed: 0 },
  build: { ok: false, at: 0 },
};

function runGit(args: string[], cwd: string, timeoutMs = 2000): Promise<string | null> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (v: string | null) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const p = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
      const timer = setTimeout(() => {
        try {
          p.kill('SIGKILL');
        } catch {
          /* */
        }
        finish(null);
      }, timeoutMs);
      p.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
      p.on('error', () => {
        clearTimeout(timer);
        finish(null);
      });
      p.on('close', (code: number) => {
        clearTimeout(timer);
        finish(code === 0 ? out : null);
      });
    } catch {
      finish(null);
    }
  });
}

export async function readGit(cwd: string = process.cwd()): Promise<GitSnapshot | null> {
  const inside = await runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  if (!inside || inside.trim() !== 'true') return null;
  const [branchRaw, headRaw, statusRaw, aheadBehindRaw, logRaw] = await Promise.all([
    runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd),
    runGit(['rev-parse', '--short', 'HEAD'], cwd),
    runGit(['status', '--porcelain'], cwd),
    runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd),
    runGit(['log', '-5', '--pretty=%s'], cwd),
  ]);
  const branch = (branchRaw ?? '').trim() || 'HEAD';
  const head = (headRaw ?? '').trim();
  const dirty = (statusRaw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
  let ahead = 0;
  let behind = 0;
  if (aheadBehindRaw) {
    const m = aheadBehindRaw.trim().split(/\s+/);
    ahead = Number.parseInt(m[0] ?? '0', 10) || 0;
    behind = Number.parseInt(m[1] ?? '0', 10) || 0;
  }
  const recentSubjects = (logRaw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5);
  return { branch, head, ahead, behind, dirty, recentSubjects, takenAt: Date.now() };
}

export function readBuild(): BuildSnapshot {
  try {
    const raw = readFileSync(BUILD_CACHE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BuildSnapshot>;
    return {
      typecheck: { ...DEFAULT_BUILD.typecheck, ...(parsed.typecheck ?? {}) },
      tests: { ...DEFAULT_BUILD.tests, ...(parsed.tests ?? {}) },
      build: { ...DEFAULT_BUILD.build, ...(parsed.build ?? {}) },
    };
  } catch {
    return { ...DEFAULT_BUILD };
  }
}

export function recordBuild(
  kind: 'typecheck' | 'tests' | 'build',
  ok: boolean,
  extra: Record<string, unknown> = {},
): void {
  const current = readBuild();
  const at = Date.now();
  if (kind === 'typecheck') {
    const errors = typeof extra.errors === 'number' ? extra.errors : current.typecheck.errors;
    current.typecheck = { ok, at, errors };
  } else if (kind === 'tests') {
    const passed = typeof extra.passed === 'number' ? extra.passed : current.tests.passed;
    const failed = typeof extra.failed === 'number' ? extra.failed : current.tests.failed;
    current.tests = { ok, at, passed, failed };
  } else {
    current.build = { ok, at };
  }
  try {
    if (!existsSync(dirname(BUILD_CACHE))) mkdirSync(dirname(BUILD_CACHE), { recursive: true });
    writeFileSync(BUILD_CACHE, JSON.stringify(current, null, 2), 'utf8');
  } catch {
    /* best-effort */
  }
  void fs;
}

export function readAgent(): AgentSnapshot {
  const s = store.getState();
  const now = Date.now();
  const caps = s.capabilities.map((c) => ({
    slot: c.slot,
    kind: c.kind,
    pattern: c.pattern,
    expiresIn: Math.max(0, c.expiresAt - now),
  }));
  return { trust: s.trust, caps, costUsd: s.totalCostUsd };
}
