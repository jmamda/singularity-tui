/**
 * File-reference syntax — analog to OpenCode's `@File#L37-42` but with a
 * simpler grammar: `@path[:start[-end]]`. Resolved before dispatch; the
 * referenced content is inlined as a fenced block prefixed to the prompt.
 *
 *   @src/auth.ts          → entire file
 *   @src/auth.ts:42       → just line 42
 *   @src/auth.ts:40-60    → lines 40..60 inclusive
 *
 * Lines that don't resolve to a readable file are left as-is in the prompt.
 */

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { extname } from 'node:path';

const REF_RE = /@([\w./_-]+\.[A-Za-z0-9]+)(?::(\d+)(?:-(\d+))?)?/g;

export interface ResolvedRef {
  path: string;
  startLine?: number;
  endLine?: number;
  content: string;
  lang: string;
}

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.java': 'java',
  '.json': 'json',
  '.md': 'markdown',
  '.sh': 'bash',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
};

export async function resolveFileRefs(
  text: string,
  cwd = process.cwd(),
): Promise<{
  prompt: string;
  refs: ResolvedRef[];
}> {
  const refs: ResolvedRef[] = [];
  const matches = [...text.matchAll(REF_RE)];
  for (const m of matches) {
    const relPath = m[1]!;
    const start = m[2] ? Number(m[2]) : undefined;
    const end = m[3] ? Number(m[3]) : start;
    const abs = resolve(cwd, relPath);
    if (abs.includes('..')) continue;
    if (!abs.startsWith(cwd) && !abs.startsWith(resolve(cwd))) continue;
    let content: string;
    try {
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    if (start !== undefined) {
      const lines = content.split('\n');
      const lo = Math.max(0, start - 1);
      const hi = Math.min(lines.length, end ?? start);
      content = lines.slice(lo, hi).join('\n');
    }
    refs.push({
      path: relPath,
      startLine: start,
      endLine: end,
      content: content.slice(0, 8000),
      lang: EXT_LANG[extname(relPath)] ?? 'text',
    });
  }

  if (refs.length === 0) return { prompt: text, refs: [] };
  const header = refs
    .map((r) => {
      const range = r.startLine
        ? ` L${r.startLine}${r.endLine && r.endLine !== r.startLine ? '-L' + r.endLine : ''}`
        : '';
      return `[ref: ${r.path}${range}]\n\`\`\`${r.lang}\n${r.content}\n\`\`\``;
    })
    .join('\n\n');
  return { prompt: `${header}\n\n${text}`, refs };
}
