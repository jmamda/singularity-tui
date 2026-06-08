# Good first issues

Curated, scoped tickets a new contributor can land in a single PR. File these as GitHub issues after the first OSS release.

## Adapters (~10 lines each, follows `makeSpawnCliAdapter` pattern)

1. **Add Aider adapter** — `aider --message "<prompt>" --no-stream --yes` → `src/adapters/aider.ts`. Inline persona; squelch stderr; default-rate pricing.
2. **Add Cursor agent adapter** — `cursor-agent run --print "<prompt>"` (verify exact flag) → `src/adapters/cursor.ts`.
3. **Add Gemini CLI adapter** — `gemini -p "<prompt>"` → `src/adapters/gemini.ts`.
4. **Add Ollama adapter** — `ollama run <model>` reads from stdin → uses inlinePersona; great for local-model panes.

## Slash commands (drop a `register({...})` block in `src/commands/registry.ts`)

5. **`/profile list`** — show all profiles in `~/.singularity/profiles/` with their pane lineups.
6. **`/export`** — write the current session (turns + artifacts + notes) to a single JSON file. Useful for sharing reproducers.
7. **`/import <file>`** — opposite of `/export`. Loads into the room as read-only history.
8. **`/diff workspace`** — diff the current `git status` against HEAD using the existing `diff.ts` renderer.

## UI polish

9. **Honor `FORCE_COLOR=0`** in addition to `NO_COLOR` (some terminals set the former).
10. **Add `j` and `k` as Tab alternatives** in normal navigation (matches vim users' muscle memory). One key handler change in `App.tsx`.
11. **Show pinned artifact count in the status bar.** Trivially extend `StatusBar.tsx`.

## Docs

12. **Add a triggers.json walkthrough** to `examples/` showing a "watch src/, dispatch a review on save" flow.
13. **Translate the README into one additional language** (community translation). Add to `docs/i18n/`.

## Tests (no new behavior, just better coverage)

14. **Test `lib/grammar.ts::renderGrammar`** — golden-file test of the output across ANSI vs NO_COLOR palettes.
15. **Test the `clarifyFollowup` integration path** with a fake stream that emits `CLARIFY:` and verify the follow-up dispatch carries the user's answer.

## Bigger but still well-scoped

16. **Persistent prompt history index** — currently each pane stores its own history; a global `/history` command searching across all panes would be ~50 lines.
17. **A `/replay` slash command** — given a session log file, walk it step-by-step (uses `lib/sessionLog.ts` already).

Each issue should link to the file paths involved. Mark them `good-first-issue` and `help-wanted`.
