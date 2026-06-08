# Reddit launch templates

## /r/programming + /r/commandline + /r/opensource

**Title:**
> Singularity CLI: dispatch one prompt across multiple AI coding CLIs (Claude, OpenCode, Codex) with a tiny grammar (`!` broadcast, `?` quorum vote, `>N` relay, `@plan`)

**Body:**

```
I open-sourced Singularity CLI — a code-red TUI dispatcher for AI coding CLIs.

The core bet: every existing tool ships ONE mental model (chat, pipeline, sidebar). You actually want all of them, switchable per keystroke. So the first character of your prompt picks the topology:

  text       → one pane
  !text      → race ALL panes in parallel (race bars overlay)
  ?text      → quorum vote (YES/NO/ABSTAIN) with confidence-weighted tally
  >N text    → relay last response into pane N
  >>N text   → dispatch the selected code artifact as the prompt
  @plan goal → planner pane drafts JSON steps; workers auto-run them

There's a real safety substrate: capability tokens (typed/scoped/expiring),
a deterministic sentinel that blocks `rm -rf`/`.env`/`.ssh`, dual-key handoff
for destructive commands, and a shadow journal so `/rollback` reverts every
write since session start.

Also: direct provider APIs (Anthropic/OpenAI/OpenRouter/Ollama, no CLI
required), 8 themes, MCP server + client, OS event triggers, HTTP server
with embedded web UI, 80 tests, MIT.

Repo: https://github.com/singularity-cli/singularity-cli
Try: `npx singularity-cli@latest --demo` (no API keys needed)
Manifesto: https://github.com/singularity-cli/singularity-cli/blob/main/docs/manifesto.md
Comparison vs Claude Code / Aider / OpenCode: in repo as docs/comparison.md

Not affiliated with the HPC container Singularity. Different domain.
```

## /r/LocalLLaMA (different angle — leads on Ollama)

**Title:**
> Singularity CLI: race local Ollama models against each other (and against Anthropic/OpenAI) with one prompt

**Body:**

```
Built a TUI where you can wire up to 4 model panes (any mix of Anthropic API,
OpenAI API, OpenRouter, or local Ollama) and dispatch one prompt across them
in parallel — with race bars and confidence-weighted quorum voting.

Local-model-friendly:
  - Ollama is a first-class provider, not an afterthought
  - All API keys / model URLs live in YOUR ~/.singularity/.env
  - No telemetry, no hosted service, no auth servers
  - The Ollama adapter speaks /api/chat directly, JSONL streaming

Plus: capability tokens to scope what each pane can do (read/write/exec/net),
a shadow journal for /rollback, and a sentinel that blocks destructive
patterns even from agents you trust.

Repo: https://github.com/singularity-cli/singularity-cli
```

## /r/sideproject

**Title:**
> I built a TUI war-room for AI coding CLIs — race, vote, relay across them with one prompt

(use the same body as /r/programming above, but lead with motivation: "I was opening 3 terminals every time I wanted to compare AI outputs...")
