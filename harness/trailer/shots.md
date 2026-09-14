# Trials Gauntlet — trailer shot list (as cut)

Output: `harness/out/trailer/trailer.mp4` 1280x720 @ 30 fps, 53.8 s, AAC 48 kHz, -14 LUFS (also `trailer-1080p.mp4`,
`trailer-15s.mp4`, `trailer-sheet.jpg`). Captured from the HEAD export at 58ab71a (art pack 17abb96 + tracks df7185f):
`grep -c REDLYNX dist/assets/*.js` = 0. Music 124 BPM (bar = 1.935 s); every cut lands on a bar or half-bar. The crash
gag's respawn hard cut IS drop 2 (bar 15). Recordings (`harness/out/trailer/recordings/`): fresh skill-3 goldens on
`src=a130cbcc` (one attempt each; x1 600 s wall, x3 600 s wall / 2 attempts) except m3 (bot walled at x=209 twice, 300 s
and 600 s — the see-saw beat uses the previous golden, which replays identically through the unchanged first 60 m) and
the two deliberate crashes from `make-crash.ts` (x1 at the first big jump, b2 at 5 s: full gas + lean back).

| #  | t (s)         | Bars | Beat                                                         | Track / biome                   | Source window (rec s) |
|----|---------------|------|--------------------------------------------------------------|---------------------------------|-----------------------|
| 0  | 0.00-0.97     | 0.5  | Black; engine idle + crowd under                             | —                               | —                     |
| 1  | 0.97-5.81     | 2.5  | COLD OPEN: rider idling at the gate, photo crowd, sponsor banners (APEX/BOLT/VORTEX/NORDVIK), 2-1-GO!, launch | b1 First Ride / industrial | countdown 0.9-3.0, ride 3.0-5.7 |
| 2  | 5.81-7.74     | 1    | TITLE: key art + wordmark slams in, "A PHYSICS TRIALS GAME"  | —                               | —                     |
| 3  | 7.74-10.65    | 1.5  | Flat-out canyon flow, 0.8 s table-top air                    | e2 Rear Wheel First / canyon    | 10.1-13.0             |
| 4  | 10.65-13.55   | 1.5  | Kicker, 0.93 s air, rear-wheel landing (imp 92), sunset mesas | e3 Stairway / canyon           | 25.0-27.9             |
| 5  | 13.55-18.39   | 2.5  | 3.7 m plank climb -> 8 m jump; SLOW-MO x0.35 at apex, 1.8x tracked punch-in | e1 Uphill Weight / canyon | 28.25-31.5 (60 fps) |
| 6  | 18.39-21.29   | 1.5  | See-saw to see-saw double rear-wheel slam (imp 104/115), fire pillars | m3 See-Saw / foundry   | 2.65-5.55             |
| 7  | 21.29-23.23   | 1    | Drum roll (3 drums), launch, snow + mountain plate           | m2 Drum Roll / snow             | 19.1-21.0             |
| 8  | 23.23-26.13   | 1.5  | CARD: 15 TRACKS · 5 BIOMES (break, riser building)           | —                               | —                     |
| 9  | 26.13-29.03   | 1.5  | THE JOKE: wall-ride launch, 1.5 s / 7 m air, lean-back loop-out lands on the back at 28.3, CRASH! banner, ragdoll 0.73 s, music cut | x1 Vertical Limit / snow (deliberate crash rec) | 2.83-5.73 |
| 10 | 29.03-30.97   | 1    | HARD CUT: respawned at the gate, pulls away + "EVERY CRASH IS A RESTART" over footage (drop 2) | x1 / snow | 6.5-8.45 |
| 11 | 30.97-33.87   | 1.5  | Fire line: 1.2 s air over burning barrels                    | h3 Fire Line / foundry          | 13.7-16.6             |
| 12 | 33.87-35.81   | 1    | Night-city gap, 1.0 s air, rear landing (imp 142)            | h1 Wheelie Wire / nightCity     | 21.0-22.9             |
| 13 | 35.81-37.74   | 1    | Pipe row: 5 drums over the lava channel (camera now bounded) | x2 Pipe Dream / foundry         | 25.4-27.3             |
| 14 | 37.74-39.68   | 1    | Steep plank slam -> 6 m launch, rear landing (imp 108)       | e1 Uphill Weight / canyon       | 4.4-6.3               |
| 15 | 39.68-40.65   | 0.5  | Stairway launch                                              | e3 Stairway / canyon            | 10.25-11.2            |
| 16 | 40.65-42.58   | 1    | Loop-out crash (full gas + lean back), ragdoll, auto-respawn — the second gag | b2 Lean Back / industrial | 5.6-7.55  |
| 17 | 42.58-43.55   | 0.5  | Hop-up front-wheel slam (imp 95)                             | m1 Hop Up / industrial          | 16.65-17.6            |
| 18 | 43.55-44.52   | 0.5  | Gap chain, night                                             | h2 Gap Chain / nightCity        | 33.4-34.35            |
| 19 | 44.52-46.45   | 1    | CARD: PLAYS IN YOUR BROWSER / DESKTOP · iPHONE · GAMEPAD     | —                               | —                     |
| 20 | 46.45-50.32   | 2    | FINISH LINE: fireworks, flash, TRACK FINISHED!, platinum results panel | h1 Wheelie Wire / nightCity | 37.6-41.5       |
| 21 | 50.32-53.82   | 3.5 s| END CARD: wordmark + trials-gauntlet-demo.vercel.app, 0.5 s fade | —                           | —                     |

15 s social cut (`--cut social`, music drops 0 & 5): title 0.5 b · kicker 1 b · plank slow-mo 2 b · crash 1.5 b ·
respawn + card 0.5 b · fire 1 b · end card 2.5 s = 15.1 s.

## Beats not used / could not get
- **b3 Kicker Row big air still does not frame** after the round-8 camera bounds: the camera now clamps under the roof
  (`clamped=true`, posZ 29) but the reframe never engages — `fovBoostDeg` stays 0 and pitch keeps increasing, so the bike
  leaves the top of frame (bikeScreenY -0.26) for ~0.9 s at the 1.0 s kicker (b3 t 13.6-14.6). Probe log:
  `harness/out/trailer/test/b3test/log.json` in the export. Render owner: the widen step in `rig.ts` ~L409 is not firing.
  x2's pipe row DOES frame now (dist stays 14-37) and is back in the cut.
- x3 Gauntlet is not in the cut (its fresh golden exists in `recordings/`; nothing in it beats the x1/x2 beats).
- No h1 **wheelie** section specifically (the h1 beats are its gap and its finish).
- Foundry beats are dark under SwiftShader; they get a per-clip gamma lift (1.15-1.3) in the edit rather than a regrade.

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
