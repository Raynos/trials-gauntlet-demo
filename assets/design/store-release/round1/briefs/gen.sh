#!/bin/bash
# gen.sh <run-id> : one codex (gpt-6-sol, image_gen) run for store-release round 1.
# run-id = <dir>-<screen>[-<variant>], e.g. A-menu, B-ride-snow, W-worldmap. Composes shared.md + dir-<X>.md +
# screen-<s>.md (+ substitutions) + the output path, attaches the matching current-build references, and lets Codex
# save the PNG into assets/design/store-release/round1/. Run all from the repo root in parallel:
#   for R in $(cat assets/design/store-release/round1/briefs/runs.txt); do assets/design/store-release/round1/briefs/gen.sh $R & done; wait
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
R=$1
D=assets/design/store-release/round1
BR=$D/briefs
LOGS=${LOGS:-/tmp/store-r1-logs}
mkdir -p "$LOGS"
DIR=${R%%-*}; REST=${R#*-}; SCREEN=${REST%%-*}
case "$R" in
  A-ride)       ZONE="DESERT QUARRY";;
  B-ride)       ZONE="ALPINE FOREST TRAIL";;
  B-ride-snow)  ZONE="SNOWLINE";;
  C-ride)       ZONE="COASTAL SCRAPYARD";;
  A-results)    ZONE="DESERT QUARRY"; TRACK="ROPE WALK"; CODE="D3";;
  B-results)    ZONE="ALPINE FOREST TRAIL"; TRACK="LOG JAM"; CODE="A2";;
  C-results)    ZONE="COASTAL SCRAPYARD"; TRACK="CRANE HOP"; CODE="C2";;
esac
case "$SCREEN" in
  brand)    REFS=(-i $D/current-menu.jpg -i $D/current-ride.jpg);;
  menu)     REFS=(-i $D/current-menu.jpg);;
  ride)     REFS=(-i $D/current-ride.jpg);;
  results)  REFS=(-i $D/current-results-mockup.png -i $D/current-ride.jpg);;
  worldmap) REFS=(-i $D/current-worldmap.jpg);;
esac
DIRFILE=$BR/dir-$DIR.md; [ -f "$DIRFILE" ] || DIRFILE=/dev/null
T0=$(date +%s)
{ cat $BR/shared.md "$DIRFILE" $BR/screen-$SCREEN.md | sed -e "s/{ZONE}/$ZONE/g" -e "s/{TRACK}/$TRACK/g" -e "s/{CODE}/$CODE/g";
  printf '\n## Output path\nSave the PNG to: %s\n' "$D/$R.png"; } > "$LOGS/$R.prompt.md"
codex exec -s workspace-write "${REFS[@]}" -o "$LOGS/$R.last.md" - < "$LOGS/$R.prompt.md" >> "$LOGS/$R.log" 2>&1
RC=$?
echo "$R exit=$RC seconds=$(( $(date +%s)-T0 ))" | tee -a "$LOGS/summary.txt"
