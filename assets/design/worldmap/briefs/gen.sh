#!/bin/bash
# gen.sh <A|B|C> <region|world> [LOGS] : one codex image_gen run = shared brief + direction brief + viewport brief,
# with the output path appended as the last line. NO -i reference images on purpose (the current level select must
# not anchor the model on its tiles). Six runs in parallel from the repo root:
#   for L in A B C; do for V in region world; do assets/design/worldmap/briefs/gen.sh $L $V & done; done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
L=$1; V=$2
BR=assets/design/worldmap/briefs
LOGS=${3:-/tmp/worldmap-logs}
RETRY=${4:+-retry}   # pass "retry" to append briefs/retry.md (a stronger frame note) and log as <L>-<V>-retry
mkdir -p "$LOGS"
case $L in A) N=A-painted;; B) N=B-sheet;; C) N=C-nodes;; esac
OUT=assets/design/worldmap/$N-$V.png
T0=$(date +%s)
{ cat "$BR/shared.md" "$BR/$L.md" "$BR/$V.md"; [ -n "$RETRY" ] && cat "$BR/retry.md"; printf '\nOutput path (copy the generated PNG here, exactly): %s\n' "$OUT"; } \
  | codex exec -s workspace-write -o "$LOGS/$L-$V$RETRY.last.md" - >> "$LOGS/$L-$V$RETRY.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$L-$V$RETRY.log"
echo "$L-$V$RETRY exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
