# 50 novel use cases for the Singularity stack

The stack: dispatch grammar (`!` `?` `>N` `>>N` `@plan`), multi-CLI orchestration, capability tokens, sentinel, shadow journal, MCP server+client, providers (Anthropic/OpenAI/OpenRouter/Ollama), artifacts pane, world model, OS triggers, daemon mode, browser/email/calendar/voice tools, HTTP server + web UI.

Each use case is a single sentence: *who* uses *what operator(s)* for *what outcome*.

## Software engineering

1. **Cross-model code review** — `?ship this PR` votes across Claude, GPT, OpenCode. Tally surfaces the disagreements *between* models, which is what review actually values.
2. **Race three implementations** — `!implement debounced rate limiter` runs three model-versions of the same algorithm side-by-side; pick or merge.
3. **Refactor with rollback** — every refactor pass runs through shadow journal; `/rollback` if tests regress.
4. **Plan-then-execute migrations** — `@plan migrate users table to postgres 17` hands subtasks to an implementer and a reviewer pane.
5. **Dual-key destructive command** — `git push --force` requires two agents *and* the human to agree.
6. **PR triage at scale** — daemon trigger on `gh pr list` quorum-votes each PR (approve/request-changes/comment).
7. **Spec-to-test relay** — pane 1 writes specs; `>2` relays to a test-writer; `>3` to an implementer.
8. **Codebase Q&A with citations** — `/world describe` + `/world callers <fn>` gives grounded answers from your repo, not hallucinations.
9. **Incremental upgrade audit** — three panes scan three dependency upgrades; quorum on safety.
10. **Pair-programming with self** — race your own past selves: load yesterday's persona vs today's; debate.

## DevOps / SRE

11. **On-call assistant** — daemon trigger watches `/var/log` for FAULT patterns; auto-dispatches `?should we page` to multi-model quorum.
12. **Pre-deploy checklist** — `@plan deploy v0.4.0` produces ordered tasks; each step capability-gated.
13. **Postmortem drafting** — pane 1 reads commit history, pane 2 reads metrics, pane 3 synthesizes; artifacts pane collects.
14. **Runbook validator** — broadcast every step of a runbook to three panes; flag the ambiguous ones.
15. **Migration dry-run** — shadow journal lets the agent attempt the migration; `/rollback` if any check fails.

## Security & audit

16. **Three-eye review of `rm -rf`** — sentinel veto + dual-key + capability check + trust-decay penalty for the proposing slot if rolled back.
17. **Secrets scan vote** — `!scan for secrets in src/**` quorum-votes each finding to suppress false positives.
18. **Capability drift detection** — daemon polls capability list; alerts when an unexpected `meta:` cap appears.
19. **Threat-model brainstorm** — three model-personas (attacker / defender / auditor) write attack chains; artifacts pane compares.
20. **Audit log replay** — `singularity replay <day>` walks the JSONL log; council judges which dispatches were unsafe in hindsight.

## Research & synthesis

21. **Multi-source literature scan** — three panes each take a journal feed; `?does paper X reproduce` runs across them.
22. **Compare-and-contrast essays** — `!compare quantum annealing vs adiabatic vs gate-model` for a structured side-by-side.
23. **Devil's advocate** — `@plan defend the opposite of this thesis` produces a structured rebuttal.
24. **Cited synthesis** — `/webfetch <url>` injects sources; agents cite from the injected blocks, not their priors.
25. **Glossary builder** — auto-extract `NOTE: <term> = <definition>` lines into a shared glossary that prepends to every dispatch.

## Data / analytics

26. **Three queries for one question** — `!give me a SQL query that…` produces three; race against a sandbox DB.
27. **Schema migration vote** — `?safe to add this column` polls three panes that each focus on a different aspect (perf, semantics, reversibility).
28. **Data validation pipeline** — daemon trigger on a new CSV upload; quorum classifies anomalies.
29. **Notebook explainer** — point at `notebook.ipynb`; one pane summarizes each cell, another spots bugs, third proposes refactors.
30. **Cost-aware queries** — `?cheap or expensive` votes before running an analytical query.

## Operations & automation

31. **Multi-platform announcement** — `/msg all <text>` posts the same release note to Slack + Discord + Telegram from one keystroke.
32. **Incident notification routing** — daemon trigger watches for FAULT; `/msg slack` to oncall + `/email` to manager + `/say` "incident detected" via voice.
33. **Calendar from text** — paste a meeting plan; `@plan` produces structured ICS events; `/calendar` writes them.
34. **Email triage** — IMAP trigger (Phase 2) sorts incoming; quorum classifies priority.
35. **Browser-open-on-build-fail** — daemon trigger watches `npm test`; on fail `/browse <CI URL>`.

## Documentation

36. **README from code** — `/world describe` + `@plan write a README from this surface` produces a draft.
37. **CHANGELOG generation from journal** — replay the shadow journal between two tags; each pane drafts a release note.
38. **Inline doc-string filler** — `/world callers <fn>` finds usage; agents write docs anchored to real call-sites.
39. **Tutorial recording** — `singularity showcase` produces a deterministic walkthrough cast for the README.
40. **Diagram generation** — `@plan describe this module as a mermaid diagram` → artifacts pane collects + `/share` exports.

## Decision support

41. **Steel-man vs straw-man** — same prompt, two personas; council compares.
42. **Risk-weighted vote** — `?ship now` weighted by `CONFIDENCE:`; UI shows raw + weighted.
43. **Counterfactual replay** — `/world diff` after `/rollback` shows what was *almost* shipped.
44. **Cost cap deliberation** — when `/budget 5.00` triggers, panes vote on whether to continue.
45. **Authoritative tie-break** — when quorum ties, designated tie-breaker pane (`/grant 1 meta:tiebreak`) decides.

## Education

46. **Three-tutor mode** — `!explain CAP theorem to me` from three personas (academic, ELI5, war-story).
47. **Socratic interrogation** — agent emits `CLARIFY:` until the user articulates the right question.
48. **Spaced-repetition flashcards** — `/share` exports recent `NOTE:` lines as Anki-importable Markdown.

## Creative

49. **Story-circle relay** — `>2` `>3` `>4` walks a story through panes; each adds one paragraph; `>>4 illustrate` dispatches the latest artifact.
50. **Ten-minute one-act** — `@plan write a 10-minute play about X` decomposes into scenes, distributes them across panes.

---

## Implementation strategy

Most use cases reuse the **existing operator + capability surface**; the only new infrastructure they need is **recipes** — a small declarative format (YAML) that bundles a use case as a runnable sequence of dispatches + capability grants. `singularity recipe <name>` runs them. This unlocks 35+ of the 50 with one new module.

The remaining ~15 need new built-in tools (IMAP, OAuth-bound sources, real schedulers). Those become Phase 2.
