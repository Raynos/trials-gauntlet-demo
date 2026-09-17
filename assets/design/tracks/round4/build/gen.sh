#!/bin/bash
# gen.sh <name> : one codex image_gen run from build/briefs/shared.md + build/briefs/<name>.md.
# Same recipe as rounds 1–4 (round4/briefs/gen.sh): -i references are the shipped zoomed-out level select
# (build/ref-far-932x430.jpg), the C Ascent mockup (round4/C-ascent.jpg) and, for a seam, the shipped screen at that
# seam. Codex writes the PNG into build/out/<name>.png itself. Run all nine in parallel from the repo root:
#   for N in seam-quay seam-industrial-canyon seam-canyon-snow seam-snow-nightcity seam-nightcity-foundry massif sprite-chairlift sprite-cabin sprite-waterfall; do assets/design/tracks/round4/build/gen.sh $N & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
N=$1
B=assets/design/tracks/round4/build
LOGS=$B/logs
mkdir -p "$LOGS" "$B/out"
REF3=""
case "$N" in
  seam-industrial-canyon|seam-quay) REF3="-i $B/ref-seam-industrial-canyon.jpg" ;;
  seam-snow-nightcity|seam-canyon-snow|seam-nightcity-foundry) REF3="-i $B/ref-seam-snow-nightcity.jpg" ;;
esac
T0=$(date +%s)
cat "$B/briefs/shared.md" "$B/briefs/$N.md" | codex exec -s workspace-write \
  -i "$B/ref-far-932x430.jpg" \
  -i assets/design/tracks/round4/C-ascent.jpg $REF3 \
  -o "$LOGS/$N.last.md" - >> "$LOGS/$N.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$N.log"
echo "$N exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
