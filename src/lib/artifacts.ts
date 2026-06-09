import type { Slot } from '../store.js';

export interface Artifact {
  id: string;
  seq: number; // stable short #N ref shown to humans and agents
  sourceSlot: Slot;
  sourceLabel: string;
  lang: string;
  content: string;
  createdAt: number;
  title?: string;
}

export interface ArtifactComment {
  id: string;
  artifactId: string;
  fromSlot: Slot;
  fromLabel: string;
  text: string;
  at: number;
}

/**
 * Streaming code-block extractor. Feed it chunks of streamed text; it returns
 * any newly-completed code blocks. Handles ``` fences with optional language tag.
 */
export interface PartialBlock {
  lang: string;
  content: string;
  startedAt: number;
}

export class CodeBlockExtractor {
  private buf = '';
  private state: 'outside' | 'inside' = 'outside';
  private currentLang = '';
  private currentContent = '';
  private currentStartedAt = 0;

  feed(chunk: string): { lang: string; content: string }[] {
    this.buf += chunk;
    const out: { lang: string; content: string }[] = [];
    while (true) {
      const nl = this.buf.indexOf('\n');
      if (nl < 0) break;
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);

      if (this.state === 'outside') {
        const m = line.match(/^\s*```(\w*)\s*$/);
        if (m) {
          this.state = 'inside';
          this.currentLang = (m[1] || 'text').toLowerCase();
          this.currentContent = '';
          this.currentStartedAt = Date.now();
        }
      } else {
        if (line.match(/^\s*```\s*$/)) {
          out.push({ lang: this.currentLang, content: this.currentContent });
          this.state = 'outside';
          this.currentLang = '';
          this.currentContent = '';
          this.currentStartedAt = 0;
        } else {
          this.currentContent += (this.currentContent ? '\n' : '') + line;
        }
      }
    }
    return out;
  }

  /** Snapshot of the currently-open block (or null if we're between fences).
   *  Includes the in-buffer line not yet terminated by a newline, so the live
   *  preview reflects text as it's typed. */
  partial(): PartialBlock | null {
    if (this.state !== 'inside') return null;
    const pending = this.buf.length > 0 ? this.buf : '';
    const content = this.currentContent
      ? pending
        ? `${this.currentContent}\n${pending}`
        : this.currentContent
      : pending;
    return {
      lang: this.currentLang || 'text',
      content,
      startedAt: this.currentStartedAt,
    };
  }

  reset(): void {
    this.buf = '';
    this.state = 'outside';
    this.currentLang = '';
    this.currentContent = '';
    this.currentStartedAt = 0;
  }
}

// Per-pane extractor registry — module-scope so it persists across renders.
const extractors = new Map<Slot, CodeBlockExtractor>();

export function feedPaneStream(slot: Slot, chunk: string): { lang: string; content: string }[] {
  let ex = extractors.get(slot);
  if (!ex) {
    ex = new CodeBlockExtractor();
    extractors.set(slot, ex);
  }
  return ex.feed(chunk);
}

export function resetPaneExtractor(slot: Slot): void {
  extractors.get(slot)?.reset();
}

/** Snapshot any pane's currently-open partial block. */
export function partialFor(slot: Slot): PartialBlock | null {
  return extractors.get(slot)?.partial() ?? null;
}

const TITLE_PATTERNS: Array<{ re: RegExp; pick: (m: RegExpMatchArray) => string }> = [
  // python: `def foo(...)` / `class Foo`
  {
    re: /^\s*def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)/m,
    pick: (m) => `def ${m[1]}(${m[2]!.slice(0, 24)})`,
  },
  { re: /^\s*class\s+([A-Za-z_][\w]*)/m, pick: (m) => `class ${m[1]}` },
  // ts/js: `function foo`, `export function foo`, `const foo = (`
  {
    re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/m,
    pick: (m) => `function ${m[1]}(${m[2]!.slice(0, 24)})`,
  },
  {
    re: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/m,
    pick: (m) => `const ${m[1]} = (…)`,
  },
  {
    re: /^\s*(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/m,
    pick: (m) => m[0]!.replace(/^\s*(?:export\s+)?/, '').slice(0, 48),
  },
  // go
  { re: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][\w]*)\s*\(/m, pick: (m) => `func ${m[1]}` },
  // rust
  { re: /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/m, pick: (m) => `fn ${m[1]}` },
  // file-path comment header
  { re: /^\s*(?:\/\/|#|--)\s*([A-Za-z0-9_./-]+\.[A-Za-z]+)\s*$/m, pick: (m) => m[1]! },
  // JSON top-level key
  { re: /^\s*\{\s*"([^"]+)"\s*:/m, pick: (m) => `{ "${m[1]}": … }` },
  // SQL
  {
    re: /^\s*(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|VIEW)\s+([A-Za-z_][\w]*)/im,
    pick: (m) => m[0]!.slice(0, 48),
  },
];

/** Infer a short title — looks for declarations, file headers, signatures. */
export function inferTitle(content: string): string {
  for (const { re, pick } of TITLE_PATTERNS) {
    const m = content.match(re);
    if (m) return pick(m).trim().slice(0, 48);
  }
  // Fallback: first non-empty line, cleaned.
  const firstLine = content.split('\n').find((l) => l.trim()) ?? '';
  const trimmed = firstLine
    .trim()
    .replace(/^[/#\s*]+/, '')
    .slice(0, 48);
  return trimmed || '(untitled)';
}

/** Sniff a language from content when the fence had no tag. */
export function sniffLanguage(content: string, currentLang: string): string {
  if (currentLang && currentLang !== 'text') return currentLang;
  // TS/JS first: ES-modules `from "x"` and arrow-functions are distinctive
  if (/^\s*import\s+(?:\{[^}]*\}|\w+|\*\s+as\s+\w+).*\s+from\s+["']/m.test(content))
    return 'typescript';
  if (/^\s*(?:export\s+)?(?:function|const|let|interface|type|enum)\s+\w/m.test(content))
    return 'typescript';
  // Python: `def`, `class`, `from x import y`, bare `import x` (single token)
  if (/^\s*(?:def\s+\w|class\s+\w|from\s+[\w.]+\s+import\b)/m.test(content)) return 'python';
  if (/^\s*import\s+[\w.]+\s*(?:as\s+\w+)?\s*$/m.test(content)) return 'python';
  if (/^\s*package\s+\w+/m.test(content) && /func\s+/m.test(content)) return 'go';
  if (/^\s*(?:pub\s+)?fn\s+\w+/m.test(content)) return 'rust';
  if (/^\s*\{[\s\S]*"\w+"\s*:/m.test(content.trim().slice(0, 80))) return 'json';
  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/im.test(content)) return 'sql';
  if (
    /^\s*#\!\/.*\b(?:bash|sh|zsh)\b/m.test(content) ||
    /^\s*(?:export |echo |cd |if \[)/m.test(content)
  )
    return 'bash';
  return currentLang || 'text';
}
