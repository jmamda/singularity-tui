/**
 * Tiny dependency-free fuzzy matcher. Scores higher for: consecutive matches,
 * earlier matches, matches at word boundaries. Used by the command palette.
 */

export interface ScoredItem<T> {
  item: T;
  score: number;
  /** Indices in the target string that matched the query, for highlighting. */
  matches: number[];
}

export function fuzzyScore(query: string, target: string): { score: number; matches: number[] } | null {
  if (!query) return { score: 0, matches: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const matches: number[] = [];
  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let prevMatchIdx = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      matches.push(i);
      // Reward: word-boundary match, earlier position, consecutive
      const isWordBoundary = i === 0 || /[\s/_.-]/.test(t[i - 1]!);
      const isConsecutive = i === prevMatchIdx + 1;
      score += 1;
      if (isWordBoundary) score += 2;
      if (isConsecutive) {
        consecutive++;
        score += consecutive;
      } else {
        consecutive = 0;
      }
      score -= i * 0.01; // mild preference for earlier matches
      prevMatchIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return null; // not all query chars matched
  return { score, matches };
}

export function fuzzyRank<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): ScoredItem<T>[] {
  if (!query.trim()) {
    return items.map((item) => ({ item, score: 0, matches: [] }));
  }
  const out: ScoredItem<T>[] = [];
  for (const item of items) {
    const r = fuzzyScore(query, getText(item));
    if (r) out.push({ item, score: r.score, matches: r.matches });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
