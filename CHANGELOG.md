# Changelog

## 0.7.0

### Minor Changes

- b804fbd: Security, process-lifecycle, and release-readiness hardening.

  **Changed (breaking for `serve --http` scripts):** the HTTP server now binds `127.0.0.1` by default and refuses to bind a non-loopback host unless `SINGULARITY_SERVER_PASSWORD` is set. Use `--host` (or `SINGULARITY_SERVER_HOST`) plus a password to expose it.
  - HTTP: hashed constant-time auth compare; request-body validation on `/dispatch`; client disconnect now stops the underlying adapter process; OpenAPI version read from package.json.
  - Secrets: `~/.singularity/.env` is written and re-chmodded to `0600`.
  - Adapters: spawned CLIs are killed when a dispatch is abandoned (try/finally), tracked per-send so `stop()` kills all in-flight children, 10-minute default timeout with SIGTERM→SIGKILL escalation, and trailing output without a final newline is no longer dropped.
  - TUI: pane output is coalesced and capped (no unbounded memory growth); dispatch orchestration extracted to `src/dispatcher.ts`; fixed a conditional-hooks bug; clipboard copy is now cross-platform (pbcopy/clip/wl-copy/xclip/xsel) and no longer crashes on Linux/Windows.
  - CLI: new `version`/`--version`; unknown commands/flags are rejected with usage instead of launching the TUI; launching without a TTY prints headless alternatives instead of an Ink raw-mode crash.
  - Tooling: ESLint (typescript-eslint + react-hooks) added to `lint`; component tests via ink-testing-library; coverage thresholds ratcheted; CI runs Node 20/22/24 with stale-run cancellation; `version-packages` syncs brew/scoop/choco/AUR manifests.

## 0.6.0 — recipes, hardened governance

**Recipes** — `src/lib/recipes.ts`. Declarative YAML/JSON sequences of dispatches + capability grants. `singularity recipe list` to enumerate; `singularity recipe <name> [--var=value]` to run headless; `/recipe <name>` from the TUI. Seven bundled examples in `examples/recipes/` (cross-model-code-review, pre-deploy-checklist, secrets-scan-vote, multi-platform-announcement, readme-from-code, steel-man-vs-straw-man, smoke-test). Tiny dep-free YAML subset parser supports lists, maps, scalars, `|` block scalars. `{{var}}` template substitution with built-in `{{date}}`/`{{time}}`. Per-step `timeoutSec`, `continueOnError`, `needs:` (auto-grant), `target:` (slot list).

**Runtime dispatch hook** — `src/lib/runtimeDispatch.ts` + `src/App.tsx::submitOperatorAware`. Lifts the input-bar's operator routing (`!` `?` `@plan` `>N` `>>N` `/cmd`) into a module-level function that both the keypress handler and out-of-band callers (recipes, future plugins) can invoke. Recipes from the TUI now flow through the real adapter dispatch path — no longer a stub.

**MCP caller-slot pinning** — `src/lib/selfMod.ts`. The MCP caller's effective slot is hard-pinned to a reserved `MCP_CALLER_SLOT = 0`; previously a JSON-RPC peer could spoof `callerSlot: 1` and ride pane 1's `meta:grant:*` caps. To let MCP do anything gated, the human user must `/grant 0 meta:* …` explicitly. Regression test in `src/lib/__tests__/selfMod.test.ts`.

**`/edit` data-corruption guard** — `src/commands/registry.ts`. Empty `find` previously caused `before.split('').join(replace)` to interpolate `replace` between every byte. Now rejected with `find string cannot be empty`. Regression test in `src/lib/__tests__/edit.test.ts`.

**Sentinel sensitivity** — `src/lib/sentinel.ts`. SENSITIVE_WRITE regexes now match path _segments_ anywhere, not just the leading slash. Catches relative writes to `etc/passwd`, `config/.ssh/id_rsa`, `…/private/…`.

**MCP buffer cap** — `src/mcp.ts`. JSON-RPC stdio parser now caps the line buffer at 8 MiB; resyncs at the next newline on overflow. Prevents a misbehaving peer from OOM'ing the server.

**HTTP error hygiene** — `src/httpServer.ts`. `POST /dispatch` wraps `JSON.parse` and returns `400 invalid json body` instead of leaking the raw `SyntaxError`. Top-level 500 handler logs the stack server-side and emits `internal error` on the wire.

**Bundled examples resolution** — `src/lib/recipes.ts`. Examples dir resolved via `import.meta.url`, not `process.cwd()`. Recipes loadable from any cwd post-npm-install.

**Tests** — 107 passing (added recipes, edit empty-find regression, MCP caller-slot impersonation).

## 0.5.0

Version number skipped — no separate public release; the 0.5.x work shipped as part of 0.6.0.

## 0.4.0 — parity-plus with OpenCode

Closes the gap-list against OpenCode (sst/opencode, ~169K stars). Adds dimensions OpenCode had and we didn't; keeps the dimensions where we already lead.

**Direct multi-provider models** — `src/adapters/provider.ts`. No CLI binary required. Provider URIs: `provider:anthropic://claude-sonnet-4-6`, `provider:openai://gpt-5.1`, `provider:openrouter://anthropic/claude-3.5-sonnet`, `provider:ollama://llama3:8b`. Env: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `OLLAMA_HOST`. Streaming SSE + JSONL. Example at `examples/profiles/providers.json`.

**Themes** — `src/lib/themes.ts` + `/theme <name>`. Eight built-ins: code-red, tokyonight, catppuccin, gruvbox, nord, matrix, ayu, mono. `setTheme` mutates the palette in place so all consumers update without prop-drilling.

**Project rules** — `src/lib/initRepo.ts`. New `/init` scans cwd and writes `SINGULARITY.md`. Every dispatch auto-loads `SINGULARITY.md` (or `AGENTS.md` / `CLAUDE.md` fallback) and prepends.

**Conversation `/undo`** — pops the last user+assistant turn pair (complements the file-level shadow journal).

**`@file:N-M` syntax** — `src/lib/fileRefs.ts`. Prompts containing `@path/file.ts:42-60` auto-resolve to fenced code blocks prepended to the dispatch.

**Plugin loader** — `src/lib/plugins.ts`. Drop `.js` in `~/.singularity/plugins/`; default-exports a factory that receives `PluginApi` (`notify`, `registerCommand`, `onDispatch`, `onResponse`).

**Built-in tools** — `/webfetch` and `/websearch` slash commands; both gated by `net:` capability.

**HTTP server mode** — `src/httpServer.ts` + `singularity serve --http [--port N]`. REST + SSE + OpenAPI; Bearer auth via `SINGULARITY_SERVER_PASSWORD`.

**`/share`** — exports session as Markdown (turns + notes + artifacts).

**Doom-loop detection** — `sentinel.isDoomLoop` returns true after 3 identical proposals in 60s.

**Tests** — 77 passing (added provider + fuzzy tests).

## 0.3.0 — to top-starred

Closes the 25-item gap list between "released" and "discoverable, adoptable open source."

**Discoverability & docs**

- README header: badges (CI, npm, downloads, MIT, Node, Discussions), 60-second quickstart, asciinema placeholder, name disambiguation from the Singularity container project.
- `docs/manifesto.md` — why this exists, in prose.
- `docs/comparison.md` — side-by-side vs Claude Code, Aider, Crush, Codex CLI, Continue.
- `docs/architecture.md` — mermaid module graph + dispatch-pipeline diagram + module map.
- `docs/good-first-issues.md` — 17 well-scoped tickets for new contributors.

**OSS community infrastructure**

- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- `.github/ISSUE_TEMPLATE/{bug,feature,adapter}.yml` + `config.yml` (disables blank issues)
- `.github/pull_request_template.md`
- `.github/DISCUSSION_TEMPLATE/show-and-tell.yml`
- `.github/FUNDING.yml` placeholder

**Distribution**

- `Dockerfile` (multi-stage, alpine-based; `singularity` entrypoint)
- `brew/Formula/singularity-tui.rb` (formula template)
- CI matrix: Linux + macOS + Windows × Node 20 + 22, plus a Docker build job on main.
- `.changeset/` config + `.github/workflows/release.yml` (changesets → npm publish + GitHub release).

**`npx`-first experience**

- New **demo adapter** (`src/adapters/demo.ts`) that streams a deterministic fake response so first-time users get the full TUI experience (boot, race bars, artifacts, `/help`) without any AI CLI installed or API keys configured.
- `singularity --demo` flag auto-creates and loads a demo profile (3 demo panes + artifacts).

**Engineering (closing the council's deferred items)**

- **Persistent shadow journal** — every write appended to `~/.singularity/journal.jsonl`; restored on startup. `/rollback` survives crashes.
- **Persistent trust** — per-slot scores written to `~/.singularity/trust.json` every second.
- **#13 Dispatch-level capability gate** — new `dispatch` capability kind; profiles can set `requireDispatchCapability: true` to enforce per-slot pre-approval (`/grant <slot> dispatch:auto 600`).
- **#15 Scrollback** — PgUp / PgDn (or Shift+↑/↓) scroll any pane's history; footer shows `↑N` while back-scrolled.
- **#16 Fuzzy command palette** — Ctrl+P opens a modal palette; type-to-narrow across slash commands + operators; Enter inserts.
- **#14 MCP client** — `src/lib/mcpClient.ts`: stdio JSON-RPC client that spawns an external MCP server, enumerates tools, and dispatches `tools/call`. Foundation for paned-agent tool access in v0.4.
- **Recipes + examples** — `examples/profiles/{frontend,devops,quorum}.json`, `examples/triggers.json`, `examples/snippets/{review,plan}.txt`, `examples/recipes/{review-a-pr,race-implementations,safe-shell}.md`.

**Tests**: 71 passing (added fuzzy matcher tests).

## 0.2.0 — master control

Hands the PC over to agents safely via a governance layer. Ten new primitives.

**Foundation**

- `lib/capabilities.ts` — typed/scoped/expiring/revocable grants. `/grant`, `/revoke`, `/caps`, `/lend`. Every OS-touching path now checks capabilities first.
- `lib/shadowfs.ts` — journaled write proxy with named snapshots and `/rollback`. `/apply` and the shell adapter both go through it.

**PC-as-pane**

- `adapters/shell.ts` — slot 5 = the machine. Dispatchable, status-tracked, capability-gated. New `components/PCStrip.tsx` renders it as a slim strip between the timeline and prompt bar.

**Governance**

- `lib/sentinel.ts` — deterministic veto on sensitive writes (`.env`, `.ssh/`, `/etc/`) and dual-key requirement on dangerous execs (`rm -rf`, `git push --force`, `sudo`, fork bombs).
- Dual-key handoff — two distinct panes must independently propose the same action within 60s.
- Capability marketplace — `/lend <from> <to> <kind:pattern> <seconds>` with auto-return.
- Trust decay — per-slot autonomy budget that rises on clean execution and falls on rollback/veto/fault. Visible in the PC strip.

**Advanced**

- `lib/replay.ts` — `ACTION exec:` / `ACTION write:` markers extracted into plan traces. Agents propose; user steps through.
- `lib/triggers.ts` + `singularity daemon` — file-watch, interval, and git-commit triggers auto-dispatch prompts.
- `lib/selfMod.ts` + extended `mcp.ts` — Singularity's own configuration callable as MCP tools, gated by `meta:configure` capability granted only by the human user.

**Open-source readiness**

- `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CONTROL.md`, `CHANGELOG.md`.
- Tests: 66 passing (added capabilities + shadowfs + sentinel + dual-key + selfMod).
- Version bumped to 0.2.0; `files` allowlist expanded for `npm publish`.

## 0.1.0 — initial drop

Dispatch grammar (`text` / `!` / `?` / `>N` / `>>N` / `@plan` / `/cmd`), roster awareness, NOTE/CLARIFY/CONFIDENCE/COMMENT-ON conventions, artifact pane, iTerm2 native splits, MCP server mode, headless mode, file watcher, PR review, wizard, profiles + personas, cost + budget. See `PATTERNS.md` for design rationale.
