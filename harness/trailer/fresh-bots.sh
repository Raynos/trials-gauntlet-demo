#!/bin/bash
# Fresh skill-3 goldens for every course on the export's physics, N tracks at a time.
# Writes harness/inputs/<track>/bot-3.json in the export only (never the shared checkout).
#   harness/trailer/fresh-bots.sh [wall-seconds=300] [parallel=5] [tracks...]
cd "$(dirname "$0")/../.."
WALL=${1:-300}; PAR=${2:-5}; shift 2 2>/dev/null
TRACKS=${@:-b1-first-ride b2-lean-back b3-kicker-row e1-uphill-weight e2-rear-wheel-first e3-stairway m1-hop-up m2-drum-roll m3-see-saw h1-wheelie-wire h2-gap-chain h3-fire-line x1-vertical-limit x2-pipe-dream x3-gauntlet}
mkdir -p harness/out/trailer/botlogs
run() { npx tsx harness/bot/bot.ts "$1" --skill 3 --seeds 1 --no-verify --track-wall-s "$WALL" > "harness/out/trailer/botlogs/$1.log" 2>&1; grep -E "^bot .*skill=3" "harness/out/trailer/botlogs/$1.log"; }
i=0
for t in $TRACKS; do
  run "$t" &
  i=$((i+1))
  if [ $((i % PAR)) -eq 0 ]; then wait; fi
done
wait
echo ALLDONE
