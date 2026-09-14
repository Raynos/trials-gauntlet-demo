# Reference notes: Trials Evolution core gameplay (aspect `evolution-gameplay`)

Corpus: `reference/evolution-gameplay/` — 15 clips (104.8 s total, all < 3.2 MB, 720p h264 crf26, no audio),
one contact sheet per clip in `sheets/` (2 fps, 4x4 tiles = first 8 s), `manifest.json` with source URLs and
timestamps. Raw downloads live in `raw/` (gitignored, 690 MB). All timings below were read from the game's
own HUD timer or counted from 10 fps / 60 fps frame dumps of the clips.

Sources (5 used, 1 rejected):

| id | video | platform / fps | used for |
|---|---|---|---|
| J7CjAdnb_O0 | Trials Evolution - D license test - HD Gameplay | Xbox 360, 60 fps capture | beginner track, countdown, dust, finish |
| ytUW5r3RYw0 | Trials Evolution - Level A License Test - HD Gameplay | Xbox 360, 60 fps capture | wheelie balance, checkpoint respawn loops, jump sequences |
| TfehtMVzAl4 | Trials Evolution - Gameplay (HD Warehouse) Beginner (No Commentary) | PC Gold Edition, 30 fps | clean 19.3 s beginner run, READY/GO restart |
| d2KgpYINlH4 | [Trials Evolution: Gold Edition] - All HD Warehouse Tournament Platinum Medals | PC Gold Edition, 30 fps | expert 16.1 s run of the same track, motion blur at speed |
| 7o1Ofd01p3A | Trials Evolution Playthrough - Part 4 - A LICENSE (medium tracks) | Xbox 360, 30 fps | medium tracks, big airtime, crash -> restart latency |
| _FZz0w1oEiI | All License Tests (Trials Evolution) | rejected | phone pointed at a TV; skewed and blurred |

## Manifest

| clip | source | source time | shows |
|---|---|---|---|
| `01-d-license-countdown-launch` (5.7 s) | J7CjAdnb_O0 | 0:18.3 | 3-2-1-GO countdown at exactly 1.0 s per beat, elevated start camera, first throttle burst off the pallet platform |
| `02-d-license-log-ramps-wheelie` (6.5 s) | J7CjAdnb_O0 | 0:30.5 | dirt riding with rear-wheel dust plume, scripted hard camera cut at a trigger volume, wheelie-assisted ramp climb (3/7 -> 4/7) |
| `03-d-license-dust-firejump-finish` (7.0 s) | J7CjAdnb_O0 | 0:38.5 | dust trail on dirt rollers, jump past fire barrel, stop-sign obstacle, FINISH banner + "New Bike unlocked" toast |
| `04-a-license-crash-checkpoint-respawn` (5.5 s) | ytUW5r3RYw0 | 0:18.5 | two failed ramp bunny-hops in a row: CRASH! text, ragdoll, hard-cut respawn at the green checkpoint post |
| `05-a-license-obstacle-climb-wheelie` (7.0 s) | ytUW5r3RYw0 | 0:58.0 | "Obstacle Climbing": front wheel popped onto a box lip, ~4 s of rear-wheel balance with throttle modulation |
| `06-a-license-jump-sequence-rear-wheel` (7.0 s) | ytUW5r3RYw0 | 1:22.0 | ramp descent, bail, respawn, bunny-hop gap landing rear-wheel-first on the next ramp, second bail and respawn |
| `07-a-license-finish-descent` (6.5 s) | ytUW5r3RYw0 | 1:38.0 | controlled ramp descent, tower drop, ride into the checkered RedLynx finish gate, FINISH overlay |
| `08-warehouse-beginner-ready-go` (7.5 s) | TfehtMVzAl4 | 5:57.0 | restart: READY -> GO in 0.9 s, timer starts on GO, rider pre-loads with a small wheelie, first tabletop ramps |
| `09-warehouse-beginner-finish-fireworks` (8.0 s) | TfehtMVzAl4 | 6:10.0 | 00:12-00:19 of the same track: plank bridges with fireballs, half-pipe drum, finish fireworks flash, FINISH at 00:19.334 |
| `10-gold-platinum-run-first-half` (8.0 s) | d2KgpYINlH4 | 0:36.0 | expert run 00:00-00:08 of the same track: instant wheelie launch, full throttle, directional motion blur, explosion barrel |
| `11-gold-platinum-run-second-half` (8.0 s) | d2KgpYINlH4 | 0:45.5 | expert run 00:09-00:16: plank section at speed, half-pipe, lens-flared finish light, FINISH at 00:16.061 |
| `12-rock-steady-big-jump` (8.0 s) | 7o1Ofd01p3A | 0:44.0 | medium track: dust-puff drops, rocky gully, tall ramp launch, ~2.4 s airtime with camera pull-out, rear-wheel landing with dust |
| `13-roller-coaster-crash-instant-restart` (7.0 s) | 7o1Ofd01p3A | 2:12.5 | over-rotated landing, CRASH! (0.8 s), player restarts: hard cut, READY, GO 1.0 s later, timer reset |
| `14-roller-coaster-huge-jump-airtime` (7.0 s) | 7o1Ofd01p3A | 1:51.0 | GO -> launch in 2.5 s, ~3.2 s airtime over a cabin, camera orbits to a high 3/4 overhead and zooms out |
| `15-rock-steady-crash-full-restart` (6.0 s) | 7o1Ofd01p3A | 0:32.5 | lands the big jump, loops out on the drop at 00:14.08, CRASH!, READY appears 0.5 s later with kinetic text |

## Observations (what makes it read as AAA)

### Timing and flow

1. **Countdown is metronomic: 1.0 s per beat.** Clip 01: "3" at t=0.5, "2" at 1.5, "1" at 2.5, "GO" at 3.5 s. The numbers are huge italic yellow sans (about 20% of frame height), drop-shadowed, drawn right beside the bike rather than centred. The bike is physically live during the countdown (the rider rocks); only forward motion is held.
2. **Restart is not a countdown.** After any restart or checkpoint respawn the game shows READY for ~0.5 s, a 0.3-0.4 s gap, then GO; the timer starts on the GO frame (clip 08: GO frame reads 00:00.049; clip 13: 00:00.116). READY -> GO = 0.9-1.0 s in every sample (clips 08, 13). First launch of a track uses the full 3-2-1-GO.
3. **Crash -> back in control ~1.0 s on Xbox 360.** Clip 04 at 60 fps: CRASH! text appears at t=1.8 s, ragdoll for 1.0 s, hard cut to the checkpoint at t=2.8 s, bike already moving forward by t=2.9 s. Clip 15: crash at 00:14.08 -> READY on screen 0.5 s later. The ragdoll never has to finish; the B/back press is accepted immediately.
4. **Checkpoint respawn is a hard cut, no fade, no camera blend.** Clip 04 and 06: the frame after the ragdoll is the checkpoint framing with the bike stationary and upright on both wheels, camera already at its rest offset. The checkpoint post lamp is lit green; the "!" banner above it is a standing 2D billboard.
5. **CRASH! text lives 0.5-0.8 s** (clips 04, 13): yellow italic "CRASH!" spawns next to the rider's head, drifts a little with the ragdoll, and fades; simultaneously the button-hint strip at the bottom swaps to "Restart Race / Pause / Return to Last Checkpoint". The HUD timer freezes at the crash time (clip 13: stuck at 00:10.700).
6. **Kinetic text.** READY / GO / CRASH! do not just pop: READY sweeps in as a horizontally stretched streak (about 0.1 s), holds, then skews and rotates out (clip 15 last frame shows it mid-rotation, ~30 degrees). GO shrinks and fades over ~0.6 s (clip 08 frames 10-15).
7. **A full clean beginner run is 16-19 s** (00:19.334 casual, 00:16.061 platinum on the same HD Warehouse track — clips 09 vs 11). Medium tracks are 40-70 s with 0-3 faults. The fault counter (top-left ink splat) is the co-headline with the timer.

### Bike motion

8. **Wheelie launch is the default start.** Every competent rider leaves the line with the front wheel up (clip 10 frame at 00:00.699: front wheel ~40 cm up, rider leaning back; clip 08 t=1.7-2.0 s). The throttle from rest pitches the bike back within ~0.3 s.
9. **Rider lean is a visible, lagging animation, not a bike-only tilt.** Clip 05 crop: the rider tucks his chest to the bars for 0.3-0.4 s (4 frames at 10 fps) before the front pops up, then stands up straight on the pegs, then arches back as the wheelie steepens. Body pose trails input by roughly 100-150 ms and the torso keeps a few degrees of overshoot.
10. **Rear-wheel balance is held for seconds, not moments.** Clip 05: from t=2.0 to t=6.0 s the bike sits at 40-50 degrees pitch with the front wheel resting on / hovering at the box lip; the rear wheel does small hops (one every ~0.4-0.5 s) as throttle is pulsed. The bike never "snaps" — pitch drifts and gets corrected.
11. **Landings are rear-wheel-first with a two-stage settle.** Clip 12 crop (10 fps): rear tyre touches, rider crouches (compression) over 2-3 frames (~0.25 s), front wheel comes down and a dust puff spawns at the rear contact ~0.1 s after touchdown, rider extends back to neutral over the next ~0.4 s. Landing flat/nose-down on the big jumps produces the loop-out crash in clip 13 and 15.
12. **Airtime is long and readable.** Clip 14: ~3.2 s airborne (00:02.6 -> 00:05.8 on the HUD), clip 12: ~2.4 s. During flight the bike pitch drifts slowly (about 30 degrees over the whole arc) unless leaned; the rider's legs extend and the bike hangs slightly nose-down.
13. **Throttle bursts, not held throttle, on technical sections.** On the log ramps in clip 02 and the container in clip 05 the rear wheel visibly spins up, grips, stops; dust puffs come in discrete bursts tied to those pulses rather than a continuous trail.
14. **Drops squash the suspension visibly.** In clip 12 (00:05.6-00:06.6) the small ledge drops each produce a dust puff on contact and a ~0.2 s crouch of the rider; the fork and shock compression is readable at 720p even though the bike is only ~12% of frame height.

### Camera

15. **Bike sits left of centre, roughly one third in, riding right, at about 20-25% of frame height on flat ground** (clips 02, 05, 08). Lookahead is achieved by that offset, not by panning ahead.
16. **The camera is a cinematic spline, not a chase cam.** It is pinned to track-authored camera paths: on the dirt section in clip 02 it hard-cuts to a wide, low, pole-in-foreground angle when the bike passes a trigger, then hard-cuts back. Both the D and A license tests and the medium tracks show 3-4 such cuts per track.
17. **Zoom-out and orbit on big air.** Clip 14: as the bike leaves the ramp the camera swings from a side view to a high 3/4 overhead, the bike shrinks from ~25% to ~15% of frame height, and the landing ramp is kept in the bottom third of the frame for the whole descent. Clip 12: same treatment, the camera also rolls ~10 degrees during the descent.
18. **Overhead top-down bias on dirt / open sections, side-on on technical sections.** Dirt rollers (clip 03) are seen from ~45 degrees above; box climbs and ramps (clips 05-07) from near-horizontal so pitch is readable.
19. **Motion blur is directional and only kicks in at speed.** The Gold Edition expert run (clip 10, frames at 00:04-00:06) smears the background and the smoke volumes along the direction of travel while the bike stays sharp; the slower casual run of the same track (clips 08-09) shows almost none.

### Look, materials, particles

20. **Colour grading is per-world.** The HD Warehouse tracks are graded to a warm amber/yellow (windows blow out to white, floor is orange-brown, shadows stay brown not black). Crash County outdoor tracks are neutral daylight with a cool blue sky, saturated red-and-white ramp stripes and pink/green rider suits that pop against grey rock.
21. **Every impact has a particle answer.** Rear-wheel dust on dirt is a large grey-white billow that persists 1-2 s and drifts (clip 03, bottom-right frame: plume is roughly the size of the bike). Wooden platforms give small tan puffs. Explosive barrels give sparks + smoke volume that the bike drives through (clip 10). The finish line fires a full-screen white flash + confetti sparks (clips 09, 11).
22. **Scripted set-dressing motion everywhere:** propane fireballs on timers along the planks (clip 09), fire barrels beside jumps (clip 03), collapsing planks and swinging barrels. The track is never static.
23. **HUD is minimal and diegetic-styled:** an ink-splat badge top-left with the fault count (large) and the timer (small), the checkpoint counter "N / M" replaces it on license tests, and the bottom strip of button hints is only shown on tutorial tracks. Gold Edition adds a small red split (delta to the medal time) under the timer and a ghost-rider name tag ("Johnny Cullen") floating above the ghost's head.
24. **The finish is a celebration beat of ~1.5 s:** fireworks flash, checkered flag banners sweep in from both sides, a "FINISH!" plaque with the medal drops in, then a "New Personal Record" / "New Bike unlocked" toast. The bike keeps rolling under it, it is not frozen.

## Numbers to target

| thing | measured |
|---|---|
| countdown beat | 1.0 s |
| READY -> GO (restart / respawn) | 0.9-1.0 s, timer starts on GO |
| crash -> rideable at checkpoint | ~1.0 s (0.5 s minimum if the player mashes) |
| CRASH! text lifetime | 0.5-0.8 s |
| rider lean pose lag | ~0.1-0.15 s |
| landing compression | 0.2-0.3 s crouch, 0.4 s extend |
| wheelie hop cadence while balancing | one hop per 0.4-0.5 s |
| big-jump airtime (medium tracks) | 2.4-3.2 s |
| bike height in frame | 20-25% on ground, ~15% during big air |
| beginner track clean time | 16-19 s |
