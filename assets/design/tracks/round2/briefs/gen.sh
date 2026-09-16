#!/bin/bash
# gen.sh <A1|A2|A3|AD|AE> : one codex image_gen run from the shared brief + direction brief.
# Same recipe as round 1 (assets/design/tracks/SPEC.md): shared + direction brief on stdin,
# the current 932x430 capture as the -i reference; codex writes the PNG into
# assets/design/tracks/round2/ itself. Logs land in the scratch logs folder.
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
L=$1
BR=/Users/raynos/projects/game-demos/trials-gauntlet-demo/assets/design/tracks/round2/briefs
LOGS=/private/tmp/claude-501/-Users-raynos-projects-game-demos-trials-gauntlet-demo/1e182bc7-5cf2-4e60-9e21-0ab5b46f5a7d/scratchpad/tracks-r2/logs
mkdir -p "$LOGS"
T0=$(date +%s)
cat "$BR/shared.md" "$BR/$L.md" | codex exec -s workspace-write -i assets/design/tracks/current-932x430.png -o "$LOGS/$L.last.md" - >> "$LOGS/$L.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/$L.log"
echo "$L exit=$RC seconds=$((T1-T0))" >> "$LOGS/summary.txt"
