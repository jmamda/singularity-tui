# Hacker News submission

**Title (≤ 80 chars):**
> Show HN: Singularity – race, vote, relay across AI coding CLIs from one prompt

**URL:** https://github.com/singularity-cli/singularity-cli

**First-comment template** (post within 60 seconds of submission):

---

Hi HN — I built Singularity because I kept opening three terminals (Claude Code, OpenCode, Codex) and dispatching the same prompt to all of them by hand, then comparing.

It's a code-red TUI where the first character of your prompt picks the multi-agent topology:

```
text       dispatch to selected pane(s)
!text      broadcast — race every agent in parallel
?text      quorum — YES / NO / ABSTAIN vote across panes
>N text    relay — pipe pane A's last response into pane N
>>N text   dispatch the selected code artifact as the prompt
@plan goal planner pane drafts steps; workers auto-run them
/cmd       slash command (no model call)
```

What I actually use it for, daily:
- `!implement X` to compare 3 implementations
- `?safe to deploy on Friday` to get a multi-model vote
- `@plan migrate the user table` so one agent designs, others execute

There's a real governance layer: capability tokens (typed/scoped/expiring), a deterministic sentinel that blocks `rm -rf` and writes to `.env` / `.ssh`, dual-key handoff for destructive commands, and a shadow journal so `/rollback` reverts every write since session start. The PC itself is slot 5 with capability-gated exec.

Direct support for Anthropic / OpenAI / OpenRouter / Ollama (no CLI binary required). 8 themes. MCP server *and* client. HTTP server with an embedded web UI. Daemon mode for file-watch / git-commit triggers. 80 tests. MIT.

Not affiliated with the HPC container Singularity, which I learned about after naming this.

Happy to answer architecture questions. The 10 design patterns are documented in PATTERNS.md.
