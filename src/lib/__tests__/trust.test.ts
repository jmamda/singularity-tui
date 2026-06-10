import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX = join(tmpdir(), `singularity-trust-${Date.now()}`);
process.env.SINGULARITY_DIR = SANDBOX;

const { loadTrust, saveTrust } = await import('../trust.js');
const { TRUST_FILE } = await import('../paths.js');

describe('trust persistence', () => {
  beforeEach(async () => {
    await fs.rm(SANDBOX, { recursive: true, force: true });
  });

  it('round-trips a trust map', async () => {
    await saveTrust({ 1: 0.5, 2: 0.9 });
    expect(await loadTrust()).toEqual({ 1: 0.5, 2: 0.9 });
  });

  it('returns null when the file is missing', async () => {
    expect(await loadTrust()).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    await fs.mkdir(SANDBOX, { recursive: true });
    await fs.writeFile(TRUST_FILE, 'not json', 'utf8');
    expect(await loadTrust()).toBeNull();
  });

  it('drops out-of-range and non-numeric values', async () => {
    await fs.mkdir(SANDBOX, { recursive: true });
    await fs.writeFile(
      TRUST_FILE,
      JSON.stringify({ 1: 0.4, 2: 1.5, 3: -0.1, 4: 'high', notASlot: 0.5 }),
      'utf8',
    );
    expect(await loadTrust()).toEqual({ 1: 0.4 });
  });
});
