# Reference notes — crash-restart-ui (Trials Evolution + Trials Rising)

Corpus: `reference/crash-restart-ui/` — `clips/` (15 × 720p h264, 4.5–8 s, all < 2.4 MB), `sheets/`
(`NN-slug.jpg` = fps=2 tile 4x2 first 4 s; `NN-slug-full.jpg` = 16 frames spanning the whole clip),
`manifest.json` (source URL, offset, duration, description per clip). `raw/` holds the six downloaded
source videos (gitignored, ~1 GB).

All timings below were measured frame-by-frame from the 30 fps sources (ffmpeg frame diffs + HUD timer
read-outs), not eyeballed. Pixel numbers are for a 1280×720 frame.

## Manifest

| Clip | Game | Source (YouTube id @ offset) | Shows |
|---|---|---|---|
| 01-evo-explosion-fault-fade | Evolution | nBEtTzin98A @ 11:00.0 | Fire-pit fault → instant black → dark hold → DoF unblur at checkpoint, counter 2→3 |
| 02-evo-tumble-fault-hardcut | Evolution | nBEtTzin98A @ 11:18.6 | Two ragdoll faults in 5.4 s; white impact flash → hard cut to green checkpoint, 4→5→6 |
| 03-evo-rapid-refaults | Evolution | nBEtTzin98A @ 11:24.0 | Three faults in 7 s on one obstacle (5→6→7), attempt-fail-respawn rhythm |
| 04-evo-countdown-go | Evolution | 7_86rRhggM0 @ 05:13.0 | Loading → track fade-in → elastic 3-2-1 → GO, camera swing |
| 05-evo-finish-flash-results | Evolution | 7_86rRhggM0 @ 05:03.3 | Finish light-burst, timer freeze, FINISH! ribbon, tournament map |
| 06-evo-pb-race-results | Evolution | h-n-kD5pDF0 @ 01:14.5 | New Personal Record ribbon, prompts, RACE RESULTS screen, medal burst, cash tick |
| 07-evo-menu-select-race | Evolution | h-n-kD5pDF0 @ 00:00.0 | SELECT EVENT map + SELECT RACE list with leaderboard/next-medal panel |
| 08-ris-crash-banner-restart | Rising | hEgg5H5Y0iU @ 10:23.5 | Over-the-bars crash, CRASH! stamp, hold-restart hard cut to start, GO! on throttle |
| 09-ris-countdown-track-start | Rising | hEgg5H5Y0iU @ 13:31.0 | Intro dolly → 3-2-1-GO!, contract tag, camera zoom-out with speed |
| 10-ris-track-finished-crowd | Rising | hEgg5H5Y0iU @ 14:35.5 | Finish line → crowd cam, TRACK FINISHED! tag, delta, reward panel, 2ND PLACE swap |
| 11-ris-medal-earned | Rising | hEgg5H5Y0iU @ 14:44.3 | MEDAL EARNED / GOLD card, XP ring fill, level badge |
| 12-ris-finish-ragdoll-tyres | Rising | hEgg5H5Y0iU @ 19:44.5 | Finish, then bike ploughs into tyres; physics + camera keep running under the result HUD |
| 13-ris-bailout-castle-ragdoll | Rising | n51JQkY1D10 @ 00:30.5 | BAILOUT! stamp, camera follows the rider not the bike, HUD fades out, body-settle dolly-in |
| 14-ris-barrel-explosion-crash | Rising | n51JQkY1D10 @ 01:50.5 | Barrel fireball, CRASH! stamp, 4 s free-fall ragdoll, fog grading |
| 15-ris-replay-hud-fault-cut | Rising | Ocxq4js7akU @ 01:13.0 | Replay HUD (REPLAY tag, control strip), fault shown as hard cut + timer jump |

Sources (all real gameplay captures, no talking heads):
- https://www.youtube.com/watch?v=nBEtTzin98A — Trials Evolution, Extreme Tracks Playthrough (27:51, 16 faults on one track = dense fault footage)
- https://www.youtube.com/watch?v=7_86rRhggM0 — Trials Evolution, Test Your Might 0-fault guide (9:47)
- https://www.youtube.com/watch?v=h-n-kD5pDF0 — Trials Evolution, Out of the Pit no-fault platinum (1:31)
- https://www.youtube.com/watch?v=hEgg5H5Y0iU — Trials Rising, first 20 minutes (22:13)
- https://www.youtube.com/watch?v=n51JQkY1D10 — Trials Rising, Ragdoll Bailouts & Crashes ep. 2 (4:05)
- https://www.youtube.com/watch?v=Ocxq4js7akU — Trials Rising, Industrial Escape ninja replay (3:33)

## Measured timings (the numbers to hit)

| Event | Evolution | Rising |
|---|---|---|
| Ragdoll fault → back on bike at checkpoint | **0.35 s** after impact flash; ~0.75 s after rider leaves the bike (clip 02: flash @ in-game 34.73, cut @ 34.87, riding again @ 35.2) | full restart: **0.75 s** from ragdoll start to hard cut to start line (clip 08: crash 23.98, CRASH! stamp 24.18, cut ≈24.70) |
| Fault where the rider dies to a hazard (fire) | <0.1 s snap to black, **0.9 s dark hold**, **0.45 s** unblur → total ≈1.5 s (clip 01) | n/a in corpus |
| Fault counter increment | flips to orange at the *end* of the respawn transition, not at impact (clips 01, 02) | counter is a plain white digit in the pill; CRASH!/BAILOUT! stamp appears **0.2 s** after ragdoll starts |
| Timer during a fault | keeps running through crash, fade and respawn — no pause (16.95→18.55 across clip 01) | keeps running through the ragdoll; resets to 00:00.000 on restart; after restart the clock starts on **first throttle input**, not on the cut |
| Re-attempt cadence on a hard obstacle | fault→fault **≈3.0 s** (clip 02: 34.87 → 37.77) | — |
| Countdown | "3","2","1","GO" at **1.0 s** spacing, GO holds ~0.9 s then fades (clip 04) | same 1.0 s spacing on a fresh track load (clip 09); **no countdown at all on restart** — just idle then GO! on throttle (clip 08) |
| Finish → results | timer freezes on the line; ribbon on screen **2.3 s**, then 0.5 s fade to RACE RESULTS (clip 06) | timer freezes; cut to crowd cam **≈0.1 s** after the line; TRACK FINISHED! tag swaps to placement tag after **≈1.2 s** (clip 10) |
| Restart hold | — | ~0.6 s hold, then instant cut (no fade, no loading) |

## Observations — what makes it read as AAA

### Crash / ragdoll
1. **The rider is the crash, the bike is just debris.** In both games the camera target switches from bike to rider the instant the ragdoll activates (Rising bailout, clips 13/14: rider flies out of the top of frame and the camera pans up to keep *him* framed while the bike drops away). The bike is left to tumble with its own rigid-body sim (upside-down rest pose in clip 08 by +0.5 s).
2. **Ragdoll poses are loose and long-limbed.** Arms and legs trail behind the torso through the arc; in clip 14 the body free-falls for ~4 s with a slow (≈0.5 Hz) tumble, never stiff. Contact with the ground produces 2–3 decaying bounces over ~1 s before settling (clip 13 rows 3–4). Clothing colour (green/white shirt) is deliberately high-contrast against ground so the ragdoll stays readable at 1/20th of frame height.
3. **A fault has a punctuation mark at the exact moment it registers.** Evolution: a ~40 px white flash at the rider's pelvis on impact (clip 02, 34.73). Rising: the CRASH!/BAILOUT! stamp (dark-grey semi-transparent slab ≈270×60 px, centred x=640, top y≈75, rotated about −6°, red or orange bold italic ~36 px text with dark outline) scales in from ~60 % to 100 % over ~0.25 s.
4. **Evolution's crash-to-respawn is a hard cut, not a fade,** when the crash is a normal tumble: 0.35 s after the impact flash the next frame is already the rider seated at the checkpoint with the counter flipping. Only hazard-deaths (fire, clip 01) use a fade, and that fade is asymmetric: snap to black (<3 frames), hold ~0.9 s while the world is repositioned, then a depth-of-field blur that resolves over ~0.45 s — you see the checkpoint *forming* rather than a plain fade-in.
5. **The fault counter flip is the HUD's only "loud" animation.** The digit jumps to a larger orange/yellow glyph (Evolution: ~36 px italic → ~44 px orange for ~0.3 s, then settles to white) exactly on the respawn frame, never on the impact frame. Everything else in the HUD stays still.
6. **Checkpoints are lit, not labelled.** Evolution marks the respawn point with a green neon panel + green ground decal (clip 02); the rider respawns already seated, wheels planted, throttle-ready, facing track direction, with the camera already at gameplay framing — zero settle time. Rising marks checkpoints with a small numbered slab in-world ("4" in clip 08) and pins on the progress bar.
7. **Physics keeps running after the result.** Rising clip 12: TRACK FINISHED! appears as the front wheel crosses the line, then the bike ploughs into a tyre stack and the rider ragdolls for another 3 s while the reward panel sits over it. The camera drops ~15° lower and pushes in on the wreck. The finish is a state change in the HUD, not a freeze-frame.

### Restart
8. **Rising's restart is faster than its own crash animation.** From ragdoll start to being back at the start line is 0.75 s, and that includes ~0.45 s of the player watching the CRASH! stamp before holding the button. There is no fade, no loading, no camera fly-in: one frame you are on the ground, the next frame you are at 00:00.000 / 0 faults with the same camera rig already in place.
9. **After a restart the clock is armed, not running.** HUD reads 00:00.000 for as long as the player idles (1.4 s in clip 08); the first throttle input starts the timer and pops "GO!" (white heavy italic ≈90 px tall, dark drop shadow, centred x≈640, y≈240–330, drifts up-right ~40 px and fades over ~0.8 s). This means restart latency is entirely the player's — the game never makes you wait for a 3-2-1 after a restart.
10. **Fresh track loads do get a countdown, and it has squash-and-stretch.** Evolution's yellow "3" appears tall-and-thin and snaps to its normal aspect within ~0.15 s (clip 04); Rising's white numerals do a similar scale-pop. Spacing is exactly 1.0 s per numeral in both games; "GO" is drawn ~1.5× the numeral size. The camera performs its establishing-to-gameplay dolly *during* the countdown so no time is spent on a cutscene.

### HUD layout
11. **Evolution HUD**: one top-left cluster only — grunge-splat black backing ≈300×55 px at (40,50); fault count as a large italic numeral (~36 px) on the left, timer `00:34.633` (~24 px, italic bold white) to its right, and a 14 px split delta beneath the timer in red (`+00:13.826`, behind ghost/PB) or green (`-00:09.003`, ahead). No progress bar, no minimap. Everything else — direction arrows, checkpoint lights, the pulsing red down-arrow sign — lives in the world.
12. **Rising HUD**: two elements on one horizontal line at y≈40–68. Left: a dark pill 235×28 px at x=55 containing a green stopwatch glyph, timer (~18 px bold), a red ✕ glyph, and the fault count. Right: track-progress bar 378×15 px at x=832, orange fill on black, rider marker as an orange drop-pin, checkpoints as small pins along the top edge, finish glyph at the right end. Both scale as a unit; the pill's backing is ~70 % opaque so bright skies bleed through.
13. **The HUD gets *out of the way* at the moments that matter.** In Rising bailout mode the whole HUD fades out ~2.5 s after ejection once the body starts settling (clip 13 rows 3–4) so the ragdoll shot is clean; in replay mode the gameplay HUD is replaced by a red "● REPLAY / MODE: DEFAULT CAMERA" tag and a bottom control strip (clip 15).
14. **Split delta is the real progress indicator.** Both games keep a running PB/ghost delta in the HUD and recompute it at checkpoints (Evolution delta jumps +0.554 → +7.942 on the fault in clip 01). At the finish the delta goes green and stays on screen with the frozen time (Rising `-00:07.500`, Evolution `-00:09.003`).

### Camera
15. **Bike sits left-of-centre and low, with strong lookahead.** Rising at cruising speed puts the bike at ≈(36 %, 51 %) of frame with the camera yawed ~20° toward track direction; after GO the camera zooms out visibly over ~2 s as speed builds (clip 09 rows 3–4: the bike shrinks from ~140 px to ~70 px tall). Evolution frames tighter (bike ~160 px tall at 720p) and relies on a slow continuous orbit around the track spline for depth.
16. **Camera never cuts during a normal fault in Evolution** — the hard cut *is* the respawn, and the camera rig at the checkpoint is already at its steady-state gameplay pose, so there is no post-respawn settle wobble. Rising's crash cam likewise keeps tracking without zoom; only the finish and bailout modes get cinematic moves (finish: cut to a front-facing wide from behind the crowd with camera-flash particles, clip 10).

### Finish / results
17. **Finish is a light event.** Evolution fires a white radial burst at the gate (~0.2 s, clip 05) and slides a checkered-flag ribbon up from the bottom edge; Rising bursts confetti/camera flashes from the crowd. The frozen timer stays in the HUD in both — the result screen restates it.
18. **Result screens are layered reveals, not a single card.** Evolution RACE RESULTS (clip 06): headline `FAULTS: 0  TIME: 01:00.190`, medal row bronze→silver→gold→platinum with a light burst on the earned one, then the leaderboard neighbours fade in, then reward lines (`Received PLATINUM Medal – $2960`, `Finished Race – $730`) tick the money counter in the corner ($169,243 → $172,933) over ~2 s. Rising: TRACK FINISHED! tag → placement tag with opponent avatars on a mini progress bar → TRACK REPLAYED +100/+25 reward panel → separate MEDAL EARNED / GOLD full-screen card with a clockwise XP ring and +XP counters (clip 11). Every number animates in.
19. **Prompts are always visible and single-button.** Evolution shows `Ⓐ Results  Ⓑ Retry  Ⓧ View Replay` under the finish ribbon *before* any result screen, so retry is one press from the moment the timer freezes; the results screen repeats `Play Next / Retry / Leaderboards / Garage / Stats / Exit`. Rising's medal card has one prompt, CONTINUE.

### Colour / materials / particles
20. **Grading sells the moment.** Evolution's extreme tracks sit in a warm sodium/ember palette (fire pits, ~2800 K key light, deep black shadows) so the white impact flash and green checkpoint light pop; the black-and-white factory track in 7_86rRhggM0 is a full desaturation grade for a whole level. Rising uses bright, slightly desaturated daylight with heavy aerial fog (clip 14: far trees fade to the sky colour within ~200 m) so a falling ragdoll is silhouetted at any distance.
21. **Dust and debris on every contact.** Rising front-wheel dig-in (clip 08, 23.68) throws a ~60 px sand puff; landing on wood throws splinter sprites; the explosive barrel is a 2-stage fireball (bright core ~0.2 s, then rolling brown-orange smoke ~1.5 s). Evolution fire hazards are animated flame sheets with additive glow bleeding onto the bike model.

## Gaps / caveats
- No clean Trials Rising **fault → checkpoint respawn** (non-restart) was captured live; the Rising walkthrough player cleared most tracks fault-free and the ninja-track sources are replays, which edit the crash out (clip 15 shows the resulting hard cut and ~11 s timer jump). Rising ragdoll + restart is covered (clip 08); Rising checkpoint-respawn timing should be assumed ≈ Evolution's (sub-0.5 s hard cut) until footage says otherwise.
- Clip 13/14 come from a bailout compilation with a small channel watermark bottom-left; ignore it.
- Trials Rising footage is 30 fps source; Evolution sources are 25/29.97 fps. Frame-level timings above carry ±1 frame (±33 ms).
