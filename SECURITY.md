# Security Policy

## Scope

Singularity CLI orchestrates multiple AI coding agents and (optionally) drives the OS through a shell adapter. The trust surface is documented in [CONTROL.md](./CONTROL.md). Two categories of report we'd want:

1. **Sandbox escape** — any way to cause Singularity to write a file, run a command, or open a network connection **without** a matching user-granted capability and a sentinel pass. This includes:
   - bypassing `checkCapabilities` in any code path
   - bypassing `sentinelVerdict` for sensitive writes or dangerous execs
   - bypassing `submitDualKey` for actions tagged dual-key
   - bypassing `shadowWrite` (writes that aren't journaled and therefore not rollback-able)
2. **Cross-pane leakage** — any way one pane's responses are surfaced to another pane's system prompt or input *without* an explicit operator (relay `>N`, broadcast `!`, quorum `?`, `>>N` artifact dispatch). Especially watch the shared-notes auto-extractor and the artifact pane.

## Out of scope

- Adapter-side issues (a bug in `claude`, `opencode`, `codex`) — file those with the respective project.
- The user choosing to `/grant 5 exec:.*` (giving the shell pane unrestricted exec) is by design — Singularity is a substrate, the user defines the policy.
- The MCP server (when running `singularity serve --mcp`) trusts its stdin caller; that's the MCP protocol's trust model.

## Reporting

Open a GitHub Security Advisory (private) on the repository. Please include:

- The capability/sentinel gate you bypassed
- A minimal reproduction (a profile, a prompt, the resulting unauthorized side effect)
- Whether it requires user-installed adapters or works on a fresh install

We aim to acknowledge within 72 hours. Coordinated disclosure preferred for sandbox escapes.

## Hardening defaults

- Default profile grants **zero capabilities**. The user must explicitly `/grant` before any pane can write or exec.
- Sentinel hard-blocks writes to `.env`, `.ssh/`, `/etc/`, `/private/`.
- Sentinel requires dual-key for `rm -rf`, `git push --force`, `git reset --hard`, `npm publish`, `sudo`, `dd`, `mkfs`, classic fork bombs.
- The shadow-fs journals every Singularity-initiated write; `/rollback root` returns the filesystem to the session-start state (within the journaled set).
- MCP self-mod tools require an in-process `meta:configure` capability that can only be granted from the TUI by the human user, never from MCP itself.

## Known limits

- The shadow-fs journal lives in process memory; if Singularity crashes you can't roll back. (Persistent journal is on the roadmap.)
- The capability glob/regex engine is deliberately simple. Grant narrow patterns.
- Trust scores aren't persisted across sessions yet — every restart resets to 0.5.
