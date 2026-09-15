#!/bin/bash
# v0.2.0 trailer: capture + audio + edit from a clean HEAD export (see shots-v0.2.0.md).
#   harness/trailer/capture-v2.sh <export-root> <sha7> [timelapse.mp4]
# Captures at 1280x720 / 30 fps / quality high (SwiftShader on the shared host: ~2 s per 720p frame, ~4 s per 1080p),
# renders the beats' game audio offline, edits the 720p master, the 1080p (lanczos upscale), the web and the 15 s cuts.
set -e
EXPORT=${1:?export root}; SHA=${2:?sha7}; TL=${3:-harness/out/timelapse/progress-wave4.mp4}
PY=${PY:-python3}
cd "$EXPORT"
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-v2.json --fps 30 --width 1280 --height 720 --out harness/out/trailer/beats-v2
npx tsx harness/trailer/render-audio.ts harness/trailer/beats-v2.json --out harness/out/trailer/beats-v2
npx tsx harness/trailer/menu-plate.ts --out harness/out/trailer/beats-v2/menu
harness/trailer/brand-gate.sh .
OUT=harness/out/trailer
$PY harness/trailer/edit.py --cut v2 --beats $OUT/beats-v2 --music $OUT/music.wav --version 0.2.0 --sha "$SHA" --timelapse "$TL" --out $OUT/trailer-v0.2.0-720p.mp4 --sheet $OUT/trailer-v0.2.0-sheet.jpg
$PY harness/trailer/edit.py --cut v2 --beats $OUT/beats-v2 --music $OUT/music.wav --version 0.2.0 --sha "$SHA" --timelapse "$TL" --out $OUT/trailer-v0.2.0.mp4 --height 1080
$PY harness/trailer/edit.py --cut v2-social --beats $OUT/beats-v2 --music $OUT/music-15.wav --version 0.2.0 --sha "$SHA" --out $OUT/trailer-v0.2.0-15s.mp4
/opt/homebrew/bin/ffmpeg -y -loglevel error -i $OUT/trailer-v0.2.0-720p.mp4 -c:v libx264 -preset slow -crf 23 -maxrate 3400k -bufsize 6800k -c:a aac -b:a 128k -movflags +faststart $OUT/trailer-v0.2.0-web.mp4
ls -la $OUT/trailer-v0.2.0*
