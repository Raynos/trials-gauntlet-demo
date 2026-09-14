#!/bin/bash
cd "$(dirname "$0")/../.."
while pgrep -f "bot.ts m3-see-saw" >/dev/null; do sleep 10; done
./harness/trailer/fresh-bots.sh 600 1 x1-vertical-limit
./harness/trailer/fresh-bots.sh 600 1 x3-gauntlet
echo XDONE
