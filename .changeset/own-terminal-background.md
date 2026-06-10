---
'singularity-tui': patch
---

The TUI now owns the terminal background while running (OSC 11): the themed background is applied on launch, re-applied on `/theme`, and restored on exit. Fixes the user's terminal profile color flashing through unpainted cells during repaints.
