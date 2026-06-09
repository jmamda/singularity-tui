import type { GraphView } from './graphView.js';
import type { GitSnapshot, BuildSnapshot, AgentSnapshot } from './gitBuildView.js';

export interface WorldContext {
  graph: GraphView;
  git: GitSnapshot | null;
  build: BuildSnapshot;
  agent: AgentSnapshot;
}

export interface QueryResult {
  ok: boolean;
  message: string;
}

const STALE_BUILD_MS = 5 * 60 * 1000;

function topLanguages(graph: GraphView): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const f of graph.files) {
    counts.set(f.lang, (counts.get(f.lang) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export function describe(ctx: WorldContext): QueryResult {
  const fileCount = ctx.graph.files.length;
  const langs = topLanguages(ctx.graph)
    .map(([lang, n]) => `${lang} (${n})`)
    .join(', ');
  const commits = ctx.git?.recentSubjects ?? [];
  const branch = ctx.git?.branch ?? '(no git)';
  const lines: string[] = [];
  lines.push(`Project: ${fileCount} files on branch ${branch}.`);
  if (langs) lines.push(`Top languages: ${langs}.`);
  if (commits.length) {
    lines.push('Recent commits:');
    for (const c of commits) lines.push(`  - ${c}`);
  }
  return { ok: true, message: lines.join('\n') };
}

export function callers(ctx: WorldContext, symbol: string): QueryResult {
  if (!symbol) return { ok: false, message: 'callers: symbol required' };
  const hits: string[] = [];
  for (const edge of ctx.graph.imports) {
    if (edge.specifiers.includes(symbol)) hits.push(edge.from);
  }
  if (hits.length === 0) return { ok: true, message: `No callers found for "${symbol}".` };
  return {
    ok: true,
    message:
      `Callers of "${symbol}" (${hits.length}):\n` +
      hits
        .slice(0, 30)
        .map((h) => `  - ${h}`)
        .join('\n'),
  };
}

export function impact(ctx: WorldContext, target: string): QueryResult {
  if (!target) return { ok: false, message: 'impact: path required' };
  // Strip extension for matching since imports may omit it
  const base = target.replace(/\.(ts|tsx|js|jsx|mjs)$/, '');
  const downstream = new Set<string>();
  for (const edge of ctx.graph.imports) {
    if (edge.to === target || edge.to.endsWith(`/${base}`) || edge.to === base) {
      downstream.add(edge.from);
    }
  }
  if (downstream.size === 0) {
    return { ok: true, message: `No downstream files import "${target}".` };
  }
  const list = [...downstream].sort();
  return {
    ok: true,
    message:
      `Impact of "${target}" (${list.length} downstream):\n` +
      list
        .slice(0, 30)
        .map((f) => `  - ${f}`)
        .join('\n'),
  };
}

export function know(_ctx: WorldContext, topic: string, notes: string[]): QueryResult {
  if (!topic) return { ok: false, message: 'know: topic required' };
  const needle = topic.toLowerCase();
  const matches = notes.filter((n) => n.toLowerCase().includes(needle));
  if (matches.length === 0) return { ok: true, message: `No notes mention "${topic}".` };
  return {
    ok: true,
    message:
      `Room knows about "${topic}" (${matches.length}):\n` +
      matches.map((m, i) => `  ${i + 1}. ${m}`).join('\n'),
  };
}

export function whyPane(
  _ctx: WorldContext,
  slot: number,
  lastTurns: Array<{ role: string; content: string }>,
): QueryResult {
  const userTurns = lastTurns.filter((t) => t.role === 'user').slice(-2);
  if (userTurns.length === 0) {
    return { ok: true, message: `Pane ${slot}: no recent user turns to explain.` };
  }
  const summary = userTurns
    .map((t) => t.content.replace(/\s+/g, ' ').trim().slice(0, 160))
    .join(' Then: ');
  return {
    ok: true,
    message: `Pane ${slot} acted on the user's recent direction: ${summary}`,
  };
}

export function diff(ctx: WorldContext, lastCtx: WorldContext | null): QueryResult {
  if (!lastCtx) return { ok: true, message: 'No prior state — baseline established.' };
  const prevFiles = new Set(lastCtx.graph.files.map((f) => f.path));
  const currFiles = new Set(ctx.graph.files.map((f) => f.path));
  const added: string[] = [];
  const removed: string[] = [];
  for (const p of currFiles) if (!prevFiles.has(p)) added.push(p);
  for (const p of prevFiles) if (!currFiles.has(p)) removed.push(p);
  const prevDirty = lastCtx.git?.dirty.length ?? 0;
  const currDirty = ctx.git?.dirty.length ?? 0;
  const lines: string[] = ['World-model delta since last snapshot:'];
  lines.push(`  files: +${added.length} / -${removed.length}`);
  if (added.length) lines.push(`    added: ${added.slice(0, 5).join(', ')}`);
  if (removed.length) lines.push(`    removed: ${removed.slice(0, 5).join(', ')}`);
  lines.push(`  dirty paths: ${prevDirty} → ${currDirty}`);
  const prevTcOk = lastCtx.build.typecheck.ok;
  const currTcOk = ctx.build.typecheck.ok;
  if (prevTcOk !== currTcOk)
    lines.push(`  typecheck: ${prevTcOk ? 'ok' : 'fail'} → ${currTcOk ? 'ok' : 'fail'}`);
  return { ok: true, message: lines.join('\n') };
}

export function uncertain(ctx: WorldContext): QueryResult {
  const gaps: string[] = [];
  const now = Date.now();
  const buildAge = now - ctx.build.typecheck.at;
  if (ctx.build.typecheck.at === 0 || buildAge > STALE_BUILD_MS) {
    const mins = Math.round(buildAge / 60_000);
    gaps.push(
      `Build snapshot stale (${ctx.build.typecheck.at === 0 ? 'never recorded' : `${mins} min old`}).`,
    );
  }
  if (!ctx.git) gaps.push('Git poll missing — branch and dirty state unknown.');
  const filesWithSymbols = new Set(ctx.graph.symbols.map((s) => s.file));
  const missing = ctx.graph.files.filter((f) => !filesWithSymbols.has(f.path));
  if (missing.length > 0) {
    gaps.push(
      `No symbol data for ${missing.length} files (e.g. ${missing
        .slice(0, 3)
        .map((m) => m.path)
        .join(', ')}).`,
    );
  }
  if (gaps.length === 0) return { ok: true, message: 'World model has no notable gaps.' };
  return { ok: true, message: 'Uncertain areas:\n' + gaps.map((g) => `  - ${g}`).join('\n') };
}

const VERB_RE =
  /\b(add|fix|refactor|run|test|build|remove|rename|move|implement|deploy|review|check|update|debug)\b/i;
const NOUN_RE = /\b([A-Za-z_][A-Za-z0-9_]{2,})\b/g;

function lastVerb(prompts: string[]): string | null {
  for (let i = prompts.length - 1; i >= 0; i--) {
    const m = prompts[i]!.match(VERB_RE);
    if (m) return m[1]!.toLowerCase();
  }
  return null;
}

function lastNoun(prompts: string[]): string | null {
  for (let i = prompts.length - 1; i >= 0; i--) {
    const matches = prompts[i]!.match(NOUN_RE);
    if (!matches) continue;
    const candidate = matches.find((t) => !VERB_RE.test(t));
    if (candidate) return candidate;
  }
  return null;
}

export function nextLikelyPrompt(_ctx: WorldContext, recentPrompts: string[]): QueryResult {
  if (recentPrompts.length === 0)
    return { ok: true, message: 'No prior prompts — cannot predict next.' };
  const verb = lastVerb(recentPrompts) ?? 'review';
  const noun = lastNoun(recentPrompts) ?? 'the change';
  return { ok: true, message: `Likely next prompt: "${verb} ${noun}"` };
}
