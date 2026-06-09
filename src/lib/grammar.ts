/**
 * Single source of truth for the dispatch grammar. Both the in-TUI /grammar
 * slash command and the `singularity grammar` shell subcommand render this.
 */

export interface GrammarEntry {
  op: string;
  name: string;
  description: string;
  example: string;
}

export const GRAMMAR: GrammarEntry[] = [
  {
    op: 'text',
    name: 'targeted',
    description: 'dispatch to the selected pane(s)',
    example: 'refactor the auth middleware',
  },
  {
    op: '!text',
    name: 'broadcast',
    description: 'race all eligible panes in parallel · live race bars overlay',
    example: '!fix the lint errors',
  },
  {
    op: '?text',
    name: 'quorum',
    description: 'broadcast + classify YES/NO/ABSTAIN · live vote tally',
    example: '?is it safe to deploy now',
  },
  {
    op: '>N text',
    name: 'relay',
    description: "pipe current target's last response as context into pane N",
    example: '>2 now write the tests for what you saw',
  },
  {
    op: '>>N text',
    name: 'artifact-callable',
    description: 'dispatch the currently-selected artifact (from slot 4) as the prompt to pane N',
    example: '>>3 review this code for thread-safety',
  },
  {
    op: '@plan goal',
    name: 'plan-execute',
    description: 'planner pane drafts JSON steps · auto-dispatches each to its slot',
    example: '@plan migrate the user table to postgres 17',
  },
  {
    op: '/cmd args',
    name: 'slash command',
    description: 'local command, no model call',
    example: '/note staging is postgres 17',
  },
];

const SLASH = [
  ['/help', 'open the keys & grammar overlay'],
  ['/commands', 'list all slash commands (text)'],
  ['/clear', 'clear target pane(s) (or `all`)'],
  ['/save', 'save target pane output to file'],
  ['/apply', 'write selected artifact to a file'],
  ['/diff', 'unified diff of two artifacts (#a #b) or panes'],
  ['/lock <N>', 'toggle dispatch lock on pane N'],
  ['/search', 'highlight regex matches across panes'],
  ['/profile', 'queue a profile switch for next restart'],
  ['/snippet', 'expand · save · list saved prompt snippets'],
  ['/cost', 'show running session cost'],
  ['/budget', 'set or clear session $ budget'],
  ['/note', 'manage shared scratchpad (add · list · clear · rm · auto)'],
  ['/awareness', 'toggle roster awareness (roster | none)'],
  ['/focus', 'targeted row expands; other shrinks'],
  ['/compact', 'hide ECG + footer to reclaim rows'],
];

const KEYS = [
  ['1-4', 'toggle target inclusion'],
  ['Tab', 'cycle single target'],
  ['↑ / ↓', 'walk prompt history (or artifact list if slot 4 selected)'],
  ['j / k', 'navigate artifacts (when slot 4 is the target)'],
  ['s / c', 'save / copy current artifact'],
  ['Esc', 'clear target + draft'],
  ['Ctrl+C', 'quit (closes child processes cleanly)'],
];

export interface AnsiPalette {
  red: (s: string) => string;
  green: (s: string) => string;
  amber: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
  plain: (s: string) => string;
}

export const ANSI: AnsiPalette = {
  red: (s) => `\x1b[91m${s}\x1b[0m`,
  green: (s) => `\x1b[92m${s}\x1b[0m`,
  amber: (s) => `\x1b[93m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  plain: (s) => s,
};

export const NO_COLOR: AnsiPalette = {
  red: (s) => s,
  green: (s) => s,
  amber: (s) => s,
  dim: (s) => s,
  bold: (s) => s,
  plain: (s) => s,
};

export function renderGrammar(c: AnsiPalette = ANSI): string {
  const lines: string[] = [];
  lines.push(c.red('  ╔═══════════════════════════════════════════════════════════════╗'));
  lines.push(c.red('  ║   S I N G U L A R I T Y   //   DISPATCH GRAMMAR               ║'));
  lines.push(c.red('  ╚═══════════════════════════════════════════════════════════════╝'));
  lines.push('');
  lines.push(
    c.bold('  Operators') + c.dim('   (first character determines multi-agent semantics)'),
  );
  lines.push(c.dim('  ─────────────────────────────────────────────────────────────'));
  for (const g of GRAMMAR) {
    lines.push(
      `  ${c.green(g.op.padEnd(11))} ${c.bold(g.name.padEnd(14))} ${c.dim(g.description)}`,
    );
    lines.push(`              ${c.dim('e.g.')}  ${c.amber(g.example)}`);
  }
  lines.push('');
  lines.push(c.bold('  Slash commands') + c.dim('   (local, no model call)'));
  lines.push(c.dim('  ─────────────────────────────────────────────────────────────'));
  for (const [k, v] of SLASH) {
    lines.push(`  ${c.green(k!.padEnd(11))}  ${c.dim(v!)}`);
  }
  lines.push('');
  lines.push(c.bold('  Keys'));
  lines.push(c.dim('  ─────────────────────────────────────────────────────────────'));
  for (const [k, v] of KEYS) {
    lines.push(`  ${c.green(k!.padEnd(11))}  ${c.dim(v!)}`);
  }
  lines.push('');
  lines.push(c.dim('  see also: PATTERNS.md for the design rationale behind each operator'));
  lines.push('');
  return lines.join('\n');
}
