# World Models — 50 functionalities for Singularity CLI

A **world model** for a coding CLI is an explicit, queryable, updatable representation of *the project Singularity is operating on* — its files, symbols, dependencies, git state, build status, agents' beliefs, and predicted effects of actions. Agents read from it before deciding; they update it after acting.

The substrate already exists in pieces (shared notes, artifacts, capabilities, shadow journal). This document catalogs what a complete world-model layer adds — 50 functionalities grouped by role.

## Categories

- **A. State representation** (1–10) — what's true now
- **B. Predictive models** (11–20) — what would happen if
- **C. Simulation / counterfactual** (21–30) — execute hypothetically
- **D. Memory / continuity** (31–40) — what was true before
- **E. Introspection / querying** (41–50) — agents and humans ask the model

---

## A. State representation

1. **Project graph** — files as nodes, imports as edges. Built once, kept fresh by file watcher.
2. **Symbol table** — every exported function/class/type per file with line ranges.
3. **Dependency DAG** — module-level dependencies with usage-frequency weights.
4. **Test-coverage map** — which test files exercise which source files.
5. **Git state model** — branch, dirty paths, ahead/behind, recent commit subjects.
6. **Build state cache** — last `tsc`/`test`/`build` results + timestamps + error coordinates.
7. **Developer-intent vector** — running summary of the last N prompts → inferred goal.
8. **File hot-spots** — recently edited, recently broken, recently touched-by-agent.
9. **Cost / budget model** — per-pane and per-session spend with extrapolation.
10. **Agent-capability map** — what each pane is granted to do (live capabilities chip).

## B. Predictive models

11. **Type-flow prediction** — if a type changes here, what downstream files break (TS reverse-lookup).
12. **Test-impact prediction** — given a diff, which tests are likely to fail (heuristic + history).
13. **Performance prediction** — estimated cost & latency of a proposed change before running it.
14. **Merge-conflict prediction** — given a proposed branch, where does main collide.
15. **Refactor blast-radius** — files touched / symbols renamed / tests broken for a given refactor.
16. **Time-to-completion** — per plan step, based on prior similar steps.
17. **Probability of success** — per action, given agent's recent track record.
18. **Token / cost forecast** — multi-turn dispatch budget estimate.
19. **Cache-hit prediction** — likelihood that the next dispatch hits LLM prompt cache.
20. **Required-capability inference** — what `/grant` calls a proposed plan needs.

## C. Simulation / counterfactual

21. **Shadow execution of edits** — apply patch to in-memory copy, run predictions, never touch disk.
22. **Dry-run worktree** — spawn ephemeral `git worktree`, simulate, throw away.
23. **Test-suite mental simulation** — without running, predict pass/fail using regex+history.
24. **Build mental model** — same for `tsc`/`npm run build`.
25. **Git rebase / merge simulation** — show conflicts before performing.
26. **Container-isolated runs** — Docker-based execution for risky commands.
27. **Per-pane branch states** — each agent has its own "if I did X" workspace.
28. **Counterfactual rollback** — "what if we hadn't applied artifact #14" — diff against current.
29. **Monte-Carlo of agent paths** — sample N plans, score by expected cost & success.
30. **Plan-branching with cost-pruning** — DAG of options, prune branches over budget.

## D. Memory / continuity

31. **Persistent project memory** — `~/.singularity/projects/<slug>/state.json` survives restarts.
32. **Compressed conversation summaries** — turn pairs older than N condensed by an LLM.
33. **Embedding index of past artifacts** — semantic recall of "have we written X before".
34. **Decision log** — append-only journal of major project decisions with rationale.
35. **NOTE: entity-relationship graph** — pinned facts as nodes; relationships from co-occurrence.
36. **Error history** — every fault with status (open / acknowledged / resolved) + resolution.
37. **Cross-pane shared knowledge base** — facts every pane reads; merged from `NOTE:`, `COMMENT-ON:`, plus user `/note`.
38. **Code-pattern repository** — project-specific idioms (naming, error handling) auto-extracted.
39. **User-preference model** — inferred from accepted vs rolled-back artifacts.
40. **Long-term trust accumulation** — trust scores persist + decay slowly.

## E. Introspection / querying

41. **`/world describe`** — "what does this codebase do?" — auto-generated summary on demand.
42. **`/world callers <symbol>`** — who calls function `X`, with file:line.
43. **`/world impact <path>`** — "if I change this file, what changes downstream?"
44. **`/world know <topic>`** — "what does the room know about Y?" — pulls from notes + history.
45. **`/world why <slot>`** — "why did pane N propose Z?" — reasoning trace from recent turns.
46. **`/world diff`** — what changed in the model itself since last action (state delta).
47. **`/world uncertain`** — where the world model is uncertain (low coverage / stale / no data).
48. **`/world gaps`** — what evidence would resolve our top open question.
49. **`/world pattern <hash>`** — "have we seen this pattern before?" — fuzzy lookup in artifact index.
50. **`/world next`** — "what would the user likely ask next?" — predictive prompt.

---

## Architecture

All 50 sit on a single module: `src/lib/worldModel.ts`. It owns four maintained projections:

1. **GraphView** (1, 2, 3, 8) — file + symbol graph, refreshed by a watcher.
2. **GitView** (5) — polled `git status` snapshot.
3. **BuildView** (6) — cache of last `npm run typecheck / test / build` outcomes.
4. **AgentView** (9, 10, 17, 40) — derived from the store: capabilities + trust + spend per pane.

Predictive (B), simulation (C), memory (D), and query (E) modules all *consume* these four views — they don't maintain their own truth.

## Phased rollout

- **Phase 1 (this session — viability):** Foundation module + 8 highest-leverage `/world` commands. Council judges plan + foundation.
- **Phase 2:** Predictive modules (impact, test-impact, type-flow).
- **Phase 3:** Persistent memory (31, 32, 33).
- **Phase 4:** Simulation (21, 22, 27).

The condition for goal completion as stated is **deployment viability**, not full implementation. A council agreement that this plan is coherent and the foundation is sound suffices.
