/**
 * Confidence prefix — first-line marker `CONFIDENCE: <0.0-1.0>` or
 * `CONFIDENCE: high|medium|low`. Extracted once per response stream and
 * surfaced as structured uncertainty for downstream consumers (quorum
 * weighting, artifact badges, auto-note promotion thresholds).
 */
const CONFIDENCE_RE = /^\s*CONFIDENCE\s*[:\-]\s*([^\n]+?)\s*$/im;

const SYMBOLIC: Record<string, number> = {
  high: 0.9,
  hi: 0.9,
  strong: 0.9,
  certain: 0.95,
  medium: 0.6,
  med: 0.6,
  moderate: 0.6,
  low: 0.3,
  lo: 0.3,
  weak: 0.3,
  unsure: 0.2,
};

/**
 * Returns the parsed confidence (0..1) and the start/end indices of the
 * matched line so the caller can strip it before displaying.
 */
export function extractConfidence(text: string): { value: number; matchedText: string } | null {
  const m = text.match(CONFIDENCE_RE);
  if (!m || m.index === undefined) return null;
  const raw = (m[1] ?? '').trim().toLowerCase();
  // numeric form
  const numeric = parseFloat(raw);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) {
    return { value: numeric, matchedText: m[0] };
  }
  // percentage form
  if (/%$/.test(raw)) {
    const pct = parseFloat(raw);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      return { value: pct / 100, matchedText: m[0] };
    }
  }
  // symbolic
  const key = raw.split(/\s|—|\-|,/)[0]!;
  if (key in SYMBOLIC) return { value: SYMBOLIC[key]!, matchedText: m[0] };
  return null;
}

export function stripConfidenceLine(text: string): string {
  return text.replace(CONFIDENCE_RE, '').replace(/^\n+/, '');
}

export const CONFIDENCE_HINT_FOR_MODEL =
  'Begin every response with `CONFIDENCE: <0.0-1.0>` (or high/medium/low) on its own line, then a blank line, then your answer. Reflect honest uncertainty — overconfidence is a fault.';

export function confidenceBadge(v: number | undefined): string {
  if (v === undefined) return '';
  if (v >= 0.85) return 'HI ';
  if (v >= 0.55) return 'MED';
  return 'LO ';
}

export function confidenceColor(
  v: number | undefined,
  palette: { accent: string; amber: string; primary: string; inactive: string },
): string {
  if (v === undefined) return palette.inactive;
  if (v >= 0.85) return palette.accent;
  if (v >= 0.55) return palette.amber;
  return palette.primary;
}
