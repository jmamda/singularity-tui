import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  shadowWrite,
  createSnapshot,
  rollbackTo,
  listSnapshots,
  listJournal,
  _resetShadowState,
} from '../shadowfs.js';

const SANDBOX = join(tmpdir(), `singularity-shadow-${Date.now()}`);

async function setup() {
  _resetShadowState();
  await fs.rm(SANDBOX, { recursive: true, force: true });
  await fs.mkdir(SANDBOX, { recursive: true });
}

describe('shadowfs', () => {
  beforeEach(setup);

  it('journals new-file writes and rollback removes them', async () => {
    const path = join(SANDBOX, 'a.txt');
    await shadowWrite(path, 'hello');
    expect(await fs.readFile(path, 'utf8')).toBe('hello');
    const root = listSnapshots()[0]!.id;
    const r = await rollbackTo(root);
    expect(r.deleted).toBe(1);
    await expect(fs.access(path)).rejects.toThrow();
  });

  it('rollback restores previous content of overwritten files', async () => {
    const path = join(SANDBOX, 'b.txt');
    await fs.writeFile(path, 'original', 'utf8');
    await shadowWrite(path, 'modified');
    expect(await fs.readFile(path, 'utf8')).toBe('modified');
    const root = listSnapshots()[0]!.id;
    const r = await rollbackTo(root);
    expect(r.restored).toBe(1);
    expect(await fs.readFile(path, 'utf8')).toBe('original');
  });

  it('snapshots bucket writes so rollback to a later snapshot keeps earlier ones', async () => {
    const a = join(SANDBOX, 'a.txt');
    const b = join(SANDBOX, 'b.txt');
    await shadowWrite(a, 'a1'); // snapshot root
    const snap = createSnapshot('mid');
    await shadowWrite(b, 'b1'); // snapshot mid
    await rollbackTo(snap.id);
    expect(await fs.readFile(a, 'utf8')).toBe('a1'); // kept
    await expect(fs.access(b)).rejects.toThrow(); // undone
    expect(listJournal()).toHaveLength(1); // only the pre-snap entry survives
  });
});
