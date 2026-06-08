# Singularity Design Patterns

Ten named patterns that emerged building Singularity CLI. Each has a one-line definition, the rationale, and a code citation. If you're building a multi-agent tool, any of these is extractable.

---

## 1. Dispatch Grammar

A tiny set of single-character operators that select **what the multi-agent semantics of this prompt are**, not what the prompt says.

| Operator | Meaning |
|---|---|
| `text` | dispatch to selected target(s) |
| `!text` | broadcast — race all eligible panes in parallel |
| `?text` | quorum vote — broadcast + classify YES/NO |
| `>N text` | relay — pipe current target's last response into pane N |
| `@plan goal` | hierarchical fanout — planner produces steps, workers execute |
| `/cmd args` | local slash command (no model call) |

**Why:** each operator carries different assumptions about agent independence, output structure, and follow-up. Most multi-agent systems pick one (chat, pipeline, swarm) and bake it in. Surfacing them as a typed grammar lets the human choose per-prompt.

**Code:** `src/App.tsx` — Enter-key handler dispatches by prefix; `src/lib/relay.ts`, `src/lib/planExec.ts`.

---

## 2. Stateless Tactical Role (DispatchKind)

The same agent receives a **different system prompt every time you press Enter**, composed from `persona + OP_<kind>`. The agent doesn't have a fixed role; it's recast per dispatch.

```
basePersona (from profile)  +  opContext (from DispatchKind)  =  finalPersona
```

For a single Claude pane: PERSONA_ARCHITECT + OP_QUORUM for a `?` vote, PERSONA_ARCHITECT + OP_PLAN_WORKER for a plan step, PERSONA_ARCHITECT + OP_BROADCAST for a race.

**Why:** treats "agent" as substrate, "role" as fluid framing. Cheaper than maintaining N parallel agent personas; sharper than a single generic prompt.

**Code:** `src/lib/promptEng.ts` (the OP_* constants), `src/App.tsx::dispatchOne` (composition).

---

## 3. NOTE: — Agent-Curated Shared Memory

Agents emit lines prefixed with `NOTE:` (or `IMPORTANT:` / `FACT:` / `CONTEXT:` / `REMEMBER:`). A deterministic extractor scans every response and promotes those lines to a shared scratchpad that prepends to all future dispatches.

```
Agent output:
  ...
  NOTE: staging uses postgres 17, prod is 15.
  ...

→ added to ~/.singularity/notes.json
→ next dispatch to ANY pane includes:
    [shared notes]
    - staging uses postgres 17, prod is 15
    [/shared notes]
```

**Why:** the model is the best curator of facts it just learned. Replace vector stores, embeddings, and structured-memory graphs with one regex and a convention announced in the system prompt. Transparent, debuggable, zero infra.

**Code:** `src/lib/autoNotes.ts`, `src/lib/notes.ts`, `src/lib/roster.ts::MARKER_HINT_FOR_MODEL`.

---

## 4. Symmetric Note Extraction

Auto-notes are extracted **from both user prompts and agent responses with the same code path**. A `context: react is 19` in your prompt and a `NOTE: react is 19` in an agent response land in the same scratchpad.

**Why:** human and AI are peers in shared-context curation. The human doesn't need to "promote" facts manually; the AI doesn't have privileged write access.

**Code:** `src/App.tsx::dispatchOne` (pre-dispatch extraction) and `src/App.tsx::runStream` (post-stream extraction). Both call `extractNotes()`.

---

## 5. Roster Awareness

Each pane's system prompt is prefixed with a 4-line block introducing the room: "you are pane N of 4; the others are [...]; you run independently unless I relay or share." Cheap (~80 tokens), enough for agents to coordinate without context union.

**Why:** awareness without information leakage. The roster tells the model the *shape* of the room without exposing siblings' actual work. Quorum votes get more honest ("the reviewer may catch X"), plan workers know they're parallel.

**Code:** `src/lib/roster.ts::rosterPreamble`.

---

## 6. Deterministic Classification via First-Line Contract

For quorum voting: instead of an LLM judge or embedding similarity, tell the model the *format* of the first line (`YES` / `NO` / `ABSTAIN`) and verify with regex. The classifier is free and instant.

**Why:** when you need structured output, collaborate with the model to make its output structurally classifiable, then classify mechanically.

**Code:** `src/lib/promptEng.ts::OP_QUORUM` (the contract), `src/lib/quorum.ts::classifyVote` (the classifier).

---

## 7. Race UX as Behavioral Nudge

Broadcasts trigger live race bars: each pane's token throughput animates a horizontal bar; a green ✓ caps the winner. The visceral feedback loop makes parallel dispatch *fun*, which is the surest way to make users do it.

**Why:** most agent dashboards make parallel work feel administrative. Making it spectator-sport adjacent encourages the use case the system is designed for.

**Code:** `src/components/RaceBars.tsx`.

---

## 8. Artifact Pane — Memory of Work Product, Decoupled from Conversation

Per-pane conversation is private. Code blocks extracted from any pane go to a shared **artifact pane** (slot 4) that lists, displays, saves, and copies them. Closer to how teams actually work (DMs private; wiki shared) than the typical "one big shared context" multi-agent setup.

**Why:** separating "what we discussed" from "what we produced" lets each one have the right durability and access pattern. Conversation decays; artifacts persist.

**Code:** `src/lib/artifacts.ts`, `src/components/ArtifactPane.tsx`.

---

## 9. iTerm2 Punt for TUI-in-TUI

Running another tool's interactive TUI inside ours would require PTY emulation + ANSI parsing. Instead: spawn four native iTerm2 splits via AppleScript, let iTerm2 handle rendering, dispatch by writing text into the session ids. Singularity orchestrates; iTerm2 displays.

**Why:** collaborate with the environment instead of subsuming it. The hard problem ("render a TUI inside a TUI") disappears when you recognize iTerm2 already does it perfectly.

**Code:** `src/iterm/launch.ts`, `src/iterm/applescript.ts`, `src/adapters/iterm.ts`.

---

## 10. MCP Inversion — Be A Tool, Not Consume Tools

`singularity serve --mcp` exposes Singularity's panes as MCP tools (`dispatch_claude`, `dispatch_opencode`, etc.) over stdio. An outer Claude session can call into Singularity and get the parallel-agent benefit transparently — without knowing that "the tool it called" is actually four agents racing.

**Why:** the same `Adapter` interface that dispatches to CLIs also exposes them. The aggregator becomes a substrate other agents can call. Inverted control flow with zero new abstractions.

**Code:** `src/mcp.ts` (JSON-RPC over stdio), `src/adapters/types.ts::Adapter` (the unifying interface).

---

## The combination

The patterns aren't separately interesting — they reinforce each other.

- **Grammar (1) + DispatchKind (2)** = the same input bar produces six different multi-agent topologies.
- **NOTE (3) + Symmetric Extraction (4) + Roster (5)** = shared context emerges from conversation, not from infrastructure.
- **Quorum (6) + Race UX (7)** = parallel agents are fun *and* mechanically verifiable.
- **Artifact (8) + MCP (10)** = work product becomes a first-class output of the system, callable from elsewhere.
- **iTerm2 punt (9)** keeps the controller small so all of the above stays approachable.

If you're building a multi-agent tool, the cheapest one to lift is **#3 + #4** (NOTE convention + symmetric extraction). It's 200 lines of code and adds shared memory to any agent stack you already have.
