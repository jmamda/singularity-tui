# Roadmap — 25 functionality & productivity improvements

Status: **audited & reviewed — GO-WITH-CHANGES applied** · Owner: maintainer · Created 2026-06-11

Each item: what + why + key files + effort (S < ½ day, M ≈ 1–2 days, L ≈ 3+ days).
Numbers are stable IDs for changesets/PRs (`roadmap-NN`).

## A. Input ergonomics (the prompt bar is append/backspace only today)

1. **Cursor editing in the prompt bar** — ←/→, Home/End, Ctrl+A/E/W/U, word-wise
   delete. The single biggest daily friction. `App.tsx` key handler + `store.ts`
   (`promptDraft` string → `{text, cursor}` — this refactor lands as its own
   first PR; it ripples through App/PromptBar and existing tests), cursor must
   survive the history-scroll draft swap (`draftBeforeScroll`). **M**
2. **Bracketed paste support** — enable `ESC[?2004h` ourselves (Ink 7 doesn't)
   and insert pastes atomically with newline handling; the draft path already
   accepts multi-char input, so the work is the escape decoding. Build the
   decoder as a reusable `lib/escapes.ts` — mouse (item 6) reuses it. **M**
3. **Multi-line prompts** — trailing-`\` continuation appends a newline instead
   of dispatching (Shift+Enter is indistinguishable from Enter through Ink's
   `useInput`; kitty keyboard protocol can upgrade this later). `App.tsx`,
   `PromptBar.tsx` grows vertically. **M**
4. **Completion in the prompt bar** — complete `/commands`, `@file:` paths,
   recipe/theme/snippet names. Tab is taken by `cycleTarget`, so Tab completes
   only when the draft is non-empty (empty-draft Tab still cycles). New
   `src/lib/complete.ts`; `fuzzy.ts` ranks. **M**
5. **Ctrl+R fuzzy history search** — reverse-search across global prompt
   history (aggregate the per-slot files in `history.ts`, capped 100 each).
   Overlay reuses CommandPalette plumbing. **M**

## B. Pane interaction & reading output

6. **Mouse support** — click a pane to target it, wheel scrolls pane output.
   Ink 7 has no mouse API: SGR-1006 decoding on raw stdin via the shared
   `lib/escapes.ts` from item 2. Gated behind `/mouse on`; degrades cleanly.
   *Droppable to 0.13.0 if phase 5 runs hot.* **L**
7. **Pane zoom** — `z` (draft empty) toggles the targeted pane full-screen;
   complements existing `/focus` (2/3 split) and `/compact`. `App.tsx` layout. **S**
8. **Copy last response** — `y` (draft empty) / `/copy [N]` copies the targeted
   pane's last assistant *turn* via `lib/clipboard.ts` (the existing `c` key
   only copies artifacts). **S**
9. **Per-pane transcript export** — extend the existing `/share` markdown
   export (it already writes the full session) with `--pane N` filtering and
   per-turn timestamps. **S**
10. **Search match navigation** — `/search` already highlights every pane;
    add match counts and `n`/`N` jump-to-match with auto-scroll
    (`store.scrollOffset`). `Pane.tsx`, `store.ts`. **M**

## C. Dispatch power

11. **Pane tags + targeted broadcast** — profile `tags: ["backend"]`;
    `!@backend prompt` broadcasts to the tagged subset; `/tag 2 backend` at
    runtime. `profiles.ts`, `dispatcher.ts` broadcast filter. **M**
12. **Pipelines** — `1>2>3 prompt`: dispatch to pane 1, auto-relay the response
    to 2, then 3; pipeline progress in the timeline strip. Needs its own parser
    (parseRelay is single-hop, targeted-pane-sourced) and completion polling —
    precedent in `runPlanExec` (dispatcher.ts). **M**
13. **Re-run / re-route** — `/again` re-dispatches the last prompt to the same
    pane; `/redo N` sends it to a different pane (per-pane `lastPrompt` exists). **S**
14. **Quorum follow-up actions** — `?question --then /recipe deploy` runs a
    slash/recipe when the vote passes a configurable threshold (new
    `quorumThreshold` in profile; `quorum.ts` tally is already weighted). **M**
15. **In-TUI watch** — `/watch <glob> <template>` arms a file watcher that
    dispatches on change ({{file}} substituted); `/watch off` disarms. Reuses
    the debounce pattern from headless `watch.ts` but calls `dispatchOne`. **M**

## D. Adapters & shell integration

16. **Gemini CLI adapter** — ~10 lines via `makeSpawnCliAdapter`; detect on
    PATH, add to wizard checks. `src/adapters/gemini.ts`. **S**
17. **Config-defined custom adapters** — profile JSON
    `{"adapterId": "custom:mytool", "command": "mytool", "args": ["-p", "__PROMPT__"]}`
    so users add CLIs with zero code; slots in next to the existing `provider:`
    prefix branch in `dispatcher.ts`. argv-array spawn only — never a shell
    string. **M**
18. **Runtime model switch** — `/model N <model-id>` builds a fresh provider
    adapter (model is per-instance config) and swaps it on the pane; shown in
    the pane footer. `adapters/provider.ts`, registry command. **M**
19. **Markdown-aware pane rendering** — bold/italic/inline-code and
    syntax-tinted fences in pane output. Hard part (per audit): `appendOutput`
    coalesces chunks at arbitrary boundaries and the stream interleaves prompt
    echoes / `[err]` / meta lines, so the renderer re-parses the joined stream
    incl. unterminated fences on every token. Scope capped: bold/italic/code/
    fences only. `Pane.tsx` + `lib/mdRender.ts` (new, no deps). **L**
20. **Side-by-side last-turn diff** — `/diff N M` already unified-diffs two
    panes' full outputs; rescope to *last assistant turn only* + side-by-side
    column layout for post-race comparison. `lib/diff.ts` engine reused. **M**

## E. Sessions, stats & ecosystem

21. **Session resume** — `singularity --resume` / `/resume` restores the last
    session's transcripts + remote session ids (not scroll state).
    Prerequisite (per audit): journal a new `session` LogEvent kind — remote
    ids are currently never logged — and add session boundaries to the per-day
    JSONL. `sessionLog.ts` + loader. **L**
22. **Per-project config** — auto-load `.singularity.json` from the repo root
    (profile, tags, budgets, default targets). `profiles.ts`, `cli.tsx`. **M**
23. **Stats dashboard** — `/stats` overlay: per-pane latency percentiles, token
    throughput, cost breakdown, race win-rates. Per audit, this data is NOT
    collected today (metrics are last-turn scalars; the ECG strip is
    decorative): add a lightweight sample collector first, then the overlay. **L**
24. **Stdin piping for headless run** — `cat err.log | singularity run -t claude
    -p "explain this"` appends stdin to the prompt. `headless.ts`, `cli.tsx`. **S**
25. **Shell completions** — `singularity completions zsh|bash|fish` prints a
    completion script. Scheduled in the *final* phase so it ships knowing all
    new flags/commands. `cli.tsx` + generator. **S**

---

## Implementation plan

Five phases ≈ five minor releases through the changesets pipeline.
Sequencing rules from review: the `promptDraft` refactor is phase 1 PR #0;
the escape decoder (item 2) is built for reuse by mouse (item 6); item 22
pulled into phase 4; completions (25) moved to phase 5 so they're never stale;
mouse (6) is pre-declared droppable.

| Phase | Release | Items | Theme | Est. |
|---|---|---|---|---|
| 1 | 0.8.0 | store refactor, 1, 2, 3, 4, 5, 8 | Input ergonomics + copy | ~2 wk |
| 2 | 0.9.0 | 7, 9, 10, 13, 20, 23 | Reading & comparing output | ~1.5 wk |
| 3 | 0.10.0 | 11, 12, 14, 15 | Dispatch power | ~1 wk |
| 4 | 0.11.0 | 16, 17, 18, 22, 24 | Adapters, project config, piping | ~1 wk |
| 5 | 0.12.0 | 19, 21, 25, then 6 | Markdown, sessions, completions, mouse | ~2 wk (6 may slip to 0.13.0) |

### Per-item workflow

1. Branch `roadmap-NN-short-name`; implement with tests — pure logic extracted
   to `lib/` (completion, escapes, md-render, pipeline parsing are pure
   functions); TUI pieces via ink-testing-library; **escape-sequence features
   additionally get PTY-level integration tests (node-pty)**.
2. `npm run lint && npm run test:coverage && npm run build` (ratchet holds or rises).
3. `npx changeset` — body is user-facing changelog text.
4. PR → CI green on 3-OS × Node 20/22/24 → squash-merge.
5. For input/escape features: manual pass on the terminal matrix —
   Terminal.app, iTerm2, Windows Terminal, tmux, VS Code terminal.

### Per-phase release steps (matches the live pipeline)

1. Merge the phase's last PR → Release workflow refreshes the **Version
   Packages** PR (`npm run version-packages` bumps version + CHANGELOG and
   syncs brew/scoop/choco/AUR manifests).
2. Merge the Version PR with `gh pr merge --admin` (changeset-release branches
   get no CI checks — GITHUB_TOKEN pushes don't trigger workflows; the same
   commits are already green on main). Run `npm pack --dry-run` first to sanity
   the file list.
3. CI publishes via `npx changeset publish` (idempotent; creates the tag, the
   action pushes it). Known gate: `prepublishOnly` runs lint+test+build at
   publish time — a flaky test blocks release day.
4. Post-publish: `npm run sync-packaging` → commit real tarball sha256.
   **Edit the auto-created GitHub release** (changesets/action creates it —
   `createGithubReleases` defaults to true; do NOT `gh release create`, it
   collides) to add phase highlights.
5. Update README tables + reshoot screenshots if the UI changed; **update
   `src/showcase.ts`, the demo profile, and `scripts/record-demo.sh`** so the
   recorded demo doesn't lie; verify `npx singularity-tui@latest version` and
   a fresh `--demo` in a real terminal; announce in GitHub Discussions.

### Risks & mitigations

- **Terminal escape fragility** (2, 3, 6): feature-detect, degrade to current
  behavior, gate mouse behind `/mouse on`; PTY tests + terminal matrix.
- **Windows/ConPTY** behaves differently for bracketed paste, mouse, and
  clipboard — the windows-latest CI leg plus a manual Windows Terminal pass
  are phase 1/5 exit criteria.
- **Store-shape break**: `promptDraft` string→object refactor isolated as
  phase 1 PR #0 with its own test updates.
- **Coverage ratchet** with UI-heavy phases: logic-first extraction to `lib/`.
- **Scope creep on 19/21/23**: markdown capped at bold/italic/code/fences;
  resume restores transcripts + session ids only; stats starts with a sample
  collector, percentiles only over the current session.
- **Adapter sprawl** (16/17): custom adapters reuse `makeSpawnCliAdapter`;
  argv arrays only, never shell strings.
- **Ink upgrades vs hand-rolled stdin parsing**: pin Ink minor; `lib/escapes.ts`
  has its own tests so an Ink bump failing shows up in CI, not in users' hands.

### Audit & review log

- [x] **Feasibility audit (agent A, 2026-06-11)** — 25/25 items checked against
  the codebase. Findings applied: items 9, 10, 20 rescoped (partially existed:
  `/share` export, all-pane search highlight, pane `/diff`); item 3 switched to
  trailing-`\` (Shift+Enter undetectable via Ink); item 4 completion key
  context-gated (Tab owned by cycleTarget); item 21 gained the session-id
  journaling prerequisite; item 23 re-graded M→L (stats data not collected
  today); items 1, 2, 12, 15 annotated with implementation caveats.
- [x] **Plan review (agent B, 2026-06-11)** — verdict **GO-WITH-CHANGES**; all
  10 amendments applied: GitHub-release collision fixed (edit auto-created
  release), promptDraft refactor isolated as PR #0, escape decoder designed
  for reuse, item 22 → phase 4, item 25 → phase 5, mouse droppable, PTY tests
  + terminal matrix added, showcase/demo upkeep added to release steps,
  Windows/ConPTY risk added, prepublishOnly gate documented, stale
  CONTRIBUTING Releasing step fixed (same commit as this revision).
- [x] Sign-off: plan accepted with the above revisions — ready for phase 1.
