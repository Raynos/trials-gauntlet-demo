# The mega build — v0.1.0 → v0.2.0

Safety net: **v0.1.0** is pinned at https://trials-gauntlet-v0-1-0.vercel.app (tag `v0.1.0`,
`94ecb43`). Anything below that regresses feel or clearability is reverted, not argued with.

## Why (the outside review, distilled)

Every blind-compare loss named **motion**, not art. The world reads as a ribbon with boxes
outside the industrial hall. Only bots and slot-code strangers have ever ridden it, and hard /
extreme are shaped to appease the bot rather than designed. The physics carries three
honesty debts: 1.4 g, a 10× drag governor, and an ECU wheelie assist.

## P0 — Bike physics v2 (added; supersedes P1's physics items)

The user's directive: Trials is 99% the bike physics — per-tick validated, learnable,
reproducible; stable when accelerating with weight forward; snapping weight forward corrects a
rising front; bunny hops reproduce deterministically. Ours reached playability through
patches (1.4 g, drag governor, ECU wheelie assist, airborne blend). So:
1. A Fable 5.1 (xhigh) architect produces `docs/research/trials-bike-physics.md` (≥ 4 real
   Trials games, frame-analysed bunny hops from the corpus, sourced), `docs/research/physics-audit.md`
   (every hack and knife-edge in the current solver) and `project/archive/physics-v2.md` (a complete
   ground-up design with parameter table, validation suite and the physics test level spec).
2. Physics is reimplemented from scratch to that design behind the same `PhysicsWorld` contract.
3. A short **Physics Test Level** (`lab-physics-test`): flat run-up, one challenging bunny-hop
   jump, run-out, with a physics HUD (pitch, speed, compression, COM offset). It ships in the
   track select under "Lab" and is the proving ground for every physics change from then on.
Priority over everything else in this plan; the other pillars proceed in parallel where they
do not depend on physics numbers (render, front end, art, harness).

## The five pillars, and what "done" means for each

### P1 — The hero moves like 145 kg of bike with a person on it
Owner: physics + render, judged by the blind critic every round.
- Two bikes, a real Trials concept: **Rookie** (soft, wheelie assist on, forgiving) and **Pro**
  (raw: no assist, real CdA drag, sharper throttle). Beginner/easy default Rookie; hard/extreme
  default Pro; player can pick. This turns the "assist" debt into a feature and keeps beginners
  alive.
- Physics honesty on Pro: real CdA (≈0.45) + torque curve retuned so the loop-out, wheelie hold,
  climbs and hop still meet the envelope **without** the governor; 1.4 g stays (it is the Trials
  feel) but is documented as a design constant, not a patch.
- Technique gaps closed: rear-wheel bounce / drum pumping (a held rear-wheel hop on a drum top),
  one-way plank edge wedge (solver closes the open-end capture), fillet "parks the bike" cases
  turned into slides, brake authority in the air brought into band.
- glTF hero **default on**; procedural retired from UI (kept as load-failure fallback).
  Fork/shock travel, wheel blur, rider pose, landing dust, hand-over — all straight off
  `PhysicsState`, verified by clip against the reference each round.
- Camera never loses the bike: per-frame box assertion is part of the ship gate on every track.
- Done = blind critic picks ours ≥ 2/6 on wheelie / landing / crash pairs, with named reasons no
  longer including weight, suspension, rider lag or camera.

### P2 — The world reads as a place
Owner: render + art, judged by the blind critic on stills-in-motion.
- Industrial to the bar FIRST, with the recipe written down: one key light with contact
  shadows; 20–50 lit props in frame; ground decals + scatter (bolts, gravel, tyre marks, planks
  ends); three fog tiers each carrying detail; bloom only on point sources; SSAO; material
  wear. Then propagate the recipe to canyon, snow, night city, foundry.
- Every biome gets its own set piece per track and a start/finish that looks like an event.
- Done = for each biome a frame-vs-reference two-up whose luminance/saturation/detail-density
  numbers are in band, and a per-biome blind verdict that names no missing category.

### P3 — Clearable by real people
Owner: tracks + harness + physics freeze; judged by strangers, reflex bot, and the user.
- Physics frozen after P1 (tagged). Hard/extreme re-authored as **designed** courses: each track
  a technique story with a set piece, not a bot-appeased chain; still validated by the bot,
  the reflex bot, and the checkpoint/run-out rules.
- Measure with people: stranger rounds after every track change; reflex `novice/average/good`
  matrix in the gate; **in-game telemetry** (local, opt-in, "Copy run log" in settings) so the
  user's own phone/desktop sessions produce attempts-per-track and death-x histograms we can read.
- Real-device evidence: an FPS/frametime overlay (`?perf=1`) and a quality auto-tier that logs
  its decision, so a phone screenshot tells us what it ran at.
- Done = strangers inside band on beginner + easy, reflex `average` ≤ 1.5× band on medium,
  `good` ≥ 60% + bot clear on hard/extreme, and the user has cleared every beginner track on the
  phone.

### P4 — A complete game
Owner: core-game + art.
- Two bikes with a garage screen; medals and tier progression; PB ghost (exists) + **replay
  viewer** (watch last run / PB, scrub, camera modes); track cards from real renders; credits;
  settings; sound mix pass; PWA manifest + icons + offline cache; per-track leaderboard (local).
- Done = a stranger who has never seen the game can go title → play → medal → next tier without
  a question.

### P5 — Evidence, media, and not regressing
Owner: harness + producers.
- Ship gate every round (boot, clear, crash, restart, determinism, camera box, budgets).
- Timelapse appends every commit; a progress montage per milestone; a v0.2.0 trailer at the end.
- Blind critic every render/physics round, logged with the round it judged.
- Every deploy from a clean `git archive HEAD`; pinned alias per version in `RELEASES.md`.

## Sequence (overnight, parallel owners)

| wave | physics | render | tracks | core-game | harness / art |
|---|---|---|---|---|---|
| 1 | Pro bike: real CdA + retune; Rookie = current; drum pump; plank-edge wedge; air brake band | industrial-to-the-bar recipe (key light, contact shadows, props density, decals/scatter, fog tiers, bloom rule); glTF default | hard/extreme redesign brief + storyboards per track (no code until physics freeze) | garage + two bikes + progression + telemetry + `?perf=1`; PWA manifest/icons | gate with camera box + reflex rows; blind critic on wave-1 render; art: track thumbnails from renders, garage art |
| 2 | freeze → tag `physics-v2`; landing/crash polish; hand-over | propagate recipe to 4 biomes; set pieces; start/finish events | re-author hard/extreme to the storyboards; run-out/checkpoint rules; goldens | replay viewer; sound mix; settings; leaderboard | strangers r3 (b1–e3), reflex matrix, timelapse append, critic on biomes |
| 3 | only stranger-driven fixes | per-biome two-ups + critic; perf on device | stranger-driven fixes; medal targets from measured times | polish; onboarding; credits | strangers r4 (medium), v0.2.0 trailer, RELEASES v0.2.0 |

Rules unchanged: owners own paths; the parent commits per round with the finding; a recorded
input replays byte-identical or the physics is broken; evidence is played, never posed.

## Amendments (2026-09-14 late — the brief diffed against the plans; items the brief demands that no plan line carried)

### P6 — Sound at AAA (new pillar; the brief: "from textures to physics to sound")
Owner: audio (`src/audio/**`, `docs/design/audio.md`), judged blind against reference gameplay audio.
- The procedural mix was tuned to **v1** (1.4 g impulses, auto-clutch, `c6523b4`); v2 changed rpm/thrust
  curves, landing impulses, the hop and the crash. Round 3: retune every model input to the v2 FEEL tables,
  the hop (preload creak → snap → airtime silence → landing), the rider body (grunts are not in scope; the
  suspension is), v2's stall-free launch.
- What is missing entirely: crowd (start gate roar, cheer on a clean landing, groan on a crash, from the
  gates kit's crowd count), ambience per biome (hall reverb tail, canyon wind, snow hush, city traffic bed,
  foundry roar) driven by `def.meta.biome`, a countdown/finish stinger set, and a **music bed** for the front
  end and results (composed procedurally or licensed CC0 — no unlicensed audio; the choice documented).
- Done = the v2 retune, crowd, per-biome room, stingers and music bed shipped and byte-identical offline, and
  a blind audio A/B against the reference corpus' audio on wheelie / landing / crash / start beats *run and
  recorded* (target ≥ 2/6, tells named). The bar — "could be a recording" — lives in `docs/mission.md` §5.

### P5 amendments — the critic cadence and the final bar
- **Blind clip-vs-clip every round, every area** (the brief's loop rule, lapsed since render r8): each render,
  physics, tracks or audio round ends with `harness/compare` pairs judged by a fresh critic; the verdict and
  the named tells are the first lines of the next brief. The parent does not commit a round without them
  once RoG H5 is live.
- **"Change approach when an area stops improving"**: two consecutive rounds with the same tell = the next
  round is a different approach (a new owner brief, a new technique, or the reference re-read), never a
  third polish pass.
- **The final bar ("absolutely wowed") lives in `docs/mission.md` §1.** This plan's done line is the proxy:
  the 38-pair battery (24 manoeuvres × biomes, 8 world, 6 audio) is *run* at v0.2.0 and its number recorded
  in `RELEASES.md` with the named tells; v0.2.0 pins at H5's ≥ 2/6 on hero pairs.

### P3 amendments — the owed hard/extreme design and desktop proof
- Tracks r7 listed what it still owes to the storyboards: H1 roof climbs + scaffold-tunnel drop, H3 second
  tunnel row, X1 summit cap probe, H2 apron jump, the eight §5 validators. They are P3 items, not notes.
- **Desktop is a target too** (the brief): the e2e suite gets a keyboard flow (title → run → crash → restart
  → finish → results → next) and a gamepad flow at 1280×720 and 1920×1080; the ship gate runs it.

### G-side numbers the brief mandates (added to Rider on Glass G5)
- **Fast loads, measured on the device**: cold boot to the menu ≤ 4 s on LTE (the loader's own clock), warm
  ≤ 1.5 s, track entry ≤ 1.0 s with no black frame (render r14's `entryMs`), reported by `?bench=1`.
- **Bounded memory on iOS**: JS heap ≤ 120 MB steady, GPU textures ≤ 96 MB high / 40 MB low, no growth over a
  10-minute session (the gate's 60 s row extended to 600 s once a week), no Safari reload from memory pressure
  in a stranger-length session on the device.
