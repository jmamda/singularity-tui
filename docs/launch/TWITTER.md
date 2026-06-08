# Twitter / X launch thread

## Thread (10 tweets)

**1/**
Shipping Singularity CLI today.

It's a code-red TUI where the first character of your prompt picks the multi-agent topology across multiple AI coding CLIs.

A war-room, not a chat.

🔗 https://github.com/singularity-cli/singularity-cli

[GIF: race bars across 3 panes]

**2/**
The grammar:

`text`     → dispatch to selected pane(s)
`!text`    → broadcast — race all panes in parallel
`?text`    → quorum vote (YES / NO / ABSTAIN)
`>N text`  → relay last response into pane N
`>>N text` → dispatch the selected code artifact as the prompt
`@plan`    → planner pane drafts steps; workers execute

[Screenshot of grammar]

**3/**
Daily use:

`!implement X` → compare 3 implementations side by side
`?is this safe to deploy?` → multi-model vote, confidence-weighted
`@plan refactor auth` → one agent designs, others execute

[Screenshot of quorum tally]

**4/**
The safety substrate. Capability tokens are typed, scoped, expiring:

`/grant 5 exec:^npm test 600` → pane 5 can run `npm test` for 10 min

The shell pane (slot 5) starts with ZERO capabilities. You grant what you want, watch the chips count down in real time, revoke instantly.

**5/**
Sentinel pane is a deterministic vetoer. Hard-blocks writes to `.env`, `.ssh/`, `/etc/`. Demands a dual-key handoff for `rm -rf`, `git push --force`, `sudo`.

Two distinct panes must propose the same dangerous action within 60s before it fires.

**6/**
Shadow journal: every file write is recorded with previous + next bytes. `/rollback` reverts the whole session. Survives crashes (journaled to `~/.singularity/journal.jsonl`).

If an agent does something stupid, one keystroke undoes everything.

**7/**
Models, native (no CLI binary required):

provider:anthropic://claude-sonnet-4-6
provider:openai://gpt-5.1
provider:openrouter://anthropic/claude-3.5-sonnet
provider:ollama://llama3:8b

Cost meter is real (tokens captured from `message_start` + `message_delta`).

**8/**
Other bits:
🎨 8 themes (code-red, tokyonight, catppuccin, gruvbox, nord, matrix, ayu, mono)
🌐 HTTP server with OpenAPI + embedded web UI (`singularity web`)
🔌 MCP server *and* client
🛰  OS event triggers (daemon)
🧩 Plugin loader (`~/.singularity/plugins/`)
⚡ 80 tests, MIT

**9/**
What it's NOT:
- not a hosted service (no server, no telemetry)
- not an IDE extension (the room is a terminal)
- not a replacement for your CLIs (it dispatches to the real `claude`, `opencode`, `codex`)
- not opinionated about which model is best (quorum is for disagreement)

**10/**
Try it in 60 seconds:

```bash
npx singularity-cli@latest --demo
```

Repo: https://github.com/singularity-cli/singularity-cli
Manifesto: docs/manifesto.md
Comparison vs the field: docs/comparison.md

Open for issues, plugins, themes. MIT.

## Single tweet (shorter version)

> Shipping Singularity CLI: a code-red TUI dispatcher for multiple AI coding CLIs. First char of your prompt picks the topology: `!` broadcasts, `?` quorum-votes, `>N` relays, `@plan` plan-executes. Capability tokens + shadow journal so /rollback reverts everything. MIT.
>
> [link]
