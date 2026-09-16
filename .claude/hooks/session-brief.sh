#!/usr/bin/env bash
# session-brief.sh — cold-pickup orientation, printed into context at SessionStart
# (.claude/settings.json). Pure read, fast, never fails the session. Surfaces, in order:
# the human queue → the open asks → live plans → the markdown budget → recent commits.
# Relay the human queue and open asks to the user FIRST, with zero extra tool calls.
# Run by hand: bash .claude/hooks/session-brief.sh
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 0

echo "== session brief (.claude/hooks/session-brief.sh) =="
[ "$(git config core.hooksPath 2>/dev/null)" = ".githooks" ] || echo "!! commit-msg guard OFF in this clone — run: git config core.hooksPath .githooks"
echo ""
echo "-- waiting on the human (project/human-in-the-loop/QUEUE.md) --"
if [ -f project/human-in-the-loop/QUEUE.md ]; then
  items="$(grep -E '^- \*\*H[DR]-[0-9]+' project/human-in-the-loop/QUEUE.md || true)"
  if [ -n "$items" ]; then printf '%s\n' "$items"; else echo "(empty — nothing waiting on the human)"; fi
else echo "(missing)"; fi

echo ""
echo "-- open asks (docs/tasks/ASKS.md: every row not done/dropped) --"
if [ -f docs/tasks/ASKS.md ]; then
  open="$(grep -E '^\| [0-9]+ \|' docs/tasks/ASKS.md | grep -vE '\| \*\*(done|dropped)\*\* \|' | cut -d'|' -f2-4 || true)"
  if [ -n "$open" ]; then printf '%s\n' "$open"; else echo "(none open)"; fi
else echo "(missing)"; fi

echo ""
echo "-- live plans (docs/plans/README.md is the tracker) --"
ls docs/plans/*.md 2>/dev/null | grep -v README || echo "(none)"

echo ""
echo "-- markdown budget --"
bash .claude/hooks/md-ratio.sh tree 2>/dev/null || echo "(md-ratio.sh missing)"

echo ""
echo "-- recent commits --"
git log --oneline -8 2>/dev/null || true

echo ""
echo "Next: relay the human queue + open asks if non-empty; add any new ask to docs/tasks/ASKS.md"
echo "before starting it; then pick up the in-flight ask or the active plan. AGENTS.md is canon."
exit 0
