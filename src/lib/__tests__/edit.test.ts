import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { runSlash } from '../../commands/registry.js';
import { store } from '../../store.js';

// /edit refuses absolute paths, so the fixture must be cwd-relative.
const fixture = `edit-test-${Date.now()}.txt`;

beforeAll(async () => {
  await fs.writeFile(fixture, 'hello world\n');
  store.addCapability({
    id: 'edit-test',
    slot: 1,
    kind: 'write',
    pattern: '**',
    grantedBy: null,
    expiresAt: Number.POSITIVE_INFINITY,
  });
});

afterAll(async () => {
  await fs.unlink(fixture).catch(() => {});
});

describe('/edit empty-find regression', () => {
  it('refuses an empty find string (data-corruption guard)', async () => {
    const r = await runSlash(`/edit ${fixture} ::  :: BAD`, [1]);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/cannot be empty/);
    const after = await fs.readFile(fixture, 'utf8');
    expect(after).toBe('hello world\n');
  });
});
