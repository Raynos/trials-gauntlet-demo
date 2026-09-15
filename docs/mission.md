# Mission — the bars that are never "done"

`README.md` is the brief. The plans in `docs/plans/` are ladders with measurable rungs; each can be
completed and archived. This file holds the bars the brief sets that no plan can honestly close with a
checkbox — they are directions, judged by evidence every round, and the plans carry the *proxies* we can
measure. When a plan line says "the bar lives in mission.md", this is what it means.

## 1. Wowed against the real thing
*Brief:* "Don't stop until you are absolutely wowed when compared with the actual Trials game."
Trials Rising is a studio product with years of hand-made art, animation and audio; ours is generated
by scripts and judged blind. The bar is a blind critic preferring ours **as often as the reference** on the
38-pair battery (24 manoeuvres × biomes, 8 world, 6 audio). The plans' proxy: the battery is *run* every
release and its number *recorded and rising*; v0.2.0 pins at hero pairs ≥ 2/6, and every round's brief opens
with the last verdict's tells.

## 2. PS4 Trials Rising picture, every frame, every tier
*Brief:* "PS4 graphical quality of the latest Trials Rising… every single thing AAA."
The proxies (luminance / saturation / detail-density in band per biome, 20–50 lit props in frame, contact
shadows, camera box, the recipe propagated to all five biomes) can all be green while the picture still
reads as a demo — exteriors that are a ramp on a floor, a rider that is a textured tube. The direction is
the reference two-up; the honest statement of distance is written in `rendering.md` §12 each round.

## 3. The hero is a person on a motorbike
*Brief:* separate masses, weight-shift, a rider you read. A script-built skinned mesh will not match a
sculpted, mocapped rider. The proxies: no flat colour at riding distance, hands on the grips to the
centimetre through every manoeuvre, every visible motion driven by physics state (the H2 table), the
critic's tells no longer naming the rider. The bar: a critic cannot say which rider is the game's.

## 4. 60 fps on a phone at the quality the desktop shows
*Brief:* "60 fps, fast loads and bounded memory are MANDATORY." Three.js in Safari on a phone GPU has a
fill-rate floor; a 2500×1150 HDR post chain will not hold 60 on a 2021 phone. The plan (`PERF.md`) climbs
a measured ladder — bench, cost model, cuts in factor order — and its rungs are honest numbers: 60 on the
tier a phone runs by default, then `medium`, then `high` *redefined* as what a phone can hold at 60 with the
desktop's look kept where it costs nothing. The bar — the desktop `high` frame at 60 on the phone — stays
here until the ladder reaches it.

## 5. Sound that could be a recording
*Brief:* "sound" in the AAA list. Ours is synthesised at runtime, deterministic, from physics state; the
reference is a recorded single-cylinder engine mixed by a studio. The proxies (P6): retuned to v2, crowd,
per-biome room, stingers, music, a blind audio A/B recorded each release. The bar: the A/B cannot tell.

## 6. Fun
*Brief:* "fun factor and total cohesion." Attempts-to-clear in band is the only number we have; it measures
frustration, not joy. The proxy is strangers *finishing and coming back for the next tier* in the protocol;
the bar is the user wanting one more go at midnight. Nobody archives this line.

## How this file is used
- A plan may cite a mission line as its bar and carry only the proxy as its done line.
- Every release note (`RELEASES.md`) states, per mission line, the current number and its direction.
- Nothing in this file moves to `project/archive/`.
