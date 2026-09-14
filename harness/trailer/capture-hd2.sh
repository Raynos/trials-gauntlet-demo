#!/bin/bash
cd "$(dirname "$0")/../.."
while ! grep -q HDDONE harness/out/trailer/capture-hd.log; do sleep 10; done
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-hd.json --fps 30 --width 1920 --height 1080 --out harness/out/trailer/beats-hd --only crash,seesaw
npx tsx harness/trailer/render-audio.ts harness/trailer/beats-hd.json --out harness/out/trailer/beats-hd --only crash,seesaw
echo HD2DONE
