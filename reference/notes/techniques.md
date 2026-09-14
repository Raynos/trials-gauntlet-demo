# Reference corpus: techniques

Real Trials footage of the core manoeuvres, cut into short side-on clips so our
own runs can be laid next to them clip-vs-clip. All clips are 720p h264 crf26,
no audio. Sheets are `fps=2` tiled 4x4 (16 frames = 8 s of motion per image).

Primary source is the **University of Trials in-game lessons in Trials Rising**
(UniversityOfTrials channel, uploads of the lesson tracks played A+). They are
ideal for this purpose: one manoeuvre repeated many times from the fixed game
camera, in a graded zone (`D2`, `C1`, `A1`...) that the player resets to over
and over. Sixth source is a Trials Rising wheelie skill game for sustained
wheelie balance and the start/finish HUD.

Paths: `reference/techniques/clips/`, `reference/techniques/sheets/`,
`reference/techniques/manifest.json`. Raw downloads live in
`reference/techniques/raw/` (gitignored, 163 MB).

## Manifest

| # | clip | source (video, t=) | technique | what it shows |
|---|------|--------------------|-----------|---------------|
| 01 | `01-bunnyhop-plank-to-ledge-and-reset` | Bunny Hop lesson 7, 32.0-39.5 s | bunny hop | Two D2 attempts back to back. Reset at +2.0 s (hard cut, cam snaps wide to tight), stationary hop from plank onto container ledge at +3.5 s, ride off, second reset at +7.0 s. |
| 02 | `02-bunnyhop-second-attempt` | Bunny Hop lesson 7, 46.0-53.0 s | bunny hop | Same hop repeated; 2.5 s of pre-load, hop at +3.0 s lands back on the plank. Contains a source-video dissolve at +2.5 s (editing, not game). |
| 03 | `03-rearwheel-bounce-on-box` | Rear Wheel Bounce lesson 11, 29.0-36.0 s | rear-wheel bounce | Manual off a ledge onto a hanging crate, then ~4 s of rear-wheel balance on the crate at ~70 deg pitch with the camera at its tightest. |
| 04 | `04-rearwheel-hop-pole-tops` | Rear Wheel Bounce lesson 11, 45.0-51.5 s | back-wheel hops | Rear-wheel hops across a row of pole tops climbing to a platform, reset to C1 at +5.0 s. |
| 05 | `05-steep-curved-ramp-climb` | Uphill Obstacles lesson 8, 13.0-19.5 s | steep climb / quarter pipe | Climb a curved quarter-pipe, drop onto the container with the B plaque, flame-jet pyro at +6.0 s. |
| 06 | `06-near-vertical-ramp-climb` | Uphill Obstacles lesson 8, 29.0-36.0 s | steep climb | Stall and roll-back near the top of a ~60 deg plank, then the widest camera state while grinding up a long straight plank at ~1 bike length/s. |
| 07 | `07-uphill-plank-landing` | Uphill Landing lesson 6, 26.0-32.5 s | uphill landing / gap | Slow plank climb with exhaust puffs, launch at +4.5 s, camera pulls back in flight, rear-wheel landing on D1 at +5.5 s, pyro at +6 s. |
| 08 | `08-checkpoint-pyro-and-zoom-in` | Uphill Landing lesson 6, 29.5-36.5 s | checkpoint feedback + idle cam | Same landing, D1 flame jets, hard cut at +3.0 s to the tightest camera as the rider idles at C2 and blips the throttle. |
| 09 | `09-crash-ragdoll-instant-respawn` | Uphill Landing lesson 6, 64.5-72.0 s | crash + respawn | Fall off plank at +0.5 s, ragdoll impact +1.7 s, camera settles, single-frame cut to checkpoint B3 at +5.1 s, riding by +5.5 s. |
| 10 | `10-drum-spool-crash-respawn` | Flat Obstacles lesson 9, 51.5-58.0 s | drum crossing fail | Ride onto a giant cable spool, tip over the far side at +2.0 s, rider thrown clear, cut to D3 at +4.5 s, idle at checkpoint. |
| 11 | `11-drum-spool-hop-over` | Flat Obstacles lesson 9, 59.0-66.5 s | drum crossing success | Roll in, hop onto the spool at +2.5 s, camera tightens in the slow section, rear-wheel lift and roll over the spool, reset at +7 s. |
| 12 | `12-flat-box-hops` | Flat Obstacles lesson 9, 76.0-82.0 s | planks / boxes | A1 zone pyro, then a run of small front-wheel lifts and hops on a plank against a box. |
| 13 | `13-wheelie-countdown-launch` | Wheelie skill game, 10.0-17.0 s | wheelie start | 3-2-1-GO countdown at 1.0 s cadence, tip text hides at GO, front wheel up immediately, camera widens with speed. |
| 14 | `14-wheelie-sustain-over-bumps` | Wheelie skill game, 20.0-27.0 s | wheelie balance | Sustained wheelie through the 50 m gate; HUD 36.0 m to 62.7 m in 6.5 s (~4.1 m/s), pitch 30-45 deg with visible corrections. |
| 15 | `15-wheelie-bomb-fail-finish` | Wheelie skill game, 48.5-55.0 s | fail + finish | Stationary wheelie on a steep ramp for ~3.4 s, front wheel touches, bomb detonates at +3.75 s, `CRASH!` then `TRACK FINISHED!` banner 0.4 s later. |

Source videos (all YouTube, downloaded 720p via yt-dlp `web_embedded` client):

- Bunny Hop lesson 7: https://www.youtube.com/watch?v=-a_ulossbyc (UniversityOfTrials, 96 s)
- Rear Wheel Bounce lesson 11: https://www.youtube.com/watch?v=ohfMjoJvDV0 (UniversityOfTrials, 104 s)
- Uphill Obstacles lesson 8: https://www.youtube.com/watch?v=U7DWi1Kd1IE (UniversityOfTrials, 122 s)
- Uphill Landing lesson 6: https://www.youtube.com/watch?v=HU5qgS4DhwE (UniversityOfTrials, 94 s)
- Flat Obstacles lesson 9: https://www.youtube.com/watch?v=V9f_hggzEvE (UniversityOfTrials, 115 s)
- Wheelie skill game: https://www.youtube.com/watch?v=msxwz94YFV0 (VariaWolf, PS4, 78 s)

A seventh download (Pipe Phobia II tutorial, Trials Fusion, R_uOi4FByOQ) was
rejected: stream overlay and facecam cover ~30% of the frame and the challenge
is "don't touch the pipes", not riding them. Deleted from raw/.

## Observations: what makes the real thing look and feel AAA

Timing numbers are from frame counting at 29.97 fps unless stated.

### Camera

1. **Three distinct zoom states driven by speed, not by manoeuvre.** Idle or
   crawling (clip 08 at +3 s, clip 03): bike plus rider is ~40% of frame height
   (~290 px of 720). Normal riding (clip 14): ~24% (~170 px). Fast or airborne
   (clip 06 after +2.5 s, clip 08 apex at +1.5 s): ~8-10% (~60-70 px). The
   camera continuously interpolates between these; the pull-back during the
   clip 07 jump takes ~0.7 s from launch to apex.
2. **Lookahead is ~2/3 of the frame.** Bike centre sits at x = 25-35% from the
   left edge whenever it is moving right; when stationary it drifts to ~45%. It
   sits at y = 50-58% (slightly below centre), so there is more sky than floor.
3. **The camera is not pure side-on.** Yaw is ~15-25 deg toward the direction
   of travel and pitch ~20-25 deg down in the riding state (you see the top
   face of planks and the near side of containers). In the tight idle state it
   flattens to ~5 deg yaw and near-zero pitch (clip 08 at +4 s is almost an
   orthographic profile).
4. **On a crash the camera stops following, then creeps.** Clip 09: after the
   ragdoll lands the camera decelerates over ~1 s and then drifts inward at
   perhaps 2-3% scale per second for the remaining 3 s. It never snaps.
5. **Reset is a single-frame hard cut.** Clip 09 frames 152-153 (69.60 s to
   69.63 s in the source): ragdoll on one frame, rider upright at the
   checkpoint on the next, camera already in the correct tight state. No fade,
   no black, no motion blur. Same in clips 01, 04, 10, 11 (scene detector fires
   on exactly one frame each time: 34.03, 38.54, 56.02 s ...).
6. **Time from impact to player reset in these clips is 2.5-3.5 s**, and that
   is the player's choice (the game lets you reset immediately). The lesson
   player resets instantly on a *failed manoeuvre* (clip 01 both resets happen
   while still riding, with no crash) which is how the same hop is attempted
   6+ times in 40 s of video. Restart latency must be measured from button
   press, and it is one frame.

### Manoeuvre timing

7. **Stationary bunny hop (clip 01, 15 fps strip of 35.0-36.6 s):** crouch and
   front-wheel lift over ~0.4 s, rear wheel leaves the plank ~0.6 s after the
   front, airtime ~0.6 s, rear wheel touches the ledge ~1.2 s after the move
   starts. Rider goes from full crouch (helmet below the bar) to full extension
   (arms straight, standing on pegs) during the lift.
8. **Rear-wheel balance (clip 03, 10 fps strip 31-34 s):** bike held at 65-75
   deg pitch for 4 s with a slow pitch wobble of roughly +/-5 deg and ~1 s
   period, corrected by visible rider lean fore/aft rather than throttle
   blips. The rear suspension visibly compresses on each landing.
9. **Steep climb speed (clip 06):** on a ~60 deg plank the bike advances about
   one wheelbase per second; on the ~50 deg plank in clip 07 roughly two per
   second. The rider stands and hangs over the bars the whole way; the front
   wheel hovers 0-10 cm off the plank rather than being planted.
10. **Uphill landing (clips 07/08):** launch to touchdown ~1.0 s; touchdown is
    rear-wheel first with the bike pitched ~30 deg nose-up relative to the
    landing plane, then the front drops over ~0.3 s. No bounce on a clean
    landing; a bad one (clip 06 at +2 s) simply loses traction and rolls back.
11. **Wheelie cadence (clip 14):** ~4.1 m/s ground speed while balanced at
    30-45 deg pitch; the visible correction cycle (nose rises, rider sits back,
    nose falls) is ~1.5-2 s. A stationary wheelie on a slope (clip 15) was held
    for 3.4 s before failing.
12. **Countdown (clip 13):** numerals at exactly 1.0 s spacing, each drawn
    large (~1/4 frame height), centred slightly above the bike, fading out
    within ~0.5 s so the screen is clean between beats. `GO!` is italic, and
    the tutorial text strip at the bottom is removed on the same frame.

### Feedback, particles, materials

13. **Grade zones are physical objects.** `D2`, `C1`, `A1` are painted plaques
    and hanging signs in the world, not HUD text, and the lesson tracks run
    with **zero HUD** (no timer, no fault counter). The skill game has only two
    small pills top-left: distance and stopwatch, white on 60% black.
14. **Clearing a zone fires 2-4 propane flame jets** from the platform edge
    (clips 05, 07, 08, 12): full height in ~0.2 s, about two bike heights tall,
    burning 0.7-1.0 s, then gone. Bright orange core with a soft yellow bloom.
15. **Throttle blips produce exhaust puffs** (clip 07 at +0-4 s, clip 08 at
    +4.5 s): a grey smoke ball about one wheel-diameter in size that drifts
    back and dissipates in ~0.5 s. This is the main readable cue for "the
    player is on the gas" when the bike is not moving.
16. **Explosion (clip 15):** orange fireball reaches ~3 bike lengths across in
    0.25 s, `CRASH!` red label appears on the detonation frame, the fireball
    turns into a white-grey smoke cloud by +0.75 s and is gone by +2 s.
    `TRACK FINISHED!` slides in 0.4 s after detonation while the smoke is still
    up.
17. **Ragdoll is rider-separate-from-bike.** In clips 09, 10 and 15 the rider
    detaches and tumbles while the bike falls as a separate rigid body and the
    free wheel keeps spinning for 1-2 s after it comes to rest.
18. **Colour grading is per-track, applied to the same warehouse.** Bunny Hop
    and Flat Obstacles are warm amber (sodium lamps, ~3000 K); Rear Wheel
    Bounce is cold blue-teal with heavy floor fog; Uphill Landing and Obstacles
    are neutral daylight through skylights. Every one has volumetric shafts
    from the windows, floating dust motes, and a strong white lens flare when a
    lamp or window enters the frame (clip 08 bottom-left).
19. **Track-side readability:** rideable surfaces are pale weathered planks
    (high luminance); hazards and drops are dark; red `X` decals mark the
    mattress where you land after a fall; `SAFE ZONE` pads in the skill game
    are flat green with white stencil lettering plus cyan neon edge strips on
    the ramps that read even in the purple dusk fog.
20. **Bike and rider are high-contrast against everything:** saturated blue
    frame, yellow jacket, white helmet in the lessons; red jacket and red
    wheels in the skill game. The bike is the most saturated object in every
    frame, which is what keeps it findable at the 8% zoom state.

### What this means for our comparison baseline

- Compare a bot's bunny hop against clip 01 at 15 fps: lift-to-launch ~0.6 s,
  airtime ~0.6 s, landing rear wheel first.
- Compare restart against clip 09: the frame after the reset input must
  already show the rider upright at the checkpoint with the camera in the tight
  state. Anything longer than one frame is a regression against the reference.
- Compare camera against clips 06, 08 and 14: three zoom states, bike at
  x = 25-35%, lookahead ahead of the bike, pull-back during airtime ~0.7 s.
