# How Singularity compares

| | Singularity | Claude Code | Aider | Crush | Codex CLI | Continue |
|---|---|---|---|---|---|---|
| **Mental model** | dispatcher of N CLIs | single Claude agent | single chat→edit loop | single agent, MCP heavy | single OpenAI agent | IDE sidebar |
| **Multi-CLI orchestration** | ✅ heterogeneous, in parallel | ❌ | ❌ | partial (sub-agents inside Crush) | ❌ | ❌ |
| **Dispatch grammar** (`!` `?` `>N` `@plan`) | ✅ unique | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Quorum voting across models** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Agent-curated shared memory** (`NOTE:`) | ✅ | partial (Claude memory) | ❌ | ❌ | ❌ | ❌ |
| **Auto-extracted code artifacts** | ✅ versioned + commented | ❌ | partial | ❌ | ❌ | ❌ |
| **`/apply` to write files** | ✅ journaled + reversible | ✅ | ✅ auto-commits | ✅ | ✅ | ✅ |
| **Capability tokens** (typed/scoped/expiring) | ✅ | ❌ (allow-list) | ❌ | ❌ | ✅ (sandbox modes) | ❌ |
| **Shadow journal + `/rollback`** | ✅ | partial (rewind) | ✅ via git | ❌ | ❌ | ❌ |
| **Sentinel veto + dual-key** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **MCP server** (be a tool) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **MCP client** (consume tools) | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **iTerm2 native splits** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **OS event triggers / daemon** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Open source** | ✅ MIT | ❌ proprietary | ✅ Apache | ✅ MIT | ✅ Apache | ✅ Apache |
| **Distribution** | npm + brew + Docker | binary | pip | brew + Go | npm | VS Code |

## When to pick what

**Pick Singularity if** you want to compare or combine multiple AI CLIs (race three implementations, quorum-vote a deploy decision, have one plan and another implement), or you want a typed/scoped trust substrate for delegating real work.

**Pick Claude Code if** you only ever use Claude and want the deepest single-agent integration, with Anthropic's first-party sandbox + checkpoints.

**Pick Aider if** you want a clean chat→git-commit loop and don't need multiple agents.

**Pick Crush if** you want a single-CLI MCP-first agent with rich tool use, on Go's distribution story.

**Pick Codex CLI if** you're an OpenAI shop and want the closest thing to Aider with sandbox modes.

**Pick Continue if** you live in VS Code and want a sidebar rather than a terminal.

## What we don't do (and don't plan to)

- We are not a hosted product. No servers. No telemetry. Your runs are local.
- We do not embed in your IDE. The room is a terminal.
- We do not replace the underlying CLIs. Singularity's panes *are* the real `claude`, `opencode`, `codex` processes — we just route prompts and observe output.
- We do not pick a winning model for you. Quorum exists *because* you want them disagreeing in front of you.

If you need any of those, the projects above are excellent at them.
