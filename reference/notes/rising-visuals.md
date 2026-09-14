# Reference notes: Trials Rising visual quality ("rising-visuals")

Corpus: `reference/rising-visuals/` (clips/, sheets/, manifest.json; raw/ is gitignored).
All footage is real Trials Rising (Ubisoft RedLynx, 2019) captured from YouTube at 720p.
Sources 1-3 are 60 fps captures (PS4 Pro / PC); source 4 is a 30 fps leaderboard replay.
Sheets are 8 evenly spaced frames across each clip, tiled 4x2.

Method note: yt-dlp's default clients 403'd after ~20 MB per file (YouTube now requires a
GVS PO token); downloads succeeded with the `bgutil-ytdlp-pot-provider` HTTP server plus
`--extractor-args youtube:player_client=mweb`. No fallbacks were needed.

## Manifest

| Clip | Source (t=) | Env | Shows |
|---|---|---|---|
| `01-desert-oilrig-flare` (8.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=165s) 2:45 | Texas desert, oil rig | Spline camera: behind-bike -> full top-down -> low angle; sun flare; baked tyre-trail decal |
| `02-canyon-multistart` (8.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=719s) 11:59 | Canyon, sunset | Load fog -> start gate close-up, 3-2-1-GO, camera pull-out, crowd + spotlights |
| `03-canyon-sunset-air` (8.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=733s) 12:13 | Canyon, sunset | Big gap into the sun; silhouette rider; 3-4 haze layers; in-world checkpoint signs |
| `04-night-forest-start` (7.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=510s) 8:30 | Night forest | GO banner, headlight cone, blue moonlight vs orange fires, ghost name tags, 90 deg top-down |
| `05-night-moon-jump` (8.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=540s) 9:00 | Night cliffs | Pink flare markers with smoke, moon disc, low side angle, translucent ghost riders |
| `06-city-explosions` (8.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=634s) 10:34 | NYC street | Grey-green grade, exploding props + lingering sparks, near-vertical top-down, truck as foreground occluder |
| `07-city-finish-crowd` (6.0 s) | [TdWf8lfqpiY](https://www.youtube.com/watch?v=TdWf8lfqpiY&t=670s) 11:10 | NYC park | Finish: timer freeze, label swap, reward panel, rider flung into fountain and explodes, confetti |
| `08-caldera-fog-explosion` (8.0 s) | [3KZHkwwoSA4](https://www.youtube.com/watch?v=3KZHkwwoSA4&t=696s) 11:36 | Foggy forest, day | Volumetric fog in 3 depth tiers, low camera looking up, barrel explosions, `+5 sec` text |
| `09-crash-respawn` (4.0 s) | [3KZHkwwoSA4](https://www.youtube.com/watch?v=3KZHkwwoSA4&t=785s) 13:05 | Night forest | Bail -> CRASH! -> prompt -> 1-frame hard cut to checkpoint; timer +5 s |
| `10-scrapyard-golden-backlight` (7.0 s) | [ZPbgR_47i2w](https://www.youtube.com/watch?v=ZPbgR_47i2w&t=421s) 7:01 | Scrapyard, golden hour | Sun in frame, anamorphic streaks, god rays, chain-link shadows, replay input widget |
| `11-dusk-silhouette` (7.0 s) | [ZPbgR_47i2w](https://www.youtube.com/watch?v=ZPbgR_47i2w&t=490s) 8:10 | Industrial, dusk | Salmon sky, rider + pylons as silhouettes, drop into shadowed scaffold |
| `12-foundry-fire` (7.0 s) | [ZPbgR_47i2w](https://www.youtube.com/watch?v=ZPbgR_47i2w&t=523s) 8:43 | Foundry interior | Emissive molten pillars + bloom, red grade, tight low camera |
| `13-lava-flow` (7.0 s) | [ZPbgR_47i2w](https://www.youtube.com/watch?v=ZPbgR_47i2w&t=893s) 14:53 | Volcanic | Lava under-lights the bike, lava-fall, ember sprites, close-up -> panorama |
| `14-giga-sand-dunes` (8.0 s, 30 fps) | [JmOMPY-bbco](https://www.youtube.com/watch?v=JmOMPY-bbco&t=334s) 5:34 | Sand desert | Blown-out warm highlights, ground camera pointing straight up on big air |
| `15-giga-snow-village` (8.0 s, 30 fps) | [JmOMPY-bbco](https://www.youtube.com/watch?v=JmOMPY-bbco&t=650s) 10:50 | Snow village | Dense blue-white fog, glowing windows as depth cues, snow landing puff |

Not clipped but downloaded: `Su6Ax0-Hvrk` (E3 2018 announcement trailer, 90 s, 60 fps) - cinematic cuts, useful only as an environment palette reference (pyramids, castle, Tokyo neon, snow tunnel).

## Observations (numbers over adjectives)

### Camera framing
1. **Bike size in frame.** In normal riding the bike spans 10-12% of frame width (~140 px of 1280 in clip 01 at 0:14.98) and sits at roughly x=35-42%, y=43-60% - left of centre when moving right, so ~60% of the frame is lookahead. In tight sections (clips 09, 12, 13) the camera closes to the bike at 17-25% width; at the start gate (clip 02) it is ~35%.
2. **The camera is a track-authored spline, not a chase cam.** Within one 8 s clip (01) the angle goes behind-bike side view -> ~70 deg overhead top-down -> low angle looking up the ramp. Clip 04 hits ~90 deg straight down over the river; clip 14 puts the camera on the ground pointing straight up at the sky during a big jump. Each transition is a continuous dolly (no cuts) taking ~1-2 s.
3. **Big jumps turn the camera toward the light source.** On the Canyon Crash gap (clip 03, 12.9 s) the camera rotates so the setting sun is directly behind the rider; the rider is a black silhouette against a blown-out sun for ~1.5 s. Clip 05 does the same with the moon, clip 11 with a salmon dusk sky.
4. **Start sequence timing (clip 02, 60 fps):** loading fog crossfades into the track over ~0.3 s; countdown digit `3` appears 0.4 s after the fade, digits advance every 1.00 s, each digit visible ~0.5 s then fades; `GO!` at +3.0 s; the rider is already moving in the next frame. The camera holds a static close-up (bike ~35% of width) for the whole countdown, then pulls back to the wide riding framing over ~1.5 s once the bike moves. Countdown digits sit at roughly x=62%, y=25%, not dead centre.
5. **Foreground occluders are deliberate.** Cactus in clip 01 fills ~25% of frame height in the near foreground; clip 06 dollies behind a truck; clip 10 shoots through chain-link and scaffold. Nothing is depth-of-field blurred - everything is sharp, depth comes from parallax and fog, not DoF.

### Fault / respawn
6. **Crash to banner:** the bike goes over at ~16.4 s (clip 09 HUD time), `CRASH!` slams in 0.55 s later with a 2-frame scale pop (small -> full size), red italic, top-centre. Rider ragdolls and bike tumbles as separate bodies; the camera keeps tracking the *bike*, drifting slowly.
7. **Prompt:** `RESTART TRACK / RESET TO CHECKPOINT` appears under the banner ~1.0 s after the banner. The player pressed reset ~1.45 s after the banner in this sample.
8. **Respawn is a single-frame hard cut** - no fade, no wipe. Frame N is the crash view, frame N+1 is the checkpoint with the rider seated and the camera already in its riding framing. The rear wheel is turning and the bike moves forward within 10 frames (167 ms) of the cut; there is no "settle" animation.
9. **Faults cost +5 s on the clock in this build.** Timer reads 17.916 before the reset and 23.333 on the first frame after (+5.42 s, of which ~0.4 s is real time), and red `+5 sec` text flashes under the fault counter for ~1 s (also visible in clip 08 at 33.3 s). Replays (clip 10) skip the dead time: 33.27 -> 39.12 across a single second of replay video.
10. **Finish (clip 07):** timer freezes on the line (00:52.315). `TRACK FINISHED!` appears within 0.2 s, swaps to `2ND PLACE` ~1.5 s later; a `TRACK CLEARED +250 / +50` reward panel slides in from the right ~0.5 s after the line; blue/white confetti cannons fire at the gate; the camera stops following and the rider is launched off-screen into a fountain where he explodes (the game's signature gag). Whole finish presentation ~4 s before the results screen.

### Lighting, grading, atmosphere
11. **Every track has one dominant hue and one complementary accent.** Night forest: blue moonlight (~#3a5a8a ambient) with orange barrel fires and pink flares. NYC: desaturated grey-green with orange explosions. Foundry/lava: red-orange everything with the bike as the only dark shape. Canyon: peach haze with dark rock. Snow: blue-white fog with warm yellow windows.
12. **Aerial perspective is done in 3-4 discrete depth tiers.** Clip 08 (fog): near trees dark green, mid trees grey-green at ~50% contrast, far ridge ~15% contrast, sky white. Clip 03 (canyon): near rock full contrast, two farther mesa planes progressively pinker, sun glow behind. Fog end distance visually ~60-80 m in snow (clip 15), ~150 m in Caldera.
13. **HDR/bloom is aggressive on point sources only.** Sun disc, spotlights (clip 02), confetti cannons, road flares, headlight and molten metal all bloom to 3-6x their geometric size; diffuse surfaces do not bloom. Clip 10 shows horizontal anamorphic streaks on the sun through scaffolding. Bright sky in clip 14 clips to white on purpose.
14. **Real shadow casting from the key light.** Chain-link fences cast crisp shadow lattices (clip 10); the bike casts a long soft contact shadow ~1.5 bike lengths at low sun (clip 01); the rider's shadow on the ramp reads at 60 fps during wheelies.
15. **Local lights are gameplay-readable.** The headlight is an actual spot with a visible cone and ground pool ~2 bike lengths ahead (clip 09). Lava under-lights the bike frame orange from below (clip 13). Emissive pillars in the foundry light nearby scaffolding.

### Materials and models
16. Bike: painted plastics with sharp speculars, chrome fork and exhaust, black rubber with visible tread; at 60 fps the spokes blur into a translucent disc (per-object or spinning-texture blur) while the frame stays sharp - i.e. wheel blur without full-screen motion blur. Camera motion blur is absent or negligible in all 60 fps clips; background stays sharp during fast dolly moves.
17. Rider: full IK animation - leans forward over the bars on climbs, extends legs on landings, whips the bike sideways in the air (clip 03 frame 4). Helmet and jersey are the only saturated colours on the character so it reads as a silhouette.
18. Environment props are dense and physical: barrels, tyres, pallets, crates, hay bales are individually placed and many are dynamic (tyres roll away in clip 02 frame 7, barrels tumble in clip 08). Spectators are 3D crowds that wave, not billboards (clips 02, 04, 07). Sponsor logos (Squadx, SX, Fox, KBNI) appear as printed banners on every track.
19. The track surface carries a baked "worn line" decal - a reddish dirt trail on the exact rideable path (clip 01 frame 1 at full res). It doubles as a path hint.

### Particles and effects
20. Dust: small low-alpha puff behind the rear wheel on dirt, dies in ~0.3 s; snow landing throws a wider white puff lasting ~0.7 s (clip 15 frame 7). Explosions (clips 06, 08): fireball ~0.5 s, black smoke ~2 s, orange ember sparks with gravity and streak lasting ~1.5 s.
21. Road flares (clips 05, 15): pink point light + bloom + slow vertical smoke ribbon, used as landing markers in dark tracks. Confetti cannons at the finish (clip 07): blue/white, ~2 s.
22. Ghost riders (clips 04, 05): other players' recordings drawn semi-transparent (~40% alpha) with floating name tags in world space, also plotted as small coloured pins on the progress bar.

### HUD
23. Top-left: stopwatch icon + `MM:SS.mmm` timer, red X + fault count; objective label (`FINISH TRACK`) beneath. Top-right: orange progress bar with checkpoint ticks and rider pin(s). Checkpoint numbers are physical signs in the world, not HUD. Replay mode (clips 10-13) adds a bottom-left lean/throttle input widget and `REPLAY / MODE: DEFAULT CAMERA` header - a good reference for an input overlay.

### What to steal for the demo, in priority order
- One-frame respawn hard cut with the rider already rolling (obs. 8) and a 0.5 s CRASH pop (obs. 6).
- Track-authored camera spline with a real top-down and a real low angle per track, bike at ~11% width and ~60% lookahead (obs. 1-2).
- One dominant hue + one accent per environment, 3-tier fog (obs. 11-12).
- Bloom only on point sources; wheel blur without camera blur (obs. 13, 16).
- 1.0 s per countdown digit, static close-up during countdown, 1.5 s pull-out after GO (obs. 4).
