export type Vote = 'YES' | 'NO' | 'ABSTAIN';

const YES_RE = /\b(yes|ship\s*it|approve|safe|lgtm|go|proceed|✓)\b/i;
const NO_RE = /\b(no|not|never|reject|unsafe|block|halt|don['']?t|do\s+not|stop|unless|✗)\b/i;

export function classifyVote(text: string): Vote {
  const head = text.slice(0, 400);
  const yes = YES_RE.test(head);
  const no = NO_RE.test(head);
  if (yes && !no) return 'YES';
  if (no && !yes) return 'NO';
  return 'ABSTAIN';
}

export interface Tally {
  yes: number;
  no: number;
  abstain: number;
  yesWeighted: number;
  noWeighted: number;
  verdict: 'YES' | 'NO' | 'TIE' | 'PENDING';
}

export interface WeightedVote {
  vote: Vote;
  confidence?: number; // 0..1, default 1
}

export function tally(votes: Vote[] | WeightedVote[]): Tally {
  const normalized: WeightedVote[] = votes.map((v) =>
    typeof v === 'string' ? { vote: v, confidence: 1 } : v,
  );
  const yes = normalized.filter((v) => v.vote === 'YES').length;
  const no = normalized.filter((v) => v.vote === 'NO').length;
  const abstain = normalized.filter((v) => v.vote === 'ABSTAIN').length;
  const yesWeighted = normalized
    .filter((v) => v.vote === 'YES')
    .reduce((s, v) => s + (v.confidence ?? 1), 0);
  const noWeighted = normalized
    .filter((v) => v.vote === 'NO')
    .reduce((s, v) => s + (v.confidence ?? 1), 0);
  if (yesWeighted + noWeighted === 0) {
    return { yes, no, abstain, yesWeighted, noWeighted, verdict: 'PENDING' };
  }
  if (yesWeighted > noWeighted) return { yes, no, abstain, yesWeighted, noWeighted, verdict: 'YES' };
  if (noWeighted > yesWeighted) return { yes, no, abstain, yesWeighted, noWeighted, verdict: 'NO' };
  return { yes, no, abstain, yesWeighted, noWeighted, verdict: 'TIE' };
}
