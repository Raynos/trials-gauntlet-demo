#!/bin/bash
# gen.sh <A3a|A3b|A3c|A3d|A3e> [LOGS] : one codex image_gen run from the shared brief + direction brief.
# Same recipe as rounds 1 and 2 (assets/design/tracks/SPEC.md), with TWO -i references: the current
# 932x430 capture and round 2's chosen A3 diorama, so the diorama language holds. Codex writes the
# PNG into assets/design/tracks/round3/ itself (the output path is the last line of each brief).
# Run five in parallel from the repo root:  for L in A3a A3b A3c A3d A3e; do briefs/gen.sh $L & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
L=$1
BR=assets/design/tracks/round3/briefs
LOGS=${2:-/tmp/tracks-r3-logs}
mkdir -p "$LOGS"
T0=$(date +%s)
cat "$BR/shared.md" "$BR/$L.md" | codex exec -s workspace-write \
  -i assets/design/tracks/current-932x430.png \
  -i assets/design/tracks/round2/A3-isometric-diorama.png \
  -o "$LOGS/$L.last.md" - >> "$LOGS/$L.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$L.log"
echo "$L exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
