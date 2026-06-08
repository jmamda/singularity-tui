/**
 * Minimal unified-diff between two texts. LCS-based line diff, no dependencies.
 * Good enough for reviewing two AI outputs side-by-side; not a full Myers diff.
 */

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  return dp;
}

export interface DiffLine {
  kind: ' ' | '-' | '+';
  text: string;
}

export function diffLines(aText: string, bText: string): DiffLine[] {
  const a = aText.split('\n');
  const b = bText.split('\n');
  const dp = lcsTable(a, b);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: ' ', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: '-', text: a[i]! });
      i++;
    } else {
      out.push({ kind: '+', text: b[j]! });
      j++;
    }
  }
  while (i < a.length) out.push({ kind: '-', text: a[i++]! });
  while (j < b.length) out.push({ kind: '+', text: b[j++]! });
  return out;
}

export interface DiffStat {
  added: number;
  removed: number;
}

export function diffStat(lines: DiffLine[]): DiffStat {
  return {
    added: lines.filter((l) => l.kind === '+').length,
    removed: lines.filter((l) => l.kind === '-').length,
  };
}

/** Render a compact unified diff string (caps total lines for notification display). */
export function renderUnifiedDiff(aText: string, bText: string, maxLines = 40): string {
  const lines = diffLines(aText, bText);
  const stat = diffStat(lines);
  const head = `diff · +${stat.added} -${stat.removed}`;
  if (stat.added === 0 && stat.removed === 0) return `${head} (identical)`;
  const body = lines
    .slice(0, maxLines)
    .map((l) => `${l.kind} ${l.text}`)
    .join('\n');
  const more = lines.length > maxLines ? `\n… +${lines.length - maxLines} more lines` : '';
  return `${head}\n${body}${more}`;
}
