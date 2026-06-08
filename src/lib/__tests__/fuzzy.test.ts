import { describe, it, expect } from 'vitest';
import { fuzzyScore, fuzzyRank } from '../fuzzy.js';

describe('fuzzyScore', () => {
  it('matches characters in order', () => {
    const r = fuzzyScore('hl', 'help')!;
    expect(r.matches).toEqual([0, 2]); // h@0, l@2 in "help"
    expect(r.score).toBeGreaterThan(0);
  });

  it('returns null if not all query chars match', () => {
    expect(fuzzyScore('xyz', 'abc')).toBeNull();
  });

  it('empty query scores 0', () => {
    expect(fuzzyScore('', 'foo')).toEqual({ score: 0, matches: [] });
  });
});

describe('fuzzyRank', () => {
  it('ranks better matches higher', () => {
    const items = [{ s: '/note' }, { s: '/notes' }, { s: '/snippet' }];
    const ranked = fuzzyRank('not', items, (i) => i.s);
    expect(ranked[0]!.item.s).toMatch(/note/);
    expect(ranked.length).toBe(2); // /snippet doesn't match
  });
  it('empty query keeps all items', () => {
    const items = [{ s: 'a' }, { s: 'b' }];
    expect(fuzzyRank('', items, (i) => i.s)).toHaveLength(2);
  });
});
