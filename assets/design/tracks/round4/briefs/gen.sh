#!/bin/bash
# gen.sh <A|B|C> [LOGS] : one codex image_gen run from the shared brief + direction brief.
# Same recipe as rounds 1–3 (assets/design/tracks/SPEC.md, round3/briefs/gen.sh), with TWO -i references: the
# CURRENT SHIPPED diorama captured headless at 932x430 (assets/design/tracks/round4/current-932x430.png) and the
# round-3 chosen variant it was built from (round3/A3b-one-tile.png), so the slab / pin / fence / island language
# holds while the architecture changes. Codex writes the PNG into assets/design/tracks/round4/ itself (the output
# path is the last line of each brief). Run the three in parallel from the repo root:
#   for L in A B C; do assets/design/tracks/round4/briefs/gen.sh $L & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
L=$1
BR=assets/design/tracks/round4/briefs
LOGS=${2:-/tmp/tracks-r4-logs}
mkdir -p "$LOGS"
T0=$(date +%s)
cat "$BR/shared.md" "$BR/$L.md" | codex exec -s workspace-write \
  -i assets/design/tracks/round4/current-932x430.png \
  -i assets/design/tracks/round3/A3b-one-tile.png \
  -o "$LOGS/$L.last.md" - >> "$LOGS/$L.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$L.log"
echo "$L exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
