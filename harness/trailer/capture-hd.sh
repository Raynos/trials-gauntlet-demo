#!/bin/bash
# HD pass: every beat at 1920x1080 / 30 fps (the edit punches in 1.0-1.45x as the game camera pulls
# back), plus the slow-mo beat at 60 fps, plus the matching game audio. Run detached:
#   nohup harness/trailer/capture-hd.sh > harness/out/trailer/capture-hd.log 2>&1 &
cd "$(dirname "$0")/../.."
# wait for a running 720p pass to finish (it owns the SwiftShader budget)
while ! grep -q CAPDONE harness/out/trailer/capture.log 2>/dev/null; do sleep 10; done
OUT=harness/out/trailer/beats-hd
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-hd.json --fps 30 --width 1920 --height 1080 --out $OUT ${ONLY:+--only $ONLY}
npx tsx harness/trailer/render-audio.ts harness/trailer/beats-hd.json --out $OUT
if [ ! -f $OUT/plank/log.json ]; then
  npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-slow.json --fps 60 --width 1920 --height 1080 --out $OUT
  npx tsx harness/trailer/render-audio.ts harness/trailer/beats-slow.json --out $OUT
fi
echo HDDONE
