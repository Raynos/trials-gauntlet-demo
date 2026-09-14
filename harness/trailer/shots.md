# Trials Gauntlet — trailer shot list (as cut)

Output: `harness/out/trailer/trailer.mp4` 1280x720 @ 30 fps, 53.8 s, AAC 48 kHz, -14 LUFS (also `trailer-1080p.mp4`,
`trailer-15s.mp4`, `trailer-sheet.jpg`). Music 124 BPM (bar = 1.935 s); every cut lands on a bar or half-bar. The crash
gag's respawn hard cut IS drop 2 (bar 15). Recordings: the export's fresh skill-3 goldens (`src=73efbbf6`, one attempt
each) copied to `harness/out/trailer/recordings/`; x1 is the stale golden (still deterministic on today's physics —
delivers the 9 m jump straight into a crash); b2 is a deliberate loop-out from `make-crash.ts` (full gas + lean back).

| #  | t (s)         | Bars | Beat                                                         | Track / biome                   | Source window (rec s) |
|----|---------------|------|--------------------------------------------------------------|---------------------------------|-----------------------|
| 0  | 0.00-0.97     | 0.5  | Black; engine idle + crowd under                             | —                               | —                     |
| 1  | 0.97-5.81     | 2.5  | COLD OPEN: rider idling at the gate, crowd, 2-1-GO!, launch  | b1 First Ride / industrial      | countdown 0.9-3.0, ride 3.0-5.7 |
| 2  | 5.81-7.74     | 1    | TITLE: key art + wordmark slams in, "A PHYSICS TRIALS GAME"  | —                               | —                     |
| 3  | 7.74-10.65    | 1.5  | Flat-out canyon flow; camera cranes up over the table-top    | e2 Rear Wheel First / canyon    | 8.6-11.5              |
| 4  | 10.65-13.55   | 1.5  | Kicker, 0.74 s air, rear-wheel landing (imp 77) into the CP crowd | e2 / canyon                | 21.7-24.6             |
| 5  | 13.55-18.39   | 2.5  | 3.7 m plank climb -> 8 m jump; SLOW-MO x0.35 at apex with a 1.8x tracked punch-in | e1 Uphill Weight / canyon | 28.25-31.5 (60 fps 1080p) |
| 6  | 18.39-21.29   | 1.5  | See-saw to see-saw double rear-wheel slam (imp 104, 115), fire pillars | m3 See-Saw / foundry  | 2.65-5.55             |
| 7  | 21.29-23.23   | 1    | Drum roll, log-pile hop, launch                              | m2 Drum Roll / snow             | 24.5-26.4             |
| 8  | 23.23-26.13   | 1.5  | CARD: 15 TRACKS · 5 BIOMES (break, riser building)           | —                               | —                     |
| 9  | 26.13-29.03   | 1.5  | THE JOKE: wall-ride launch, 2 s / 9 m air, dead-straight crash at 28.3, CRASH! banner, ragdoll held 0.73 s, music cut | x1 Vertical Limit / snow | 3.4-6.3 |
| 10 | 29.03-30.97   | 1    | HARD CUT: respawned at the gate, wheelies off + "EVERY CRASH IS A RESTART" over footage (drop 2) | x1 / snow | 6.6-8.5 |
| 11 | 30.97-33.87   | 1.5  | Fire line: 1.3 s air over burning barrels, rear landing (imp 88) | h3 Fire Line / foundry      | 12.9-15.8             |
| 12 | 33.87-36.77   | 1.5  | Night-city neon gap, rear landing (imp 77)                   | h1 Wheelie Wire / nightCity     | 22.4-25.3             |
| 13 | 36.77-39.68   | 1.5  | Steep plank slam (front imp 68) -> 6 m launch, rear landing (imp 108) | e1 Uphill Weight / canyon | 3.95-6.85           |
| 14 | 39.68-40.65   | 0.5  | Stairway launch                                              | e3 Stairway / canyon            | 3.6-4.6               |
| 15 | 40.65-42.58   | 1    | Loop-out crash (full gas + lean back), auto-respawn — the second gag | b2 Lean Back / industrial | 6.95-8.9            |
| 16 | 42.58-43.55   | 0.5  | Hop-up rear-wheel slam (imp 86)                              | m1 Hop Up / industrial          | 12.35-13.3            |
| 17 | 43.55-44.52   | 0.5  | Gap chain, night                                             | h2 Gap Chain / nightCity        | 22.95-23.9            |
| 18 | 44.52-46.45   | 1    | CARD: PLAYS IN YOUR BROWSER / DESKTOP · iPHONE · GAMEPAD     | —                               | —                     |
| 19 | 46.45-50.32   | 2    | FINISH LINE: flash, TRACK FINISHED!, platinum results panel, orbit | h1 Wheelie Wire / nightCity | 33.7-37.6         |
| 20 | 50.32-53.82   | 3.5 s| END CARD: wordmark + trials-gauntlet-demo.vercel.app, 0.5 s fade | —                           | —                     |

15 s social cut (`--cut social`, music drops 0 & 5): title 0.5 b · kicker 1 b · plank slow-mo 2 b · crash 1.5 b ·
respawn + card 0.5 b · fire 1 b · end card 2.5 s = 15.1 s.

## Beats not used / could not get
- **Industrial big air is unfilmable**: the game's "fast" camera state (dist > ~30 m, pitch ~48 deg) rises through the
  hall roof on b3 Kicker Row's 1.0 s kicker (t 22.9-23.9) and shows only skylights; the b3 rear-wheel-landing beat was
  swapped for e2 (canyon). Same for x2 Pipe Dream's pipe row (bike on a 1.8 m box row -> camera above the foundry roof
  for the whole beat, even at dist 15). m1 Hop Up is only used at 0.5 bar for the same reason.
- No h1 **wheelie** section specifically (the wire surface is not in the placed-obstacle list; the h1 beat is a gap).
- **x3 Gauntlet** and **x1** fresh bots timed out (300 s wall on a loaded box); x1's stale golden was used deliberately.
- Foundry beats are dark under SwiftShader; they get a per-clip gamma lift (1.25-1.3) in the edit rather than a regrade.
- No fireworks visible at the finish; the finish beat uses the flash + banner + platinum results panel instead.

## Re-render
From a `git archive HEAD` export with `pnpm install` + `pnpm build` (dist must exist for the preview server):
```
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-hd.json  --fps 30 --width 1920 --height 1080 --out harness/out/trailer/beats-hd
npx tsx harness/trailer/capture-beats.ts harness/trailer/beats-slow.json --fps 60 --width 1920 --height 1080 --out harness/out/trailer/beats-hd
npx tsx harness/trailer/render-audio.ts  harness/trailer/beats-hd.json   --out harness/out/trailer/beats-hd
npx tsx harness/trailer/render-audio.ts  harness/trailer/beats-slow.json --out harness/out/trailer/beats-hd
python3 harness/trailer/music.py harness/out/trailer/music.wav    --seconds 54 --drops 4,15 --breaks 12,23 --end 26
python3 harness/trailer/music.py harness/out/trailer/music-15.wav --seconds 16 --drops 0,5  --breaks 3.5   --end 6.5
python3 harness/trailer/edit.py --beats harness/out/trailer/beats-hd --music harness/out/trailer/music.wav --out harness/out/trailer/trailer.mp4 --sheet harness/out/trailer/trailer-sheet.jpg
python3 harness/trailer/edit.py --beats harness/out/trailer/beats-hd --music harness/out/trailer/music.wav --out harness/out/trailer/trailer-1080p.mp4 --height 1080
python3 harness/trailer/edit.py --cut social --beats harness/out/trailer/beats-hd --music harness/out/trailer/music-15.wav --out harness/out/trailer/trailer-15s.mp4
```
python3 needs pillow + numpy (`python3 -m venv venv && venv/bin/pip install pillow numpy`). Capture cost on SwiftShader:
~1 s per 1080p frame (~25 min for the 1360 frames), audio seconds, edit ~80 s. Fresh goldens: `harness/trailer/fresh-bots.sh 300 5`
(writes the export's `harness/inputs/<track>/bot-3.json`; copy to `harness/out/trailer/recordings/<track>.json`).
`harness/trailer/survey.ts` / `features.ts` print each recording's airtime, landings, faults and obstacle positions for picking beats.
