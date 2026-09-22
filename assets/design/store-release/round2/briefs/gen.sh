#!/bin/bash
# gen.sh <run-id> : one codex gpt-6-sol image_gen run for store-release round 2 (ask 98). Run all in parallel from the repo root:
#   for R in Q1 Q2 M1 I1 I2 I3 F1; do assets/design/store-release/round2/briefs/gen.sh $R & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
R=$1; D=assets/design/store-release/round2; R1=assets/design/store-release/round1; LOGS=${LOGS:-/tmp/store-r2-logs}; mkdir -p "$LOGS"
case "$R" in
  Q*) REFS=(-i $R1/B-ride.png -i $R1/C-ride.png -i $R1/B-ride-snow.png);;
  M1) REFS=(-i $R1/C-menu.png -i $R1/A-menu.png -i $R1/A-brand.png);;
  I*) REFS=(-i $R1/A-brand.png);;
  F1) REFS=(-i $R1/A-brand.png -i $R1/W-worldmap.png -i $R1/A-menu.png);;
esac
cat $D/briefs/common.md $D/briefs/$R.md > "$LOGS/$R.prompt.md"
printf '\n## Output path\nSave the PNG to: %s\n' "$D/$R.png" >> "$LOGS/$R.prompt.md"
T0=$(date +%s)
codex exec -s workspace-write "${REFS[@]}" -o "$LOGS/$R.last.md" - < "$LOGS/$R.prompt.md" >> "$LOGS/$R.log" 2>&1
echo "$R exit=$? seconds=$(( $(date +%s)-T0 ))" | tee -a "$LOGS/summary.txt"
