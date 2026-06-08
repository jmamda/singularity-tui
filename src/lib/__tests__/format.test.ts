import { describe, it, expect } from 'vitest';
import { fmtCost, fmtDuration, fmtTokens } from '../format.js';

describe('fmtCost', () => {
  it('handles zero and tiny', () => {
    expect(fmtCost(0)).toBe('$0');
    expect(fmtCost(0.0001)).toBe('<$0.001');
  });
  it('scales by magnitude', () => {
    expect(fmtCost(0.005)).toBe('$0.005');
    expect(fmtCost(0.05)).toBe('$0.05');
    expect(fmtCost(1.5)).toBe('$1.50');
    expect(fmtCost(12.4)).toBe('$12.4');
    expect(fmtCost(123)).toBe('$123');
  });
});

describe('fmtDuration', () => {
  it('formats across scales', () => {
    expect(fmtDuration(400)).toBe('400ms');
    expect(fmtDuration(2500)).toBe('2s');
    expect(fmtDuration(72000)).toBe('1m12s');
    expect(fmtDuration(900000)).toBe('15m');
    expect(fmtDuration(7200000)).toBe('2h');
  });
});

describe('fmtTokens', () => {
  it('abbreviates thousands', () => {
    expect(fmtTokens(42)).toBe('42');
    expect(fmtTokens(1428)).toBe('1.4k');
    expect(fmtTokens(14280)).toBe('14k');
  });
});
