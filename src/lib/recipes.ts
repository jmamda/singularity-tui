import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RecipeStep {
  /** Operator-prefixed prompt OR a slash command */
  do: string;
  target?: number | number[];
  timeoutSec?: number;
  /** e.g. "5 exec:^npm test 600" — runs /grant <needs> first. */
  needs?: string;
  continueOnError?: boolean;
}

export interface Recipe {
  name: string;
  description: string;
  usecase?: number;
  steps: RecipeStep[];
}

export interface Dispatcher {
  dispatch(input: string, targetSlots: number[]): Promise<void>;
  runSlash(text: string): Promise<{ ok: boolean; message?: string }>;
}

export interface RunResult {
  ok: boolean;
  stepsRun: number;
  failed?: { step: number; reason: string };
}

const RECIPE_DIR_USER = join(homedir(), '.singularity', 'recipes');
// Resolve relative to this module so bundled examples are reachable from any cwd.
// dist/lib/recipes.js → ../../examples/recipes
const RECIPE_DIR_EXAMPLES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'examples',
  'recipes',
);

/** Tiny YAML subset parser — supports lists, maps, scalars, `|` block scalars. */
export function parseYaml(src: string): any {
  const rawLines = src.split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  let i = 0;

  const indentOf = (s: string) => s.match(/^ */)![0].length;
  const coerce = (v: string): any => {
    const t = v.trim();
    if (t === '' || t === '~' || t === 'null') return null;
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    if (/^-?\d*\.\d+$/.test(t)) return parseFloat(t);
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
    return t;
  };

  function parseBlock(indent: number): any {
    while (i < rawLines.length && rawLines[i]!.trim() === '') i++;
    if (i >= rawLines.length) return null;
    const first = rawLines[i]!;
    if (indentOf(first) < indent) return null;
    const isList = first.slice(indent).startsWith('- ');
    return isList ? parseList(indent) : parseMap(indent);
  }

  function parseMap(indent: number): Record<string, any> {
    const out: Record<string, any> = {};
    while (i < rawLines.length) {
      const line = rawLines[i]!;
      if (line.trim() === '') {
        i++;
        continue;
      }
      if (indentOf(line) < indent) break;
      if (indentOf(line) > indent) break;
      const body = line.slice(indent);
      const m = body.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!m) break;
      const key = m[1]!;
      const rest = m[2]!;
      i++;
      if (rest === '|') {
        const lines: string[] = [];
        while (
          i < rawLines.length &&
          (rawLines[i]!.trim() === '' || indentOf(rawLines[i]!) > indent)
        ) {
          lines.push(rawLines[i]!.slice(indent + 2));
          i++;
        }
        out[key] = lines.join('\n').replace(/\n+$/, '');
      } else if (rest === '') {
        out[key] = parseBlock(indent + 2);
      } else {
        out[key] = coerce(rest);
      }
    }
    return out;
  }

  function parseList(indent: number): any[] {
    const out: any[] = [];
    while (i < rawLines.length) {
      const line = rawLines[i]!;
      if (line.trim() === '') {
        i++;
        continue;
      }
      if (indentOf(line) < indent) break;
      const body = line.slice(indent);
      if (!body.startsWith('- ')) break;
      const after = body.slice(2);
      const mapInline = after.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (mapInline) {
        rawLines[i] = ' '.repeat(indent + 2) + after;
        out.push(parseMap(indent + 2));
      } else {
        out.push(coerce(after));
        i++;
      }
    }
    return out;
  }

  return parseBlock(0);
}

function normalize(data: any, fallbackName: string): Recipe {
  if (!data || typeof data !== 'object') throw new Error('Recipe must be a mapping');
  const steps = Array.isArray(data.steps) ? data.steps : [];
  return {
    name: typeof data.name === 'string' ? data.name : fallbackName,
    description: typeof data.description === 'string' ? data.description : '',
    usecase: typeof data.usecase === 'number' ? data.usecase : undefined,
    steps: steps.map(
      (s: any): RecipeStep => ({
        do: String(s.do ?? ''),
        target: s.target,
        timeoutSec: typeof s.timeoutSec === 'number' ? s.timeoutSec : undefined,
        needs: typeof s.needs === 'string' ? s.needs : undefined,
        continueOnError: s.continueOnError === true,
      }),
    ),
  };
}

async function tryLoad(base: string): Promise<Recipe | null> {
  for (const ext of ['.yaml', '.yml', '.json']) {
    try {
      const raw = await fs.readFile(base + ext, 'utf8');
      const data = ext === '.json' ? JSON.parse(raw) : parseYaml(raw);
      return normalize(data, base.split(/[/\\]/).pop()!);
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
  return null;
}

export async function loadRecipe(name: string): Promise<Recipe | null> {
  return (
    (await tryLoad(join(RECIPE_DIR_USER, name))) ?? (await tryLoad(join(RECIPE_DIR_EXAMPLES, name)))
  );
}

export async function listRecipes(): Promise<string[]> {
  const collected = new Set<string>();
  for (const dir of [RECIPE_DIR_USER, RECIPE_DIR_EXAMPLES]) {
    try {
      const entries = await fs.readdir(dir);
      for (const f of entries) {
        const m = f.match(/^(.+)\.(ya?ml|json)$/);
        if (m) collected.add(m[1]!);
      }
    } catch (e: any) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
  return [...collected].sort();
}

function resolveTargets(t: RecipeStep['target']): number[] {
  if (t == null) return [];
  return Array.isArray(t) ? t.slice() : [t];
}

async function withTimeout<T>(p: Promise<T>, sec?: number): Promise<T> {
  if (!sec || sec <= 0) return p;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const guard = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`step timed out after ${sec}s`)), sec * 1000);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Substitute {{date}}, {{time}}, {{version}} placeholders. */
function tmpl(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export async function runRecipe(
  recipe: Recipe,
  dispatcher: Dispatcher,
  vars: Record<string, string> = {},
): Promise<RunResult> {
  const ctx: Record<string, string> = {
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(0, 19).replace('T', '_'),
    ...vars,
  };
  let stepsRun = 0;
  for (let idx = 0; idx < recipe.steps.length; idx++) {
    const step = recipe.steps[idx]!;
    const text = tmpl(step.do?.trim() ?? '', ctx);
    if (!text) continue;
    try {
      if (step.needs) {
        const grant = await dispatcher.runSlash('/grant ' + tmpl(step.needs, ctx));
        if (!grant.ok) throw new Error(grant.message || 'capability denied');
      }
      const op = text.startsWith('/')
        ? dispatcher.runSlash(text).then((r) => {
            if (!r.ok) throw new Error(r.message || 'slash failed');
          })
        : dispatcher.dispatch(text, resolveTargets(step.target));
      await withTimeout(op, step.timeoutSec);
      stepsRun++;
    } catch (err: any) {
      if (step.continueOnError) {
        stepsRun++;
        continue;
      }
      return { ok: false, stepsRun, failed: { step: idx, reason: String(err?.message ?? err) } };
    }
  }
  return { ok: true, stepsRun };
}
