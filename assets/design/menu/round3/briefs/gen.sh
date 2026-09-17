#!/bin/bash
# gen.sh <B1|B2|B3> [LOGS] : one codex image_gen run from the shared brief + variant brief.
# Same recipe as menu round 2 (assets/design/menu/round2/briefs/gen.sh), with THREE -i references: round 2's chosen
# B "Lobby" (the architecture to keep), the current 932x430 menu capture (badge plate, stamp, font) and the live
# garage (the hero's likeness). Codex writes the PNG into assets/design/menu/round3/ itself (the output path is the
# last line of each brief).
# Run three in parallel from the repo root:  for L in B1 B2 B3; do assets/design/menu/round3/briefs/gen.sh $L & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
L=$1
R2=assets/design/menu/round2
BR=assets/design/menu/round3/briefs
LOGS=${2:-/tmp/menu-r3-logs}
mkdir -p "$LOGS"
T0=$(date +%s)
cat "$BR/shared.md" "$BR/$L.md" | codex exec -s workspace-write \
  -i "$R2/B-lobby.png" \
  -i "$R2/current-932x430.png" \
  -i "$R2/ref-garage-932x430.png" \
  -o "$LOGS/$L.last.md" - >> "$LOGS/$L.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$L.log"
echo "$L exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
