import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface FileNode {
  path: string;
  lang: string;
  lastModified: number;
  loc: number;
}

export interface SymbolEntry {
  file: string;
  kind: 'function' | 'class' | 'type' | 'const' | 'interface';
  name: string;
  line: number;
  exported: boolean;
}

export interface ImportEdge {
  from: string;
  to: string;
  specifiers: string[];
}

export interface GraphView {
  files: FileNode[];
  symbols: SymbolEntry[];
  imports: ImportEdge[];
  hotSpots: { path: string; score: number }[];
  fresh(): Promise<void>;
  query(opts: { symbol?: string; path?: string }): { hits: SymbolEntry[]; callers: ImportEdge[] };
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage', '.next']);
const EXT_LANG: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
};

const SYMBOL_RE =
  /^\s*(export\s+)?(?:(?:async)\s+)?(function|class|interface|type|const)\s+([A-Za-z_$][\w$]*)/m;
const IMPORT_RE =
  /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]+)\})?\s*from\s*['"]([^'"]+)['"]/g;

async function walk(root: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (e) => {
      if (e.name.startsWith('.')) return;
      const full = path.join(root, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) return;
        await walk(full, out);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (ext in EXT_LANG) out.push(full);
      }
    }),
  );
}

function parseSymbols(file: string, src: string): SymbolEntry[] {
  const lines = src.split('\n');
  const symbols: SymbolEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = SYMBOL_RE.exec(lines[i]!);
    if (!m) continue;
    symbols.push({
      file,
      kind: m[2] as SymbolEntry['kind'],
      name: m[3]!,
      line: i + 1,
      exported: Boolean(m[1]),
    });
  }
  return symbols;
}

function parseImports(file: string, src: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(IMPORT_RE);
  while ((m = re.exec(src)) !== null) {
    const def = m[1];
    const named = m[2];
    const to = m[3]!;
    const specifiers: string[] = [];
    if (def) specifiers.push(def);
    if (named) {
      for (const s of named.split(',')) {
        const t = s.trim().split(/\s+as\s+/)[0];
        if (t) specifiers.push(t);
      }
    }
    edges.push({ from: file, to, specifiers });
  }
  return edges;
}

function computeHotSpots(files: FileNode[]): { path: string; score: number }[] {
  const now = Date.now();
  const DAY = 86_400_000;
  return files
    .map((f) => {
      const ageDays = Math.max(0, (now - f.lastModified) / DAY);
      const recency = Math.exp(-ageDays / 3);
      const sizeFactor = Math.min(1, f.loc / 500);
      return { path: f.path, score: Number((recency * (0.5 + sizeFactor)).toFixed(4)) };
    })
    .filter((h) => h.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 25);
}

export function makeGraphView(cwd: string = process.cwd()): GraphView {
  const state: GraphView = {
    files: [],
    symbols: [],
    imports: [],
    hotSpots: [],
    async fresh() {
      const found: string[] = [];
      await walk(cwd, found);
      const files: FileNode[] = [];
      const symbols: SymbolEntry[] = [];
      const imports: ImportEdge[] = [];
      await Promise.all(
        found.map(async (full) => {
          try {
            const [stat, src] = await Promise.all([fs.stat(full), fs.readFile(full, 'utf8')]);
            const rel = path.relative(cwd, full);
            const ext = path.extname(full);
            files.push({
              path: rel,
              lang: EXT_LANG[ext] ?? 'unknown',
              lastModified: stat.mtimeMs,
              loc: src.split('\n').length,
            });
            symbols.push(...parseSymbols(rel, src));
            imports.push(...parseImports(rel, src));
          } catch {
            /* unreadable; skip */
          }
        }),
      );
      state.files = files;
      state.symbols = symbols;
      state.imports = imports;
      state.hotSpots = computeHotSpots(files);
    },
    query(opts) {
      const hits = state.symbols.filter((s) => {
        if (opts.symbol && s.name !== opts.symbol) return false;
        if (opts.path && !s.file.includes(opts.path)) return false;
        return true;
      });
      const hitFiles = new Set(hits.map((h) => h.file));
      const callers = state.imports.filter((e) => {
        if (opts.symbol && !e.specifiers.includes(opts.symbol)) return false;
        if (opts.path && !(e.to.includes(opts.path) || hitFiles.has(e.from))) return false;
        return true;
      });
      return { hits, callers };
    },
  };
  return state;
}
