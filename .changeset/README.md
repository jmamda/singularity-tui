# Changesets

Each PR that should ship in the next release adds a changeset:

```bash
npx changeset
```

Pick a bump level (patch / minor / major) and write a one-line summary. The bot opens a PR aggregating pending changesets; merging it publishes the release.

See https://github.com/changesets/changesets for the full guide.
