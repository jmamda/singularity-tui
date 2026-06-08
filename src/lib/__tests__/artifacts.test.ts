import { describe, it, expect } from 'vitest';
import { CodeBlockExtractor, inferTitle, sniffLanguage } from '../artifacts.js';

describe('CodeBlockExtractor', () => {
  it('extracts a complete block streamed in small chunks', () => {
    const ex = new CodeBlockExtractor();
    const sample = 'text\n```python\ndef add(a, b):\n    return a + b\n```\nmore';
    const out: { lang: string; content: string }[] = [];
    for (let i = 0; i < sample.length; i += 5) out.push(...ex.feed(sample.slice(i, i + 5)));
    expect(out).toHaveLength(1);
    expect(out[0]?.lang).toBe('python');
    expect(out[0]?.content).toBe('def add(a, b):\n    return a + b');
  });
  it('exposes a partial while mid-block, null after close', () => {
    const ex = new CodeBlockExtractor();
    ex.feed('```ts\nconst x = 1');
    expect(ex.partial()?.content).toBe('const x = 1');
    ex.feed('\n```\n');
    expect(ex.partial()).toBeNull();
  });
  it('handles two blocks in one stream', () => {
    const ex = new CodeBlockExtractor();
    const out = ex.feed('```js\na\n```\n```py\nb\n```\n');
    expect(out).toHaveLength(2);
    expect(out[0]?.content).toBe('a');
    expect(out[1]?.content).toBe('b');
  });
});

describe('inferTitle', () => {
  it('pulls python def signature', () => {
    expect(inferTitle('def calculate_total(items, tax):\n  pass')).toContain('calculate_total');
  });
  it('pulls a file-path header comment', () => {
    expect(inferTitle('// src/auth/middleware.ts\nimport x')).toBe('src/auth/middleware.ts');
  });
});

describe('sniffLanguage', () => {
  it('keeps an explicit tag', () => {
    expect(sniffLanguage('whatever', 'rust')).toBe('rust');
  });
  it('distinguishes TS imports from python imports', () => {
    expect(sniffLanguage('import { X } from "y";', '')).toBe('typescript');
    expect(sniffLanguage('import os\nimport sys', '')).toBe('python');
  });
  it('detects SQL DDL', () => {
    expect(sniffLanguage('CREATE TABLE users (id int);', '')).toBe('sql');
  });
});
