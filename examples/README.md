# Examples

Runnable examples of the more interesting Singularity workflows. Copy and adapt.

## Profiles

- **`profiles/frontend.json`** — Claude (architect), OpenCode (implementer), Codex (reviewer), Artifacts. Web/UI tilt.
- **`profiles/devops.json`** — Claude (planner), Shell pane with narrow exec capabilities, LangGraph monitor in the ticker.
- **`profiles/quorum.json`** — three independent voters + an artifact pane. For YES/NO decisions on architecture/deploys.

Copy one to `~/.singularity/profiles/<name>.json`, then `singularity --profile <name>`.

## Triggers (daemon mode)

- **`triggers.json`** — three example triggers:
  1. `fs:change` on `./src` dispatches "explain {{file}}" to Claude
  2. `git:commit` in `.` dispatches a quorum review to all panes
  3. `time:interval` every 1800s dispatches "summarize my last 30 minutes" to Claude

Copy to `~/.singularity/triggers.json`, then `singularity daemon`.

## Snippets

- **`snippets/`** — saved prompt templates with `{{var}}` placeholders. Recall in-TUI with `/snippet <name>`.

## Recipes

- **`recipes/review-a-pr.md`** — how to use Singularity to multi-agent-review a GitHub PR.
- **`recipes/race-implementations.md`** — broadcast a "implement X in three languages" prompt and compare.
- **`recipes/safe-shell.md`** — using the PC pane with narrow capability tokens + sentinel + shadow rollback.
