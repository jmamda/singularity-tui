# Recipe: multi-agent PR review

Three independent reviewers + an artifact pane that collects every code suggestion.

## Setup

1. `cp examples/profiles/quorum.json ~/.singularity/profiles/quorum.json`
2. `singularity --profile quorum`
3. Optional but recommended: a write capability on a scratch dir so accepted suggestions can land.
   ```
   /grant 4 write:./pr-suggestions/**
   ```

## Run

```
?Reviewing PR #1234 (paste diff or use `singularity review 1234`). Is it safe to merge?
```

Each pane votes YES / NO / ABSTAIN with reasoning. Race bars show progression; tally appears live.

## Follow-ups

- `>>3 deepen on the one concrete issue you found` — push the artifact-context back to one reviewer for elaboration.
- `!is there a smaller version of this PR that's safer?` — broadcast a follow-up.
- `/diff #1 #2` — compare two reviewers' code suggestions side-by-side.

## Why this beats single-reviewer

- Three independent perspectives, classifiable with `/quorum` weighting.
- Disagreements surface as `COMMENT-ON:` markers attached to the artifacts.
- The whole session is journaled — `/rollback` if you accidentally apply a bad suggestion.
