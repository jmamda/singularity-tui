# Recipe: race implementations across CLIs

Three different AI CLIs producing the same code, side by side, with race bars showing whoever finishes first.

## Setup

Default profile is fine. You need `claude`, `opencode`, and `codex` installed (see the wizard).

## Run

```
!implement fizzbuzz in python AND typescript. NOTE any edge cases you considered.
```

The `!` prefix turns this into a broadcast — all eligible panes run in parallel. The race bars overlay fills as tokens stream in. Slot 4 collects every code block as a numbered artifact.

## What to do with the results

- `/diff #1 #2` — diff the python implementations across panes
- `j` / `k` navigate artifacts; `p` pins the one you like
- `>>3 critique #1 specifically` — send the winner to one pane for review
- `s` saves the selected artifact to disk (capability-gated, journaled)

## Why race them

Multiple models trained on different data produce subtly different code. For `fizzbuzz` it's boring. For `implement a debounced rate limiter that handles clock skew`, you'll see real differences — and the artifact pane makes them comparable.
