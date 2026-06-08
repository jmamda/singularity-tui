# Launch strategy

A pragmatic playbook for the first 30 days. None of this works in a session — it's day-by-day execution.

## Pre-launch checklist (≤ 1 hour)

- [ ] `git init && git remote add origin` to a real GitHub URL.
- [ ] Replace placeholder `singularity-cli/singularity-cli` in:
  - `brew/Formula/singularity-cli.rb`
  - `docs/site/index.html`
  - `packaging/scoop/singularity-cli.json`
  - `packaging/chocolatey/singularity-cli.nuspec`
  - `packaging/aur/PKGBUILD`
- [ ] Enable GitHub Discussions.
- [ ] Enable GitHub Pages from `docs/site/`.
- [ ] Open the 17 issues catalogued in `docs/good-first-issues.md`. Tag `good-first-issue` and `help-wanted`.
- [ ] `npm publish` (CI will do this on tag via `.github/workflows/release.yml`).
- [ ] Record `./scripts/record-demo.sh` → produces `docs/demo.cast` and (with `agg`) `docs/demo.gif`. Update README to point at it.

## Day 1 — soft launch

1. `npm publish` (or tag the release).
2. Post to **/r/sideproject** (lower stakes; tests the pitch).
3. Tweet thread (see `docs/launch/TWITTER.md`).
4. Add to the **awesome-cli-apps** and **awesome-ai-coding-tools** awesome lists via PR.
5. **Do not** post to HN yet — wait for feedback signal.

## Day 2-3 — iterate based on signal

- If `/r/sideproject` traction is healthy → post to **/r/programming** (much larger but less forgiving).
- Fix the top 3 issues filed in the first 24 hours.
- Reply to every comment / issue within 4 hours.

## Day 4-7 — main wave

1. **HN Show HN** (see `docs/launch/HN.md`). Submit Tuesday or Wednesday morning ET. Submit yourself, not someone else.
2. Post to **/r/programming**, **/r/commandline**, **/r/LocalLLaMA**.
3. DM 5 specific influencers who write about AI tooling (Pragmatic Engineer, Simon Willison, etc.) with a personalized note. Do NOT spam.
4. Add a `npm publish` of any patch fixes the HN crowd raises.
5. Stay online for ~6 hours after HN submission to respond.

## Day 8-30 — sustained engagement

- Cut a release every ~5 days (changesets makes this trivial; see `.changeset/`).
- Publish a "1 week in" blog post on dev.to / Medium (template at `docs/launch/BLOG.md`).
- Submit to **opencode.cafe** (or its analog) as an interop / sibling project.
- Reach out to the OpenCode + Aider + Crush maintainers individually with a heads-up. Position as adjacent, not competitive ("here's a thing that wraps you usefully").
- Open the brew tap PR.
- Open the AUR submission.
- File a Nix package PR.

## Honest expectations

- **Day 1**: ~100 stars on a good launch tweet.
- **Week 1**: 500-2K stars depending on HN.
- **Month 1**: 2-10K stars depending on whether HN picked it up.

OpenCode is at ~169K with two years of compounding network effects, the Anthropic-OAuth-crackdown tailwind, the SST brand, and Dax Raad's podcast tour. We will not catch them in a month. The question is whether we're on a trajectory.

Trajectory inputs (under our control):
- Ship every 5 days. Velocity is the #1 retention signal.
- Reply to every issue within 4 hours for the first 30 days.
- One genuinely cool feature per release that ships in the changelog.
- A short blog post per major release explaining the new primitive.

## What we are NOT optimizing for

- Stars in a vacuum.
- Twitter follower count.
- Beating OpenCode on numbers (we won't, in any reasonable timeframe).

What we ARE optimizing for: **the kind of users who run multiple AI agents and want a clean substrate for it.** That's a smaller market than "everyone who codes," but it's a real one — and it has no incumbent.

## Single best metric

Number of issues opened by people who clearly tried the tool > 5 minutes. That's the leading indicator for "we are growing." Stars are the lagging one.
