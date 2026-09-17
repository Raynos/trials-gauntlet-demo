#!/bin/bash
# gen.sh <A|B|C|D|E> [LOGS] : one codex image_gen run from the shared brief + direction brief.
# Same recipe as the tracks round 3 (assets/design/tracks/round3/briefs/gen.sh), with THREE -i references: the
# current 932x430 menu capture, the live garage (BE3 dusk) and the live level select (the diorama), so the mockups
# match what is actually live. Codex writes the PNG into assets/design/menu/round2/ itself (the output path is the
# last line of each brief).
# Run five in parallel from the repo root:  for L in A B C D E; do assets/design/menu/round2/briefs/gen.sh $L & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
L=$1
R2=assets/design/menu/round2
BR=$R2/briefs
LOGS=${2:-/tmp/menu-r2-logs}
mkdir -p "$LOGS"
T0=$(date +%s)
cat "$BR/shared.md" "$BR/$L.md" | codex exec -s workspace-write \
  -i "$R2/current-932x430.png" \
  -i "$R2/ref-garage-932x430.png" \
  -i "$R2/ref-tracks-932x430.png" \
  -o "$LOGS/$L.last.md" - >> "$LOGS/$L.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$L.log"
echo "$L exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
