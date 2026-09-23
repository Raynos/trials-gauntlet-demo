#!/bin/bash
# gen.sh <brief> <out-name> : one codex image_gen run for the World owner (store release Phase 2).
#   brief = map | plate-<zone> | sky-<zone>; out-name = file stem under assets/design/store-release/world/gen/
# Run variants in parallel from anywhere:  for V in a b c; do gen.sh map map-$V & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
B=$1; N=$2; W=assets/design/store-release/world; R1=assets/design/store-release/round1; R2=assets/design/store-release/round2
LOGS=${LOGS:-/tmp/world-gen-logs}; mkdir -p "$LOGS" "$W/gen"
case "$B" in
  map) REFS=(-i $R1/W-worldmap.png);;
  map2) REFS=(-i /tmp/wst/wmap-ref.png);;
  *-coast) REFS=(-i $R1/C-ride.png);;
  *-alpine) REFS=(-i $R1/B-ride.png);;
  *-quarry) REFS=(-i $R2/Q2.png -i $R2/Q1.png);;
  *-snowline) REFS=(-i $R1/B-ride-snow.png);;
esac
P="$LOGS/$N.prompt.md"
cp "$W/briefs/$B.md" "$P"
printf '\n## Output path\nSave the PNG to: %s\n' "$W/gen/$N.png" >> "$P"
T0=$(date +%s)
codex exec -s workspace-write "${REFS[@]}" -o "$LOGS/$N.last.md" - < "$P" >> "$LOGS/$N.log" 2>&1
echo "$N exit=$? seconds=$(( $(date +%s)-T0 ))" | tee -a "$LOGS/summary.txt"
