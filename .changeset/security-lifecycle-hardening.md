---
'singularity-cli': minor
---

Security, process-lifecycle, and release-readiness hardening.

**Changed (breaking for `serve --http` scripts):** the HTTP server now binds `127.0.0.1` by default and refuses to bind a non-loopback host unless `SINGULARITY_SERVER_PASSWORD` is set. Use `--host` (or `SINGULARITY_SERVER_HOST`) plus a password to expose it.

- HTTP: hashed constant-time auth compare; request-body validation on `/dispatch`; client disconnect now stops the underlying adapter process; OpenAPI version read from package.json.
- Secrets: `~/.singularity/.env` is written and re-chmodded to `0600`.
- Adapters: spawned CLIs are killed when a dispatch is abandoned (try/finally), tracked per-send so `stop()` kills all in-flight children, 10-minute default timeout with SIGTERM→SIGKILL escalation, and trailing output without a final newline is no longer dropped.
- TUI: pane output is coalesced and capped (no unbounded memory growth); dispatch orchestration extracted to `src/dispatcher.ts`; fixed a conditional-hooks bug; clipboard copy is now cross-platform (pbcopy/clip/wl-copy/xclip/xsel) and no longer crashes on Linux/Windows.
- CLI: new `version`/`--version`; unknown commands/flags are rejected with usage instead of launching the TUI; launching without a TTY prints headless alternatives instead of an Ink raw-mode crash.
- Tooling: ESLint (typescript-eslint + react-hooks) added to `lint`; component tests via ink-testing-library; coverage thresholds ratcheted; CI runs Node 20/22/24 with stale-run cancellation; `version-packages` syncs brew/scoop/choco/AUR manifests.
