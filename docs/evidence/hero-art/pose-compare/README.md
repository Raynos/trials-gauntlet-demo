# Ask 51 — the prototype garage vs the game garage (pose owner, round 1)

**Finding.** The skeleton is the same file; the *driver* is not. The prototype played Astra's authored `sit_cruise`
straight from the glb. The game (cb9ab93) posed the rider everywhere — garage included — from physics + IK:
`riderRigFromCOM` puts the hips where the mass map lands the R8 *standing* servo target (the frozen spawn body,
`relX −0.120 / relY 0.604`, torso 40°), which is 15.6 cm behind and 3.5 cm above the authored seated hips; the two-bone
arm IK then reaches the grips from that far-back shoulder with its fixed forward/up/out elbow pole, so the elbows end
2.5 cm below the shoulder joint (authored: 29 cm below) and the upper arm sits 136° off the torso line (authored 52°).
Elbow *bend* was never the problem (89° vs 84°); elbow *placement* and the torso/hips were. Physics R9 already exports
a seated drawn table (`riderBody.drawn`, hips −0.34 / 0.715) but nothing in render reads it (`frame.ts` drops it).

**Fix (this round).** On the garage stage `GltfRider` plays `sit_cruise` whole (`setStage(true)`): every bone's
authored local rotation and translation, no physics stance, no IK. The authored hands are on the delivered grips to
**0.014 / 0.016 mm** and the soles on the pegs to **0.1 / 0.0 mm** by authorship alone — nothing to correct. Leaving
the stage, the physics pose blends out of the held clip pose over 250 ms of simulated time (the menu's frozen frame
holds the seated pose; the countdown's first 15 frames finish the blend; a track-load cut does not drop it).

## Bone-angle table (rider-street-mustard.glb, axle frame; degrees / cm)

`npx tsx docs/evidence/hero-art/pose-compare/measure.mts [outfit]` — the authored clips evaluated with `AnimationMixer`
on the loaded skeleton, the game rows from `GltfRider.update` on the b1 rookie spawn state (menu phase: physics never
steps, so this IS the garage frame). Elbow = angle at the elbow (180 = straight); shoulder = upper arm vs the
shoulder→pelvis line; hip = neck→pelvis→shin; elbowUp = elbow height above the shoulder joint; grip / sole = socket
distance to the bike's grip / peg-top; torso = pelvis→neck above bike-forward.

| pose | elbow | shoulder | hip | knee | elbowUp | torso | head | hips x / y | grip | sole |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`sit_cruise`** (authored, any t — a static hold) | 83.8 | 51.8 | 84.0 | 95.1 | **−29.2** | **51.7** | 70.0 | **−31.0 / 71.8** | 0.0 | 0.0 |
| `forward_attack` t=2.25 | 70.1 | 39.8 | 86.1 | 114.4 | −21.8 | 36.1 | 65.0 | −22.8 / 83.4 | 0.0 | 0.0 |
| `hang_back` t=2.25 | 160.1 | 83.5 | 82.1 | 108.4 | −21.8 | 58.2 | 79.1 | −50.0 / 71.0 | 0.0 | 0.0 |
| `compression` t=2.25 | 59.8 | 54.4 | 69.0 | 108.0 | −26.9 | 32.0 | 58.0 | −35.7 / 77.9 | 0.0 | 0.0 |
| `extension` t=2.25 | 129.6 | 48.0 | 115.5 | 150.1 | −29.8 | 48.0 | 72.0 | −21.3 / 94.5 | 0.0 | 0.0 |
| `landing_absorption` t=2.25 | 66.2 | 57.5 | 69.8 | 107.3 | −28.1 | 35.0 | 60.0 | −37.6 / 76.9 | 0.0 | 0.0 |
| bind pose | 82.4 | 117.1 | 86.6 | 118.0 | −11.3 | 40.0 | 66.0 | −29.5 / 83.7 | 0.0 | 0.0 |
| **game garage, physics + IK (cb9ab93)** rookie = pro | 89.2 | **135.6** | 69.7 | 112.0 | **−2.5** | **40.0** | 66.0 | **−46.6 / 75.3** | 0.0 | 0.0 |
| **game garage, this round** (`setStage(true)`) | 83.8 | 51.8 | 84.0 | 95.1 | −29.2 | 51.7 | 70.0 | −31.0 / 71.8 | 0.001 | 0.01 |

L and R are identical in every row (the clips are symmetric; the IK is mirrored). Every authored clip keeps the hands
on the grips and the soles on the pegs to 0.0 cm at every frame — the delivery's "socket-offset variation below
2.3 µm" holds on the loaded file. `sit_cruise` moves no joint over its 1.967 s (0.000 mm), so "loop" = "hold".

## Stills

`npx tsx docs/evidence/hero-art/pose-compare/still.mts` (built `dist/`, headless Chromium / SwiftShader, 1280×720,
quality high, Mustard barehead, same orbit camera for both game stills):

- `side-by-side.png` — prototype `sit_cruise` | game garage on the physics + IK driver | game garage on `sit_cruise`.
- `hero-crop.png` — the two game stills cropped to the hero: left the shipped driver (elbows at the shoulder line,
  torso flat, hips back), right this round (seated, elbows down and in, relaxed hands).
- `garage-physics.png` / `garage-sit-cruise.png` — the full frames; `iphone-game-garage-cb9ab93.png` the user's
  iPhone shot of the shipped build; `prototype-garage-sit-cruise.png` / `prototype-neutral.png` the prototype.

Posed stills, not played: the garage is static by construction. The played clip is round 2's (`pose-r1/`).

## Step 3 — in level: the authored stances are the base, IK the correction

`gltfRider.ts poseFromStance` (physics path, whenever `riderBody.drawn` reaches the frame — `frame.ts` now carries R9's
drawn pose: stance id, blend, hip height, torso): seated → `forward_attack` / `hang_back` (their 1.5–2.0 s holds) by the
drawn blend, then toward `landing_absorption`'s absorbed hold by the suspension load (`LAND`) and `extension`'s by the
body's rise (`EXTEND`) — every intermediate a slerp between authored on-grip poses, authored translations included. The
physical body's excursion against the drawn table (hips ±12 cm, torso ±20° clamps) rides on top, reach-limited by the
existing bisection, then the two-bone IK puts the sockets on the grips / pegs with the blended pose's own elbow / knee
as each pole. Without a drawn pose (v1 / mock physics, an injected body) the mass-map path is unchanged.

`npx tsx docs/evidence/hero-art/pose-compare/trace.mts --label=before|after` — the real physics through both b1 goldens,
measured from the posed joints in the bike frame (`trace-before.json` = cb9ab93's driver, `trace-after.json` = this):

| golden | grip socket peak (tick) | ticks > 2 cm | `wristErr` peak (tick) | elbow max | ticks ≥ 175° | elbow above shoulder (max, ticks) | reach-limited ticks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rookie before | **16.8 cm** (4724) | 1076 / 4867 | 16.8 cm (4724) | 180.0° | 1146 | **+15.3 cm**, 3747 | — |
| rookie after | **0.0 cm** | 0 | 0.0 cm | 168.5° | 0 | −17.6 cm, 0 | 33 |
| pro before | **14.6 cm** (1518) | 1137 / 4556 | 14.6 cm (1518) | 180.0° | 1181 | **+14.1 cm**, 2642 | — |
| pro after | **0.0 cm** | 0 | 0.0 cm | 168.5° | 0 | −16.7 cm, 0 | 30 |

Soles 0.0 cm both before and after. After: the stance id / blend follows the lean (rookie 438 back : 48 forward rows,
torso 31.5–66.9°, elbow 59.7–168.4°), the excursion runs to its clamps (dy −0.12…+0.08 m, lag −0.19…+0.35 rad), the
extension blend reaches its 0.7 cap in the air, the reach limit engages on 0.7 % of ticks. `pnpm harness:hero-webkit
--engine webkit --harness`: reach error 11.4 cm @ tick 420 before → 0.0 through the golden after, PASS; determinism
D1–D8 PASS (the rider is render-only). `ride-crops-b1-t300-560.png`: five frames of `harness:clip b1-first-ride
--from-tick 300 --to-tick 560` (the old worst window) cropped to the hero — seated on the flat, hanging back with bent
elbows through the wheelie. The played phone-geometry clip is the harness owner's `pose-r1/`.

### Round 2 — the seated stance is the base on the flat

The played `pose-r1` clip showed `back` on 90 % of rookie frames and no `sit_cruise` in level. Cause, in numbers: the b1
bot holds input lean −63/127 on 53 % of the rookie golden's ticks and −127 on 24 % (pro 31 % / 27 %), so physics R9's
drawn id is `back` on 90 % of frames and within 0.125 of seated on 11 % — the table never says "seated" on a flat
run-in because the bot is leaning there. But at half lean the drawn hips (x −0.52) are still ON the seat (`DRAWN_SEAT`
rear edge −0.54): the table's blend is a lean, not a stance. The render now weights the stance by how far the drawn
hips are off the seat (`gltfRider.ts stanceWeight`): `back` = x behind the seat's rear edge up to the full back row
(leaves the seat at lean 0.556), `forward` = the rise above the seated hip height past 3 cm up to the forward row; the
excursion (`dy`, `lag`) still reads the raw table. No `src/physics` edit; hashes unchanged (render-only).

| golden | seated (weight < 0.2) all ticks | flat ticks (both wheels down, \|angle\| < 6°) seated | transitions (0 < w < 1 runs) | within 30 ticks (250 ms) | median | longest |
| --- | --- | --- | --- | --- | --- | --- |
| rookie | 69.3 % | **75.2 %** of 484 | 69 | 65 | 11 ticks | 77 ticks |
| pro | 54.7 % | **64.5 %** of 366 | 66 | 56 | 12 ticks | 140 ticks |

The render adds no lag (the weight is a memoryless function of the frame); the long runs are the physics body held
mid-travel by the bot's alternating 15-tick lean pulses. Step-3 bars unchanged (grip 0.0 cm, elbow ≤ 168.5°, always
≥ 16.9 cm below the shoulder, reach-limited on 16 / 14 ticks). `ride-crops-b1-t640-780.png`: the flat run-in — seated
on the seat with bent elbows, rising forward / hanging back only at the lean pulses.
