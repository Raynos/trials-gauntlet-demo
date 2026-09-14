#!/bin/bash
cd "$(dirname "$0")/../.."
OUT=harness/out/trailer/beats-hd
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-hd.json --fps 30 --width 1920 --height 1080 --out $OUT --only cold,flow,kicker,drums,fire,night,pipes,climb,stairs,loopout,hop,chain,finish
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-slow.json --fps 60 --width 1920 --height 1080 --out $OUT
npx tsx harness/trailer/render-audio.ts harness/trailer/beats-hd.json --out $OUT --only cold,flow,kicker,drums,fire,night,pipes,climb,stairs,loopout,hop,chain,finish
npx tsx harness/trailer/render-audio.ts harness/trailer/beats-slow.json --out $OUT
echo HDDONE
