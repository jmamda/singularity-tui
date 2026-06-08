import { describe, it, expect } from 'vitest';
import { classifyVote, tally } from '../quorum.js';

describe('classifyVote', () => {
  it('classifies clear YES', () => {
    expect(classifyVote('YES\n\nthis is safe')).toBe('YES');
  });
  it('classifies clear NO', () => {
    expect(classifyVote('NO\n\nthis will break prod')).toBe('NO');
  });
  it('treats "yes but" (yes+no signals) as ABSTAIN', () => {
    expect(classifyVote('yes, but do not proceed without tests')).toBe('ABSTAIN');
  });
  it('returns ABSTAIN when neither signal present', () => {
    expect(classifyVote('it depends on the deployment window')).toBe('ABSTAIN');
  });
  it('only inspects the head of the response', () => {
    const longTail = 'YES\n' + 'x'.repeat(1000) + ' no ';
    expect(classifyVote(longTail)).toBe('YES');
  });
});

describe('tally', () => {
  it('counts unweighted votes', () => {
    const t = tally(['YES', 'YES', 'NO', 'ABSTAIN']);
    expect(t.yes).toBe(2);
    expect(t.no).toBe(1);
    expect(t.abstain).toBe(1);
    expect(t.verdict).toBe('YES');
  });
  it('returns PENDING with no decisive votes', () => {
    expect(tally(['ABSTAIN', 'ABSTAIN']).verdict).toBe('PENDING');
  });
  it('detects a tie', () => {
    expect(tally(['YES', 'NO']).verdict).toBe('TIE');
  });
  it('weights by confidence', () => {
    const t = tally([
      { vote: 'YES', confidence: 0.3 },
      { vote: 'NO', confidence: 0.95 },
    ]);
    expect(t.verdict).toBe('NO'); // weighted NO wins despite 1-1 raw
    expect(t.yesWeighted).toBeCloseTo(0.3);
    expect(t.noWeighted).toBeCloseTo(0.95);
  });
});
