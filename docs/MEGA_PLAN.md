# The mega build — v0.1.0 → v0.2.0

Safety net: **v0.1.0** is pinned at https://trials-gauntlet-v0-1-0.vercel.app (tag `v0.1.0`,
`94ecb43`). Anything below that regresses feel or clearability is reverted, not argued with.

## Why (the outside review, distilled)

Every blind-compare loss named **motion**, not art. The world reads as a ribbon with boxes
outside the industrial hall. Only bots and slot-code strangers have ever ridden it, and hard /
extreme are shaped to appease the bot rather than designed. The physics carries three
honesty debts: 1.4 g, a 10× drag governor, and an ECU wheelie assist.

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
