/**
 * Compact, human-legible formatters.
 */

/** $0.001 / $0.05 / $1.50 / $12.4 / $123 — never more than 5 visible chars after $. */
export function fmtCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0';
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(3)}`; // $0.001 — $0.009
  if (usd < 1) return `$${usd.toFixed(2)}`; // $0.05
  if (usd < 10) return `$${usd.toFixed(2)}`; // $1.50
  if (usd < 100) return `$${usd.toFixed(1)}`; // $12.4
  return `$${Math.round(usd)}`; // $123
}

/** 3s · 47s · 1m12s · 14m · 1h12m */
export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h${m % 60}m` : `${h}h`;
}

/** "3s ago" / "47s ago" / "—" if undefined. */
export function fmtAgo(at?: number): string {
  if (!at) return '—';
  return `${fmtDuration(Date.now() - at)} ago`;
}

/** 142 → "142", 1428 → "1.4k", 14280 → "14k", 142800 → "143k" */
export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}
