# Launch blog post (template)

Publish to dev.to / Medium / your personal blog. The version below is calibrated for the *first* week. Replace bracketed personalization before publishing.

---

# I built a war-room TUI for AI coding agents because I kept opening three terminals

[Optional personalized hook: "After my 50th time pasting the same prompt into Claude Code, OpenCode, and Codex in three different windows, I gave up and built this."]

I open-sourced **Singularity CLI** today: a code-red terminal app where the first character of your prompt decides what *kind* of multi-agent interaction you want.

```
text       → dispatch to selected pane(s)
!text      → broadcast: race all panes in parallel
?text      → quorum vote: YES / NO / ABSTAIN
>N text    → relay last response into pane N
>>N text   → dispatch the selected code artifact as the prompt
@plan goal → planner pane drafts steps; workers auto-run them
/cmd       → slash command (no model call)
```

The first character is the whole UX innovation. One prompt bar, six topologies, all of them switchable per keystroke.

## What this is for

Three workflows I use it for daily:

**Comparing implementations.** `!implement a debounced rate limiter that handles clock skew` — three panes produce solutions in parallel; the artifact pane numbers them `#1`, `#2`, `#3`. Then `/diff #1 #2` is a real LCS unified diff.

**Multi-model decisions.** `?safe to ship this PR on Friday` — every pane votes on its first line. The confidence-weighted tally appears live in the race-bars overlay. Cheaper than human consensus.

**Hierarchical work.** `@plan migrate the user table to postgres 17` — a planner pane (defaults to Claude) drafts JSON steps; each step auto-dispatches to the right worker pane. The artifacts collect inline.

## What surprised me building it

The hardest design decision was that agents need to know about each other. We tell them.

Every dispatch is composed: `persona + operating-context + roster + shared_notes + git_context + your_prompt`. The roster is a 4-line preamble — "you are pane 2 of 4, others are: ..., here are recent shared notes." Agents themselves curate the shared notes by prefixing facts with `NOTE:`. There's no vector store, no embedding pipeline. A 200-line regex extractor is the entire shared-memory implementation.

The other surprise: governance is a first-class primitive, not an afterthought. The shell pane (slot 5) runs the OS as a peer agent — but it starts with zero capabilities. You grant what you want:

```
/grant 5 exec:^npm (test|run lint) 1800
/grant 5 exec:^git (status|log|diff) 900
```

Narrow regexes. Short expirations. The PC strip in the UI shows live capability chips counting down. Sentinel hard-blocks `rm -rf`, `git push --force`, writes to `.env` / `.ssh`. Dual-key handoff for the dangerous list — two distinct panes must independently propose the same action within 60s.

And then there's the shadow journal: every file write recorded as (path → previous bytes, next bytes). `/rollback root` reverts every write since session start. It survives crashes — journaled to `~/.singularity/journal.jsonl`.

If an agent does something stupid, one keystroke undoes everything.

## What it's not

Not a hosted service. No servers, no telemetry. Your API keys live in `~/.singularity/.env`. Your runs are local.

Not an IDE extension. The room is a terminal. If you want a sidebar, [OpenCode](https://opencode.ai) and [Continue](https://continue.dev) are great.

Not a replacement for your CLIs. Singularity's panes *are* the real `claude`, `opencode`, `codex` processes. We just route prompts and observe output. Or, optionally, talk to provider APIs directly (Anthropic / OpenAI / OpenRouter / Ollama).

Not opinionated about which model is best. Quorum exists *because* you want them disagreeing in front of you.

## How it compares

OpenCode is the breakout 2026 open-source coding agent. Singularity is adjacent, not competitive — Singularity wraps OpenCode (among others) as a pane. The dispatch grammar is the layer that doesn't exist anywhere else.

Full comparison table: https://github.com/singularity-cli/singularity-cli/blob/main/docs/comparison.md

## Try it in 60 seconds

```bash
npx singularity-cli@latest --demo
```

The demo profile uses a built-in adapter that streams a deterministic fake response, so the entire UI (boot, race bars, artifacts, `/help`, themes) works without any API keys or installed CLIs.

Then if you want the real thing:

```bash
singularity wizard       # walks you through claude / opencode / codex / ollama auth
singularity              # launch the room
```

## What I'd love feedback on

- The grammar itself. Is `!` / `?` / `>N` / `@plan` discoverable, or do you have to read docs every time?
- The governance pipeline. Is capability-then-sentinel-then-shadow-journal coherent, or overkill?
- The artifact pane. Useful, or busy?
- Anything missing that would make this a daily driver for you.

Repo: https://github.com/singularity-cli/singularity-cli
Manifesto: https://github.com/singularity-cli/singularity-cli/blob/main/docs/manifesto.md
80 tests, MIT, Node ≥ 20.

Open for issues, plugins, themes, and adversarial questions.
