export interface LangSmithRun {
  id: string;
  name?: string;
  status?: string;
  run_type?: string;
  start_time?: string;
  end_time?: string;
  error?: string | null;
  total_tokens?: number;
}

export interface MonitorRow {
  id: string;
  name: string;
  status: string;
  duration: string;
  tokens: number;
  err: boolean;
  endedAt?: number;
}

export interface LangSmithSnapshot {
  rows: MonitorRow[];
  active: number;
  faults: number;
  fetchedAt: number;
  error?: string;
}

const BASE = process.env.LANGSMITH_ENDPOINT ?? 'https://api.smith.langchain.com';
const PROJECT = process.env.LANGSMITH_PROJECT_ID ?? process.env.LANGSMITH_PROJECT;

export function isConfigured(): boolean {
  return Boolean(process.env.LANGSMITH_API_KEY);
}

function fmtDuration(start?: string, end?: string): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = Math.max(0, e - s);
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m${secs % 60}s`;
}

function toRow(r: LangSmithRun): MonitorRow {
  return {
    id: r.id.slice(0, 8),
    name: (r.name ?? r.run_type ?? 'run').slice(0, 24),
    status: r.error ? 'ERR' : (r.status ?? 'unknown').slice(0, 10),
    duration: fmtDuration(r.start_time, r.end_time),
    tokens: r.total_tokens ?? 0,
    err: Boolean(r.error),
    endedAt: r.end_time ? new Date(r.end_time).getTime() : undefined,
  };
}

export async function fetchSnapshot(): Promise<LangSmithSnapshot> {
  const key = process.env.LANGSMITH_API_KEY;
  if (!key) {
    return { rows: [], active: 0, faults: 0, fetchedAt: Date.now(), error: 'LANGSMITH_API_KEY not set' };
  }
  try {
    const body: Record<string, unknown> = { limit: 20, order: 'desc' };
    if (PROJECT) body.session = [PROJECT];
    const res = await fetch(`${BASE}/runs/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        rows: [],
        active: 0,
        faults: 0,
        fetchedAt: Date.now(),
        error: `${res.status} ${res.statusText}`,
      };
    }
    const data: any = await res.json();
    const runs: LangSmithRun[] = Array.isArray(data?.runs)
      ? data.runs
      : Array.isArray(data)
        ? data
        : [];
    const rows = runs.map(toRow);
    const active = rows.filter((r) => !r.endedAt && !r.err).length;
    const faults = rows.filter((r) => r.err).length;
    return { rows, active, faults, fetchedAt: Date.now() };
  } catch (e) {
    return { rows: [], active: 0, faults: 0, fetchedAt: Date.now(), error: String(e) };
  }
}

export function renderTable(rows: MonitorRow[], note?: string): string {
  const header = `${'id'.padEnd(10)}${'name'.padEnd(26)}${'status'.padEnd(12)}${'dur'.padEnd(10)}tokens`;
  const sep = '─'.repeat(header.length);
  const body = rows.length
    ? rows
        .map((r) => `${r.id.padEnd(10)}${r.name.padEnd(26)}${r.status.padEnd(12)}${r.duration.padEnd(10)}${r.tokens}`)
        .join('\n')
    : '(no recent runs)';
  const hint = note ? `\n\n${note}` : '';
  const stamp = `── snapshot @ ${new Date().toISOString().slice(11, 19)} UTC ──`;
  return `${stamp}\n${header}\n${sep}\n${body}${hint}\n\n`;
}
