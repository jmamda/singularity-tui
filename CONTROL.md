# Master Control — Architecture

This document is the contract for handing the PC over to Singularity's agents in a way that's safe to use. Every module under `src/control/` and the new adapters honor it.

## Frame

Singularity stops being only a *dispatcher of conversations* and becomes the **governance layer between AI and OS**. The user delegates power to agents through a typed, revocable, observable trust surface — not by giving everything to everyone.

## Layers (in dependency order)

```
┌─ #10 Self-mod MCP ─┐
│                    │
├─ #8 Replay  #9 Triggers ──┐
│                            │
├─ #2 Sentinel  #5 Dual-key  #4 Marketplace  #6 Trust decay ─┐
│                                                             │
├─ #1 PC-as-pane (shell adapter, slot 5) ─────────────────────┤
│                                                             │
└─ #3 Capability tokens   #7 Shadow execution ────────────────┘
                  (FOUNDATION — nothing else is safe without these)
```

## #3 Capability tokens (foundation)

Typed, scoped, expiring, revocable grants. Every action that touches the OS or filesystem **must** check a capability before executing.

```ts
type Capability =
  | { kind: 'read';  glob: string;  expiresAt: number }
  | { kind: 'write'; glob: string;  expiresAt: number }
  | { kind: 'exec';  pattern: string; expiresAt: number }
  | { kind: 'net';   host: string;  expiresAt: number };
```

Per-pane registry in the store. UI: chips in the pane header (`R:src/**` `W:dist/**` `X:npm test`). Slash commands: `/grant <slot> <cap>`, `/revoke <slot> <cap>`, `/caps [slot]`.

## #7 Shadow execution (foundation)

Every filesystem write goes through `lib/shadowfs.ts`. A **journal** records each write (path → previous bytes, new bytes). The real disk is touched immediately (we don't reimplement APFS), but the journal lets you `/rollback` to any prior snapshot.

UI: `/snapshot <name>` creates a save point. `/rollback <name>` reverts every journaled write since that point. `/diffshadow` shows what's changed since the latest snapshot. `/apply` automatically journals.

## #1 PC-as-pane (slot 5)

A new pane configured with `kind: 'shell'` runs `src/adapters/shell.ts`. Dispatching to it (`>>5 npm test` or via slot 5 selection) runs a command **only if** an `exec` capability matches. Output streams as adapter tokens. The shell is a peer in the war-room: ECG, confidence, NOTE: scrape, the works.

Default config: slot 5 starts with no capabilities. The user grants what they want.

## #2 Sentinel pane

A pane with a built-in "watchdog" persona. Every time an *action* (file write, command exec, dispatch) is *proposed* (not yet executed), the sentinel is dispatched the proposal and emits `VETO: <reason>` or `OK` on its first line. If `VETO`, the action is blocked. Sentinel uses the same adapter machinery — it's just an LLM agent with a different OP context.

## #5 Dual-key handoff

For actions tagged `requiresDualKey` (configurable; defaults: `rm`, `git push --force`, `npm publish`, writes to `~/`), execution requires that **two distinct panes** independently propose the same action within a 60s window. Reuses the broadcast/quorum machinery — same race tracking, different semantics.

## #4 Capability marketplace

Capabilities are first-class objects that can be **lent** between panes:

- `/lend <from-slot> <to-slot> <cap> [duration]` — temporarily transfer a token, scoped narrower than the original.
- Auto-return on duration expiry OR on receiver's next FAULT.
- Lent caps are visible in both panes' chip rows.

Plan-execute uses this: planner pane lends each worker a scoped capability for its step.

## #6 Trust-decayed autonomy

Each pane has `trust: number` (0–1, default 0.5). Affects required-approval threshold:

- Action with predicted blast radius `b` requires `trust >= 1 - b / 10`.
- Trust **rises** when an action lands without rollback or veto for 60s (+0.05).
- Trust **falls** on rollback (−0.15), on veto (−0.10), on FAULT (−0.05).

UI: trust shown as a small green/amber/red percentage next to confidence in the pane header.

## #8 Replay-driven dispatch

A *plan trace* is a structured list of proposed actions with predicted effects. Agents producing actions can opt into "compose only" mode (emit `ACTION:` markers parsed into a trace). The user then `/replay` — step through with `[n]ext / [a]ll / [s]kip / [c]ancel`. The trace is the unit of trust.

## #9 OS event triggers

`~/.singularity/triggers.json` defines `{ event, match, dispatch }` rules. Event sources:

- `fs:change` — file modified (chokidar/fs.watch)
- `git:commit` — new commit (poll `git log -1 --format=%H`)
- `time:interval` — every N seconds

On match, the configured prompt is auto-dispatched. Singularity gains a daemon mode (`singularity daemon`) that runs only triggers, no TUI.

## #10 Self-modifying MCP-of-self

`src/mcp.ts` already exposes pane dispatch tools. Add a `singularity_config` namespace exposing **safe** configuration tools:

- `add_pane(slot, adapter, persona)`
- `set_persona(slot, persona)`
- `grant_capability(slot, cap)` (only callable if the *requesting* agent holds a grantable form)
- `set_trust(slot, value)` (gated)

All gated by capability tokens. An agent that wants to mutate Singularity must hold a `meta:configure` capability — which is granted exclusively by the human user.

## Wiring

```
            ┌───────────────────────┐
            │   capability check    │
   action → │       (every          │ → veto?    → sentinel(?) → DUAL-KEY?(?) → execute
            │   action regardless)  │   shadow journal entry → trust adjust
            └───────────────────────┘
```

Every action goes through the same pipeline. Modules implement *checks* at specific gates; the dispatch pipeline composes them.

## OSS readiness

Final pass: LICENSE (MIT, already declared), CONTRIBUTING.md, SECURITY.md, refreshed README, ARCHITECTURE.md (this doc as a starting point), CHANGELOG, version bump to 0.2.0.
