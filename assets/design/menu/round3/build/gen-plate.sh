#!/bin/bash
# gen-plate.sh [LOGDIR] : one codex image_gen run for the Nalati strip plate (ask 42, B2 "Strip" build).
# References: the chosen B2 mockup (the scene to match, its UI to ignore) and the live garage capture (the hero's likeness).
# Codex writes assets/design/menu/round3/build/nalati-plate.png itself (the output path is the last line of the brief).
cd /Users/raynos/projects/game-demos/trials-gauntlet-demo || exit 1
R3=assets/design/menu/round3
LOGS=${1:-$R3/build/logs}
mkdir -p "$LOGS"
T0=$(date +%s)
codex exec -s workspace-write \
  -i "$R3/B2-strip.png" \
  -i "assets/design/menu/round2/ref-garage-932x430.png" \
  -o "$LOGS/plate.last.md" - < "$R3/build/plate-brief.md" >> "$LOGS/plate.log" 2>&1
RC=$?
T1=$(date +%s)
echo "exit=$RC seconds=$((T1-T0))" >> "$LOGS/plate.log"
