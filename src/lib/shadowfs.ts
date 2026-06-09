/**
 * Shadow execution — a journaled write proxy that lets us roll back any file
 * write performed through Singularity. We don't reimplement APFS snapshots;
 * instead we record (path → previous bytes | null) and (path → new bytes) for
 * every write, so /rollback restores the prior state.
 *
 * Used by /apply (the artifact writer), the shell adapter's redirection paths,
 * and the OS-event triggers. Reads are not journaled.
 */

import { promises as fs, createWriteStream, type WriteStream } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { JOURNAL_FILE, DIR } from './paths.js';

export interface JournalEntry {
  id: string;
  at: number;
  /** Absolute path written. */
  path: string;
  /** Bytes that existed before the write; null if file didn't exist. */
  previous: Buffer | null;
  /** Bytes written. Kept for audit and replay. */
  next: Buffer;
  /** Optional source slot for attribution. */
  bySlot?: number;
  /** Optional human label (e.g. artifact #N or trigger name). */
  label?: string;
  /** Snapshot id this entry belongs to (entries are bucketed by snapshot). */
  snapshotId: string;
}

export interface Snapshot {
  id: string;
  name: string;
  createdAt: number;
}

let snapshots: Snapshot[] = [{ id: 'root', name: 'root', createdAt: Date.now() }];
let journal: JournalEntry[] = [];
let entryCounter = 0;
let persistStream: WriteStream | null = null;
let persistEnabled = false;

/** Enable JSONL persistence to ~/.singularity/journal.jsonl. Survives crashes. */
export async function enablePersistence(): Promise<void> {
  if (persistEnabled) return;
  await fs.mkdir(DIR, { recursive: true });
  persistStream = createWriteStream(JOURNAL_FILE, { flags: 'a' });
  persistEnabled = true;
}

/** Replay the on-disk journal back into memory so /rollback works across restarts. */
export async function restorePersistedJournal(): Promise<{ entries: number } | null> {
  try {
    const text = await fs.readFile(JOURNAL_FILE, 'utf8');
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const obj = JSON.parse(s);
        if (obj.type === 'snapshot') {
          snapshots.push({ id: obj.id, name: obj.name, createdAt: obj.createdAt });
        } else if (obj.type === 'entry') {
          journal.push({
            ...obj.entry,
            previous: obj.entry.previous ? Buffer.from(obj.entry.previous, 'base64') : null,
            next: Buffer.from(obj.entry.next, 'base64'),
          });
          entryCounter = Math.max(entryCounter, journal.length);
        }
      } catch {
        /* skip malformed line */
      }
    }
    return { entries: journal.length };
  } catch {
    return null;
  }
}

function persistLine(obj: object): void {
  if (!persistEnabled || !persistStream) return;
  persistStream.write(JSON.stringify(obj) + '\n');
}

function currentSnapshotId(): string {
  return snapshots[snapshots.length - 1]!.id;
}

export function listSnapshots(): Snapshot[] {
  return snapshots.slice();
}

export function listJournal(snapshotId?: string): JournalEntry[] {
  if (!snapshotId) return journal.slice();
  return journal.filter((e) => e.snapshotId === snapshotId);
}

export function createSnapshot(name: string): Snapshot {
  const id = `snap_${Date.now().toString(36)}_${snapshots.length}`;
  const snap: Snapshot = { id, name, createdAt: Date.now() };
  snapshots.push(snap);
  persistLine({ type: 'snapshot', id, name, createdAt: snap.createdAt });
  return snap;
}

/**
 * Journaled write. Reads the previous content (if any) before overwriting, so
 * rollback can restore it. Caller is responsible for capability checks.
 */
export async function shadowWrite(
  path: string,
  content: string | Buffer,
  meta: { bySlot?: number; label?: string } = {},
): Promise<JournalEntry> {
  const abs = resolvePath(path);
  let previous: Buffer | null = null;
  try {
    previous = await fs.readFile(abs);
  } catch {
    /* file didn't exist */
  }
  const dir = dirname(abs);
  if (dir) await fs.mkdir(dir, { recursive: true });
  const nextBytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  await fs.writeFile(abs, nextBytes);
  const entry: JournalEntry = {
    id: `wj_${Date.now().toString(36)}_${++entryCounter}`,
    at: Date.now(),
    path: abs,
    previous,
    next: nextBytes,
    bySlot: meta.bySlot,
    label: meta.label,
    snapshotId: currentSnapshotId(),
  };
  journal.push(entry);
  persistLine({
    type: 'entry',
    entry: {
      ...entry,
      previous: entry.previous ? entry.previous.toString('base64') : null,
      next: entry.next.toString('base64'),
    },
  });
  return entry;
}

/**
 * Roll back every journaled write performed AFTER the given snapshot (so the
 * filesystem is restored to the state at the snapshot). Walks the journal in
 * reverse, restoring `previous` for each entry, and deletes files that didn't
 * exist before.
 */
export async function rollbackTo(
  snapshotId: string,
): Promise<{ restored: number; deleted: number; errors: string[] }> {
  const idx = snapshots.findIndex((s) => s.id === snapshotId);
  if (idx < 0) throw new Error(`unknown snapshot: ${snapshotId}`);
  const after = snapshots.slice(idx + 1).map((s) => s.id);
  const toUndo = journal
    .filter((e) => e.snapshotId === snapshotId || after.includes(e.snapshotId))
    .slice()
    .reverse();

  let restored = 0;
  let deleted = 0;
  const errors: string[] = [];

  for (const entry of toUndo) {
    try {
      if (entry.previous === null) {
        await fs.unlink(entry.path);
        deleted++;
      } else {
        await fs.writeFile(entry.path, entry.previous);
        restored++;
      }
    } catch (e) {
      errors.push(`${entry.path}: ${(e as Error).message}`);
    }
  }

  // Trim journal + snapshots past the rollback point
  journal = journal.filter((e) => e.snapshotId !== snapshotId && !after.includes(e.snapshotId));
  snapshots = snapshots.slice(0, idx + 1);

  return { restored, deleted, errors };
}

/** For tests: reset module state. */
export function _resetShadowState(): void {
  snapshots = [{ id: 'root', name: 'root', createdAt: Date.now() }];
  journal = [];
  entryCounter = 0;
}
