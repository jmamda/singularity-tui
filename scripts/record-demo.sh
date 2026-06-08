#!/usr/bin/env bash
# Records the README demo cast. Run from repo root.
# Prereq: brew install asciinema agg  (agg for GIF export, optional)
set -euo pipefail

OUT="${1:-docs/demo.cast}"
mkdir -p "$(dirname "$OUT")"

# Use a clean test profile so the cast is deterministic.
PROFILE_DIR="$HOME/.singularity/profiles"
mkdir -p "$PROFILE_DIR"
cp examples/profiles/quorum.json "$PROFILE_DIR/demo.json"

echo "─── recording — type a short demo, Ctrl+C in Singularity, then Ctrl+D here ───"
asciinema rec -c "node dist/cli.js --profile demo --no-wizard" "$OUT"

if command -v agg >/dev/null 2>&1; then
  agg --theme monokai --rows 30 --cols 100 "$OUT" "${OUT%.cast}.gif"
  echo "→ wrote ${OUT%.cast}.gif"
fi

echo "→ wrote $OUT"
echo "Drop the cast/GIF in README via:"
echo "  [![asciicast](https://asciinema.org/a/<id>.svg)](https://asciinema.org/a/<id>)"
