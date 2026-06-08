import { describe, it, expect } from 'vitest';
import { diffLines, diffStat, renderUnifiedDiff } from '../diff.js';

describe('diffLines', () => {
  it('detects added and removed lines', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc');
    const stat = diffStat(d);
    expect(stat.removed).toBe(1); // b
    expect(stat.added).toBe(1); // x
    expect(d.some((l) => l.kind === ' ' && l.text === 'a')).toBe(true);
  });
  it('identical text yields no changes', () => {
    expect(diffStat(diffLines('same\ntext', 'same\ntext'))).toEqual({ added: 0, removed: 0 });
  });
});

describe('renderUnifiedDiff', () => {
  it('reports identical', () => {
    expect(renderUnifiedDiff('x', 'x')).toContain('identical');
  });
  it('shows +/- counts', () => {
    const out = renderUnifiedDiff('a\nb', 'a\nc');
    expect(out).toContain('+1');
    expect(out).toContain('-1');
  });
});
