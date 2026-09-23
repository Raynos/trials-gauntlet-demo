#!/bin/bash
# gen.sh <run-id> : one codex image_gen run for the ROCKHOP brand kit (Brand/UI owner). Outputs to assets/brand/gen/<id>.png.
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
R=$1; B=assets/brand/briefs; O=assets/brand/gen; R1=assets/design/store-release/round1; R2=assets/design/store-release/round2
LOGS=${LOGS:-/tmp/brand-gen-logs}; mkdir -p "$LOGS" "$O"
case "$R" in
  K-harbour) REFS=(-i $R2/M1.png -i $R1/C-menu.png); BODY=$B/K-harbour.md;;
  K-quarry) REFS=(-i $R1/A-menu.png -i $R2/M1.png); BODY=$B/K-quarry.md;;
  R-coast) REFS=(-i $R1/A-results.png -i $R1/C-ride.png); BODY="$B/R-common.md $B/R-coast.md";;
  R-alpine) REFS=(-i $R1/A-results.png -i $R1/B-ride.png); BODY="$B/R-common.md $B/R-alpine.md";;
  R-quarry) REFS=(-i $R1/A-results.png -i $R2/Q2.png); BODY="$B/R-common.md $B/R-quarry.md";;
  R-snowline) REFS=(-i $R1/A-results.png -i $R1/B-ride-snow.png); BODY="$B/R-common.md $B/R-snowline.md";;
  MED) REFS=(-i $R1/A-brand.png -i $R1/A-results.png); BODY=$B/MED.md;;
  OG) REFS=(-i $R2/F1.png); BODY=$B/OG.md;;
  IBG|IFG) REFS=(-i $R2/I1.png); BODY=$B/$R.md;;
esac
cat $B/common.md $BODY > "$LOGS/$R.prompt.md"
printf '\n## Output path\nSave the PNG to: %s\n' "$O/$R.png" >> "$LOGS/$R.prompt.md"
T0=$(date +%s)
codex exec -s workspace-write "${REFS[@]}" -o "$LOGS/$R.last.md" - < "$LOGS/$R.prompt.md" >> "$LOGS/$R.log" 2>&1
echo "$R exit=$? seconds=$(( $(date +%s)-T0 ))" | tee -a "$LOGS/summary.txt"
