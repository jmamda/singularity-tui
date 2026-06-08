# Why Singularity exists

Every AI coding tool today picks one mental model and ships it. **Chat.** Or **pipeline.** Or **swarm.** Or **embedded sidebar.** The mental model is the product.

Singularity is the bet that you actually want *all of them*, switchable per keystroke, in the same room, with rails that keep things safe enough to leave running.

## The three convictions

### 1. The first character is enough

Most multi-agent systems hide topology behind config. Whether your agents broadcast or vote or hand work to each other is a setup decision, not a moment-by-moment one.

Singularity treats topology as a typed verb on the prompt bar:

| Type | Meaning |
|---|---|
| `text` | dispatch to selected pane(s) |
| `!text` | broadcast — race everyone |
| `?text` | quorum — vote YES / NO / ABSTAIN |
| `>N text` | relay — pipe last response into pane N |
| `>>N text` | dispatch the artifact in slot 4 as the prompt |
| `@plan goal` | one pane plans; others execute the steps |
| `/cmd` | local command |

One keystroke selects the multi-agent semantics. Same models. Same panes. Different *shapes of cooperation*.

### 2. Agents should be peers in a room, not endpoints in a config file

Adjacent to chatbot UX, every agent thinks it's alone. Singularity introduces them to each other through a tiny set of conventions the model itself uses:

- `CONFIDENCE: 0.x` opens every response. Quorum weights by it. Auto-notes promote above 0.8.
- `NOTE: <fact>` lifts a fact to a shared scratchpad that prepends to every future dispatch.
- `CLARIFY: <question>` makes the agent ask the human instead of guessing.
- `COMMENT-ON: #N :: <text>` lets agents critique each other's artifacts inline.

These are not features. They are a four-bullet protocol agents converge on because we *tell them* it exists in the system prompt. No vector store, no embedding pipeline. A 200-line regex extractor is the entire shared-memory implementation.

### 3. Trust should be a substrate, not a switch

You don't want to confirm every action ("write this file? yes. now write this one? yes."), and you don't want to disable approval entirely ("everything auto-yes"). Both are bad UX.

Singularity makes trust a *graph*:

```
capability check → sentinel veto → dual-key check → shadow journal → trust adjust
```

- **Capabilities** are typed, scoped, expiring grants the user issues with `/grant`. The shell pane starts with zero.
- **Sentinel** is a deterministic vetoer that blocks writes to `.env`, `.ssh/`, `/etc/`, and demands a dual-key for `rm -rf`, `git push --force`, `npm publish`, etc.
- **Dual-key** requires two distinct panes to independently propose the same action. A single rogue agent cannot fire the gun.
- **Shadow journal** records every write; `/rollback` reverts the whole session.
- **Trust** rises with clean execution and falls on veto/rollback/fault. Agents earn their leash.

Want an agent to run unattended? You grant a narrow capability with a 600s expiry. Mistake gets made? `/rollback`, lose 0.15 of trust. Capability auto-returns. The user is in the loop *structurally*, not procedurally.

## Why this matters

The next year of AI tooling is going to look like a Cambrian explosion of single-agent CLIs (Claude Code, Aider, Codex, Crush, Cursor, Gemini, OpenCode, Antigravity, …) and a thin layer of products trying to put one shell around all of them.

The thin shell is a commodity. The interesting question is: **what kind of substrate makes it safe and useful to delegate real work to multiple agents at once?**

That's what Singularity is trying to answer. The dispatch grammar is the keyboard. The capability/sentinel/shadow pipeline is the steering wheel and brake. The trust score is the speedometer.

If we got this right, in two years the multi-agent CLI that ships with `claude` or `codex` will look like Singularity — small operator grammar, typed capabilities, journaled writes, model-curated shared memory — because no other shape is both safe enough and fast enough to use daily.

If we got it wrong, the lesson is still worth learning: which of these primitives are load-bearing, which are decorative, and what the right adjacent design would be.

## What this is not

- Not a wrapper that hides which CLI is doing the work. Each pane is the real CLI, and the actual model is whatever you ran in that pane.
- Not a hosted product. There's no server. Your conversation is local; your API keys are local; the journal is local.
- Not an agent framework. It does not give you a `Workflow` class. It gives you a room.
- Not opinionated about which LLM is best. Quorum exists *because* you want them disagreeing in front of you.

## Where to start

```bash
npx singularity-cli@latest         # try it
singularity wizard                 # set up auth for the CLIs you have
singularity                        # launch the war-room
?should I deploy on a friday       # quorum vote across all panes
/help                              # the keybind + grammar overlay
```

If you find this interesting, the deepest read is [CONTROL.md](../CONTROL.md) — the safety architecture — and [PATTERNS.md](../PATTERNS.md) — the ten named primitives the project is built on.
