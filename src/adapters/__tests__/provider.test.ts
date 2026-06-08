import { describe, it, expect } from 'vitest';
import { makeProviderAdapter, parseProviderUri } from '../provider.js';

describe('parseProviderUri', () => {
  it('parses anthropic', () => {
    expect(parseProviderUri('anthropic://claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
  });
  it('parses openai', () => {
    expect(parseProviderUri('openai://gpt-5.1')).toEqual({ provider: 'openai', model: 'gpt-5.1' });
  });
  it('parses openrouter with slash model', () => {
    expect(parseProviderUri('openrouter://anthropic/claude-3.5-sonnet')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-3.5-sonnet',
    });
  });
  it('parses ollama', () => {
    expect(parseProviderUri('ollama://llama3:8b')).toEqual({ provider: 'ollama', model: 'llama3:8b' });
  });
  it('returns null for unknown', () => {
    expect(parseProviderUri('claude:foo')).toBeNull();
  });
});

describe('makeProviderAdapter shape', () => {
  it('returns an Adapter object', () => {
    const a = makeProviderAdapter({
      id: 'a',
      label: 'A',
      provider: 'openai',
      model: 'gpt-x',
    });
    expect(a.id).toBe('a');
    expect(a.label).toBe('A');
    expect(typeof a.send).toBe('function');
  });
});
