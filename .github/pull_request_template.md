<!--
Thanks for the PR. Quick checklist below — uncheck what doesn't apply.
-->

## What
<!-- One-line summary of the change. -->

## Why
<!-- Why this matters, link any related issue with `closes #N`. -->

## Composition with existing primitives
<!-- If this is a feature: dispatch grammar / capabilities / sentinel / shadow / trust / artifacts / notes. How does it compose? -->

## Checklist
- [ ] `npm run typecheck` clean
- [ ] `npm test` green (added tests for new logic where applicable)
- [ ] `npm run build` clean
- [ ] No new write/exec path bypasses `checkCapabilities` + `sentinelVerdict` + `shadowWrite`
- [ ] README / PATTERNS / CONTROL updated if user-visible
- [ ] CHANGELOG entry under `## Unreleased`
