# Recipe: a shell pane you can leave on

The PC pane (slot 5) lets agents run commands. By default it has zero capabilities — every exec fails until you grant.

## Setup (one-time per session)

```
/grant 5 exec:^npm (test|run lint|run build)$ 1800    # 30 min
/grant 5 exec:^git (status|log|diff)            900   # 15 min
```

Narrow regexes; short expirations. The PC strip in the UI shows live capability chips with countdowns.

## Dispatching

```
5
npm test
```

Or just `5` then type a command. Sentinel blocks dangerous patterns (`rm -rf`, `git push --force`, etc.) and requires dual-key for the rest of the documented dangerous list.

## When something goes wrong

```
/journal           # see every journaled write since session start
/rollback root     # revert all of them in one keystroke
```

Trust drops on rollback; the next exec will need stricter approval.

## Why this is different from `bash` in another terminal

- Capability tokens make "what's allowed" *visible* and *expiring*. No more "what daemons did I leave with sudo open."
- Sentinel hard-blocks the classic foot-guns even if a capability would technically allow them.
- The shadow journal means a bad agent action is one keystroke away from undo.
- Trust decay means the same pane needs more approval after a mistake, less after a streak of cleanly-completed actions.
