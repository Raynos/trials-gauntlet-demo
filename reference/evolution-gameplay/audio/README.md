# Reference audio cuts (`reference/evolution-gameplay/audio/*.wav`)

Eight cuts of the real game's audio for the four `src/audio/tools/beats.ts` beats, cut from the raw downloads
(`../raw/<video_id>.mp4`) at the `../manifest.json` clip windows (`source_start_s` / `source_end_s` of clip `NN`).
The committed `../clips/*.mp4` are silent, which is why these exist. Harness round 11.

Command (identical for every row; input-side `-ss/-to`, so the WAV is exactly `to - ss` long):

    ffmpeg -y -ss <ss> -to <to> -i ../raw/<video_id>.mp4 -vn -ac 2 -ar 48000 -c:a pcm_s16le <name>.wav

Output: 48 kHz, stereo, pcm_s16le. Source audio is Opus 48 kHz (J7CjAdnb_O0) or AAC 44.1 kHz (the rest).

| name | beat | clip | raw file (video_id) | -ss | -to | s | source title / what |
|--|--|--|--|--:|--:|--:|--|
| start-01 | start-gate | 01 | J7CjAdnb_O0.mp4 | 18.3 | 24.0 | 5.7 | D license test: 3-2-1-GO countdown, first throttle burst off the pallet |
| start-08 | start-gate | 08 | TfehtMVzAl4.mp4 | 357.0 | 364.5 | 7.5 | HD Warehouse beginner (PC Gold): READY -> GO, pre-load wheelie off the line |
| wheelie-02 | wheelie | 02 | J7CjAdnb_O0.mp4 | 30.5 | 37.0 | 6.5 | D license test: dirt riding, camera cut, wheelie-assisted climb of a wooden ramp |
| wheelie-05 | wheelie | 05 | ytUW5r3RYw0.mp4 | 58.0 | 65.0 | 7.0 | A license test 'Obstacle Climbing': ~4 s rear-wheel balance up a container stack |
| landing-12 | landing-2m | 12 | 7o1Ofd01p3A.mp4 | 44.0 | 52.0 | 8.0 | Rock Steady (medium): big jump, drops through a wooden gate |
| landing-14 | landing-2m | 14 | 7o1Ofd01p3A.mp4 | 111.0 | 118.0 | 7.0 | Roller Coaster (medium): GO, 2.5 s downhill, ~3.2 s airtime, landing |
| crash-04 | crash-respawn | 04 | ytUW5r3RYw0.mp4 | 18.5 | 24.0 | 5.5 | A license test: two failed bunny-hops, CRASH!, ragdoll, checkpoint respawn ~1 s later |
| crash-13 | crash-respawn | 13 | 7o1Ofd01p3A.mp4 | 132.5 | 139.5 | 7.0 | Roller Coaster (medium): over-rotated landing, CRASH!, instant restart (barrel explosion) |

The reference cuts carry the games' music and UI under the engine; the manifest's clip windows are motion windows, not
audio onsets, so `harness/compare/audio.ts` aligns each cut at its own start (t = 0) and trims both sides of a pair to
`min(len A, len B)` capped at 8 s.
