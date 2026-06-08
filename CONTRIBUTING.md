# Contributing to Singularity CLI

Thanks for opening an issue or PR. This guide is short on purpose — the project's design philosophy is in [PATTERNS.md](./PATTERNS.md), and the safety model in [CONTROL.md](./CONTROL.md).

## Development loop

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest run (must stay green)
npm run dev           # tsx src/cli.tsx — interactive TUI
npm run build         # produces dist/
```

All three (`typecheck`, `test`, `build`) gate CI. Don't open a PR with any of them failing.

## Adding an adapter

The cheapest contribution shape: a new AI CLI in `src/adapters/`. ~10 lines using `makeSpawnCliAdapter`:

```ts
export const myAdapter = makeSpawnCliAdapter({
  id: 'mytool',
  label: 'MYTOOL',
  command: 'mytool',
  argsForPrompt: (prompt) => ['run', prompt],
  pricing: { inPerM: 3.0, outPerM: 15.0 },
});
```

Add it to `ADAPTER_BY_ID` in `src/App.tsx` and you can put it in a profile.

## Adding a slash command

Drop a `register({ name, summary, usage, handler })` block in `src/commands/registry.ts`. The handler returns `{ ok, message? }` which surfaces as a notification.

## Adding a new design pattern

If you're proposing a structural change (a new operator, a new safety model layer, an interaction primitive), open an issue first with the rationale; we don't bolt on features without thinking about how they compose with the existing grammar, the capability/sentinel/trust pipeline, and the artifact substrate.

## Test conventions

- Pure libs under `src/lib/` get tests under `src/lib/__tests__/`.
- Streaming/parser code is tested across chunk boundaries (see `artifacts.test.ts`).
- The spawn-queue is tested against real child processes (see `adapters/__tests__/spawnCli.test.ts`).
- The shadow-fs has end-to-end tests in a sandbox temp dir (see `shadowfs.test.ts`).

## Security

Capability-gated actions (file writes, shell exec, network) flow through `src/lib/sentinel.ts` and `src/lib/capabilities.ts`. **Never** bypass them; if a code path needs to act on the OS, it must:

1. Check a capability (`checkCapabilities`)
2. Pass the sentinel verdict (`sentinelVerdict`)
3. Journal writes through `shadowWrite` (so `/rollback` works)

If you find a way to bypass these gates without an explicit user grant, that's a security bug. See [SECURITY.md](./SECURITY.md).

## Style

- Prettier (config in `.prettierrc.json`); `npm run format` to apply.
- Default to no comments; only add one when *why* is non-obvious.
- Don't add features beyond the issue. Three similar lines is better than a premature abstraction.

## License

By contributing, you agree your contribution is licensed under MIT (see [LICENSE](./LICENSE)).
