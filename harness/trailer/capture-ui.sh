#!/bin/bash
# The 15 s UI trailer (ask 63), end to end, from whatever is in dist/.
#   harness/trailer/capture-ui.sh <sha7> [export-root=.]
#
# Five screen shots come from `capture-ui.ts` (the live front end on a paused fake clock);
# the finish/results beat comes from `capture-beats.ts` off the committed b1 golden, so the
# cut carries one piece of real game audio. `edit.py --cut ui` assembles both against the
# 15 s music bed. See shots-ui.md for the cut list and what each beat is showing.
set -e
SHA=${1:?sha7}
EXPORT=${2:-.}
PY=${PY:-python3}
cd "$EXPORT"
OUT=harness/out/trailer
BEATS=$OUT/beats-ui

npx tsx harness/trailer/capture-ui.ts harness/trailer/shots-ui.json --fps 30 --width 1280 --height 720 --out "$BEATS"
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
ls -la $OUT/trailer-ui-15s*
# A 12 MB master does not survive an upload; keep a ~3.5 MB web encode beside it.
/opt/homebrew/bin/ffmpeg -y -loglevel error -i $OUT/trailer-ui-15s.mp4 -c:v libx264 -preset slow -crf 26 \
  -maxrate 2200k -bufsize 4400k -c:a aac -b:a 128k -movflags +faststart $OUT/trailer-ui-15s-web.mp4
ls -la $OUT/trailer-ui-15s*
