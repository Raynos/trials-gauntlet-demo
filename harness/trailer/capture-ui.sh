#!/bin/bash
# The 15 s cut (ask 63), end to end, from whatever is in dist/.
#   harness/trailer/capture-ui.sh <sha7> [export-root=.]
#
# Six riding beats come from `capture-beats.ts` (goldens, plus the authored backflip); the two
# screen beats come from `capture-ui.ts`, which drives the live front end on a paused fake clock.
# `edit.py --cut ui` assembles both against the 15 s music bed. See shots-ui.md for the cut list.
#
# The backflip recording is committed. To re-hunt it (after a physics change, say):
#   npx tsx harness/trailer/make-flip.ts x1-vertical-limit \
#     --golden harness/inputs/x1-vertical-limit/bot-3.json --takeoff 43.0 \
#     --out harness/inputs/x1-vertical-limit/trailer-flip.json
#   npx tsx harness/trailer/finish-tick.ts harness/inputs/x1-vertical-limit/trailer-flip.json
# `survey.ts` lists every golden's airs (with net rotation) and wheelies — that is how beats are picked.
set -e
SHA=${1:?sha7}
EXPORT=${2:-.}
PY=${PY:-python3}
cd "$EXPORT"
OUT=harness/out/trailer
BEATS=$OUT/beats-ui

# Only the two shots the cut uses; shots-ui.json also scripts menu/mapcard/phone (drop --only for all).
npx tsx harness/trailer/capture-ui.ts harness/trailer/shots-ui.json --only map,garage \
  --fps 30 --width 1280 --height 720 --out "$BEATS"
# Frames before audio: capture-beats clears each beat directory, which would take the audio with it.
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-ui.json --fps 30 --width 1280 --height 720 --out "$BEATS"
npx tsx harness/trailer/render-audio.ts harness/trailer/beats-ui.json --out "$BEATS"
harness/trailer/brand-gate.sh .

# The title card takes the key art the live menu is actually showing (nalati, already hero-right).
$PY harness/trailer/edit.py --cut ui --beats "$BEATS" --music $OUT/music-15.wav \
  --keyart public/art/menu/keyart-nalati-1920.webp --keyart-noflip \
  --sha "$SHA" --out $OUT/trailer-ui-15s.mp4 --sheet $OUT/trailer-ui-15s-sheet.jpg
$PY harness/trailer/edit.py --cut ui --beats "$BEATS" --music $OUT/music-15.wav \
  --keyart public/art/menu/keyart-nalati-1920.webp --keyart-noflip \
  --sha "$SHA" --out $OUT/trailer-ui-15s-1080p.mp4 --height 1080
# A 20 MB master does not survive an upload; keep a ~4 MB web encode beside it.
/opt/homebrew/bin/ffmpeg -y -loglevel error -i $OUT/trailer-ui-15s.mp4 -c:v libx264 -preset slow -crf 26 \
  -maxrate 2200k -bufsize 4400k -c:a aac -b:a 128k -movflags +faststart $OUT/trailer-ui-15s-web.mp4
ls -la $OUT/trailer-ui-15s*
