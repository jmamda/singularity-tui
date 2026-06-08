import { describe, it, expect } from 'vitest';
import { extractConfidence, stripConfidenceLine, confidenceBadge } from '../confidence.js';

describe('extractConfidence', () => {
  it('parses numeric 0..1', () => {
    expect(extractConfidence('CONFIDENCE: 0.7\n\nanswer')?.value).toBeCloseTo(0.7);
  });
  it('parses percentage', () => {
    expect(extractConfidence('CONFIDENCE: 70%')?.value).toBeCloseTo(0.7);
  });
  it('parses symbolic high/medium/low', () => {
    expect(extractConfidence('CONFIDENCE: high')?.value).toBeGreaterThan(0.8);
    expect(extractConfidence('CONFIDENCE: low')?.value).toBeLessThan(0.4);
  });
  it('returns null when absent', () => {
    expect(extractConfidence('just an answer')).toBeNull();
  });
  it('rejects out-of-range numerics', () => {
    expect(extractConfidence('CONFIDENCE: 5')).toBeNull();
  });
});

describe('stripConfidenceLine', () => {
  it('removes the confidence line and leading blanks', () => {
    expect(stripConfidenceLine('CONFIDENCE: 0.9\n\nhello')).toBe('hello');
  });
});

describe('confidenceBadge', () => {
  it('maps to HI/MED/LO', () => {
    expect(confidenceBadge(0.9).trim()).toBe('HI');
    expect(confidenceBadge(0.6).trim()).toBe('MED');
    expect(confidenceBadge(0.2).trim()).toBe('LO');
    expect(confidenceBadge(undefined)).toBe('');
  });
});
