import { makeGraphView, type GraphView } from './graphView.js';
import { readGit, readBuild, readAgent } from './gitBuildView.js';
import type { WorldContext } from './query.js';

export * from './graphView.js';
export * from './gitBuildView.js';
export * from './query.js';

// Graph walk is the expensive bit; cache for a short window so repeated
// `/world …` calls don't re-walk the tree. Git/build/agent are cheap & always fresh.
const CACHE_TTL_MS = 5_000;
let cached: { cwd: string; graph: GraphView; at: number } | null = null;

/** Build (or refresh) a WorldContext snapshot. Graph is cached for {@link CACHE_TTL_MS}. */
export async function makeWorldContext(cwd: string = process.cwd()): Promise<WorldContext> {
  let graph: GraphView;
  if (cached && cached.cwd === cwd && Date.now() - cached.at < CACHE_TTL_MS) {
    graph = cached.graph;
  } else {
    graph = makeGraphView(cwd);
    await graph.fresh();
    cached = { cwd, graph, at: Date.now() };
  }
  const git = await readGit(cwd);
  return { graph, git, build: readBuild(), agent: readAgent() };
}

/** Drop the graph cache (called by /world refresh). */
export function invalidateWorldCache(): void {
  cached = null;
}
