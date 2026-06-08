import { describe, it, expect } from 'vitest';
import { extractNotes, newNotesOnly } from '../autoNotes.js';
import { extractClarifications, clarifyFollowup } from '../clarify.js';
import { extractComments, resolveArtifactRef } from '../commentOn.js';
import { extractPlan } from '../planExec.js';
import type { Artifact } from '../artifacts.js';

describe('extractNotes', () => {
  it('pulls marker lines and ## Notes bullets, deduped', () => {
    const text = `NOTE: postgres 17 on staging
IMPORTANT: don't drop session_token

## Notes
- redirect URL is in nginx
- postgres 17 on staging`;
    const notes = extractNotes(text);
    expect(notes).toContain('postgres 17 on staging');
    expect(notes).toContain("don't drop session_token");
    expect(notes).toContain('redirect URL is in nginx');
    // dedupe (case-insensitive)
    expect(notes.filter((n) => n === 'postgres 17 on staging')).toHaveLength(1);
  });
});

describe('newNotesOnly', () => {
  it('filters out already-known notes case-insensitively', () => {
    expect(newNotesOnly(['A', 'b'], ['a'])).toEqual(['b']);
  });
});

describe('extractClarifications', () => {
  it('extracts CLARIFY questions', () => {
    const qs = extractClarifications('CLARIFY: which stack?\nCLARIFY: which provider?');
    expect(qs).toEqual(['which stack?', 'which provider?']);
  });
  it('clarifyFollowup composes a resumable block', () => {
    expect(clarifyFollowup('q?', 'a!')).toContain('Q: q?');
    expect(clarifyFollowup('q?', 'a!')).toContain('A: a!');
  });
});

describe('extractComments + resolveArtifactRef', () => {
  const arts: Artifact[] = [
    { id: 'a1', seq: 14, sourceSlot: 1, sourceLabel: 'CLAUDE', lang: 'ts', content: 'export function h(){}', createdAt: 1, title: 'src/auth/middleware.ts' },
    { id: 'a2', seq: 15, sourceSlot: 2, sourceLabel: 'OPENCODE', lang: 'py', content: 'def calc(): ...', createdAt: 2, title: 'def calc()' },
  ];
  it('extracts COMMENT-ON markers', () => {
    const cs = extractComments('COMMENT-ON: #14 :: n+1 query here');
    expect(cs[0]?.ref).toBe('#14');
    expect(cs[0]?.text).toContain('n+1');
  });
  it('resolves by #N, title, label', () => {
    expect(resolveArtifactRef('#14', arts)?.id).toBe('a1');
    expect(resolveArtifactRef('14', arts)?.id).toBe('a1');
    expect(resolveArtifactRef('middleware', arts)?.id).toBe('a1');
    expect(resolveArtifactRef('calc', arts)?.id).toBe('a2');
    expect(resolveArtifactRef('CLAUDE', arts)?.id).toBe('a1');
    expect(resolveArtifactRef('nonexistent', arts)).toBeNull();
  });
});

describe('extractPlan', () => {
  it('parses a JSON steps block', () => {
    const steps = extractPlan('```json\n{ "steps": [{ "slot": 2, "task": "write tests" }] }\n```');
    expect(steps).toHaveLength(1);
    expect(steps[0]?.slot).toBe(2);
    expect(steps[0]?.task).toBe('write tests');
  });
  it('falls back to numbered [pane N] lines', () => {
    const steps = extractPlan('1. [pane 3] review the code\n2. [pane 2] write tests');
    expect(steps).toHaveLength(2);
    expect(steps[0]?.slot).toBe(3);
  });
  it('returns empty for unparseable text', () => {
    expect(extractPlan('no plan here')).toEqual([]);
  });
});
