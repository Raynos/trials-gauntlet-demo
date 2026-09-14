# Frame analysis of the reference corpus (30 fps)

**Revision note (read first).** Two independent readings exist. §1–§6 are the architect's by-eye readings
from numbered contact sheets; **§7 is the frame-analysis sub-agent's report, verbatim**, made with a
ring-template wheel tracker, camera-pan removal against static world patches and a duplicate-frame audit.
Where they conflict, **§7 wins** (it is the finer measurement) and the conclusions in
`trials-bike-physics.md` §5–6, `physics-audit.md` §2.6 and `physics-v2.md` §14.2 have been updated to it.
The material corrections are:

1. Clips 01/02 are effectively 15 fps material (every other frame duplicated); clip 02 freezes at f143 and
   clip 03 freezes for 3.2 s (f77–172) — the "4 s rear-wheel balance" in `reference/notes/techniques.md`
   is a frozen frame; the live balance is ≈ 0.9 s at ≈ 30–45 deg true pitch.
2. Clip 01 is **not** a rear-wheel hop onto a 0.9 m ledge. Stabilised against the D2 plaque, the plank is
   level with the container top; the move is a rolling (1.4–2.4 m/s) front-wheel lift after a 0.7 s crouch
   and a 0.4 s extension, with the rear wheel unsupported for ≤ 0.27 s and rising ≤ 4 cm. The architect's
   "0.9 m in 0.43 s → g = 9.81" reading in §1 was an eyeball error in depth and is **withdrawn**.
3. Clip 07: rear-off → front-on **0.62 s**, touchdown **front-first and level (−5 deg screen)**, rear
   4–5 frames later, no bounce — not "rear-first at 30 deg nose-up, 1.0 s" (that description fits the
   seesaw clips).
4. Clip 04 contains one full rear-wheel hop: 0.33 s pre-load, **1.1 s airtime**, rear axle rising
   ≈ 1.6–2.3 m (scale ±25 %, pan correction ±35 %) at a constant 55–63 deg pitch; the rear keeps rising for
   ~30 frames — the sub-agent notes a ballistic body cannot do that, so either the scale/pan correction is
   off by ~2× or the game applies lift after take-off. **Open question** (§7 F, and `trials-bike-physics.md`
   §9).
5. Wheelie correction cycle in clip 14 is 0.8–1.0 s, not 1.5–2 s; sustained band ≈ 40–50 deg screen.
6. Gravity: no clean g comes out of the corpus. Clip 18 (timer-verified 2.13 s drop-in) is consistent with
   9.81 given a ~9 m/s vertical launch; the two Rising hop events read 3–4 m/s² *if* treated as ballistic,
   which they visibly are not. Design decision (9.81, hop as a force profile over ≈ 0.4–1 s) stands; see
   `physics-v2.md` §9.5.

---


Source: `reference/techniques/clips/*.mp4` (720p, 29.97 fps, University of Trials lessons in Trials Rising
unless stated). Frames extracted with ffmpeg at native rate, 0-based from the start of each cut; 1 frame =
33.4 ms. Contact sheets used for the readings are in `docs/research/frames/` (clip 01 frames 96–140, clip 07
frames 126–170) and the scratch zooms `zoom_c01.jpg` (104–131) / `zoom_c02.jpg` (76–103). Scale: the wheel
diameter in these clips is taken as 0.68 m (r 0.34, CONTRACT) and the wheelbase as 1.30 m; pixel readings are
by eye on 400-px-wide crops, so lengths are ±0.1 m and angles ±5 deg. Timing is exact to ±1 frame. Readings
marked **[A]** are the architect's own; the sub-agent's finer tables, if delivered later, are appended in §7.

## 1. Clip 01 — ledge hop out of a wheelie (D2 zone, Bunny Hop lesson 7) — SUPERSEDED by §7 §2a (rear pop ≤ 4 cm, not 0.9 m)

| frame | t from 104 (s) | what is seen | pitch (deg) |
|--|--|--|--|
| 96–104 | −0.27…0 | rolling wheelie along the plank toward the container; rider hang-back, arms straight, front wheel ≈ 0.5 m up | 35–40 |
| 105–110 | 0.03–0.20 | front wheel arrives over / on the container's top edge (the front is *placed*, not flown); rider sinks lower (hips drop ≈ 0.2 m), rear still on the plank — the **load** | 38–42 |
| 111–113 | 0.23–0.30 | deepest crouch; bike pitch at its maximum; rear spring visibly compressed | ≈ 42 |
| **114** | 0.33 | **rear wheel leaves the plank**; rider beginning to extend (hips rising, elbows bending forward) | 40 |
| 115–119 | 0.37–0.50 | rider extends to standing (helmet ≈ 0.5 m higher than at 113 by 119); bike rotates nose-down about the planted front wheel while the rear rises | 40 → 20 |
| 120–123 | 0.53–0.63 | rear wheel at its highest, level with or just above the container top; rider fully tall, bike ≈ 15 deg | 15–20 |
| 124–126 | 0.67–0.73 | rear descends onto the container top | 12–15 |
| **127** | 0.77 | **rear wheel touches** the container top | ≈ 10 |
| 128–131 | 0.80–0.90 | rider absorbs (hips down ≈ 0.15 m over 3 frames), rides on; front wheel still light | 5–10 |
| 138–140 | | zone flame jets (D2 cleared) | |

Derived **[A]**:

- Load (rider dropping) 105 → 113: **8–9 frames ≈ 0.27–0.30 s**. Extension (snap) 113 → 119: **6 frames ≈
  0.20 s**. Rear airtime 114 → 127: **13 frames ≈ 0.43 s**.
- The front wheel never flies: it is on the ledge edge from ≈ 110. This is the *front-first* ledge hop
  (R§4.3 step 5): the rear rises ≈ **0.9 m** from plank surface to container top (≈ 1.3 wheel diameters).
  Decomposed: rotation about the front contact from ≈ 42 to ≈ 15 deg lifts the rear by L(sin 42 − sin 15) ≈
  1.3 × (0.67 − 0.26) ≈ **0.53 m**; the rest (≈ 0.35–0.4 m) is COM rise from the leg push and the spring.
- **Gravity check:** a rear wheel that leaves at 114 and arrives at 127 having risen ≈ 0.9 m and stopped
  rising (it settles on the top rather than bouncing) fits ½ g t² = 0.91 m at **g = 9.81** for t = 0.43 s.
  At 13.7 m/s² (v1's 1.4 g) the same flight would have risen 1.27 m — half a wheel diameter more than the
  container is tall. The corpus is at Earth gravity.
- Rider pose sequence: hang-back → deep crouch (load) → full extension (arms bent forward, legs straight)
  at the rear's apex → absorb → attack.

## 2. Clip 02 — the same hop, landed short (76–103)

| frame | what is seen |
|--|--|
| 76–79 | wheelie along the plank, ≈ 35 deg, hang-back |
| 80–86 | source-video dissolve (editing) — unreadable |
| 87–89 | rider crouched low, front high (≈ 45 deg), rear on the plank — the load |
| 90–95 | rider extends; rear wheel lifts a few cm to ≈ 0.15 m off the plank; bike stays ≈ 40–45 deg |
| 96–98 | rear back on the plank; rider crouched (absorbing); front still up |
| 99–103 | wheelie continues, rider resets |

**[A]** Rear off ≈ 90 → 96: ≈ 6 frames ≈ 0.2 s → symmetric flight apex ≈ ⅛ g t² ≈ **0.05 m** (rear barely
lifted). Difference from clip 01: the front was not on the ledge (no fulcrum), the extension was slower and
shorter (rider never reaches full standing height), so the rear rise came from the COM push alone. This is
the "late/weak snap = small hop, not a crash" behaviour the design requires (§14.3).

## 3. Clip 07 — uphill landing (Uphill Landing lesson 6), 126–170 — SUPERSEDED by §7 §5a (0.62 s, front-first, level)

| frame | what is seen |
|--|--|
| 126–132 | climbing the launch plank, rider standing, throttle blips (exhaust puffs) |
| ≈ 133–134 | **take-off** from the plank's lip; pitch ≈ 25–30 deg (the plank's angle plus a little) |
| 135–147 | flight; camera pulls back; bike pitch drifts up slightly then holds ≈ 30 deg; rider legs extended, body neutral |
| 148–160 | descent; bike ≈ 30 deg nose-up relative to the *landing* plane (which itself slopes up ≈ 15–20 deg) |
| ≈ 162–164 | **rear wheel touchdown** on the D1 plank; front drops over ≈ 9 frames |
| 165–170 | rides up the plank; zone pyro |

**[A]** Airtime ≈ 29–31 frames ≈ **1.0 s** (notes obs 10 agree). Landing is rear-first with ≈ 30 deg between
the bike and the landing plane. With a 1.0 s flight and an uphill landing a few tenths of a metre above the
lip, the launch's vertical speed is ≈ 5 m/s (≈ 1.2 m apex) — a launch speed of ≈ 9–10 m/s at 30 deg. No
heavy-gravity scaling is needed to get "≈ 1 s of air off a small plank": 30 deg at 10 m/s at 9.81 does it.

## 4. Clip 03 / 04 — rear-wheel balance and hops — SUPERSEDED by §7 §3 (clip 03 is a freeze-frame after f77; clip 04 has one 1.1 s hop)

- Balance (03): 65–75 deg for ≈ 4 s, ± 5 deg wobble, ≈ 1 s period, corrections by visible fore/aft body
  motion; rear spring compresses on each small landing.
- Pole-top hops (04): cadence ≈ 0.7–1.0 s per hop; each hop is a crouch–extend of the rider with the bike
  held at ≈ 60–70 deg; hop height ≈ 0.2–0.3 m, distance ≈ 0.8–1.2 m.

## 5. Clips 13 / 14 — wheelie

- 13: front lifts within ≈ 9 frames (0.3 s) of GO; the rider is already hang-back at GO.
- 14: 30–45 deg at 4.1 m/s (HUD distance/time), correction cycle 1.5–2 s, visible body corrections, throttle
  steady (no puff bursts).

## 6. What the numbers pin for the design — SUPERSEDED: see the revision note and `physics-v2.md` §14.2

| quantity | corpus | design target |
|--|--|--|
| gravity | consistent with 9.81 (clip 01 rear flight; clip 07 airtime vs plank angle) | 9.81, no scale |
| load duration (lean-back crouch) | 0.27–0.30 s | pose target 3 m/s → 0.1 s, body + spring settle ≈ 0.25 s |
| extension (snap) duration | ≈ 0.20 s | target 0.12 s + servo lag ≈ 0.2 s |
| rear flight, ledge hop with the front planted | 0.43 s, ≈ 0.9 m rise (≈ 0.5 m of it rotation about the front) | rolling hop onto a 0.9 m ledge at 5 m/s "makeable" |
| stationary flat hop | not in the corpus (the lesson hops all use a lip or a wheelie) | 0.45–0.65 m rear, both-off 0.35–0.6 s — inferred, to be revisited when a flat-ground clip is sourced |
| weak/late hop | ≈ 0.05 m, no crash | proportional-failure test |
| kicker flight | ≈ 1.0 s off a ≈ 30 deg plank at ≈ 10 m/s | 30 deg / 1 m kicker at 10 m/s: 0.9–1.2 s |
| landing attitude | rear-first, ≈ 30 deg to the landing plane, front down in ≈ 0.3 s | rides away −20…+40 deg |
| rear-wheel balance | 65–75 deg, corrected by body motion | 45–75 deg reachable with lean −0.5…−1 |

## 7. Sub-agent frame tables (verbatim)


# Trials frame analysis — reference/techniques clips 01–18

All frames were extracted natively (`ffmpeg -i clip.mp4 f%04d.png`, no fps filter, so frame N = N/29.97 s = N × 33.37 ms) into `/private/tmp/claude-501/…/scratchpad/physarch/frames/cNN/`. Contact sheets and overlays (JPG) are in the same directory; the ones I actually judged from are named in each section. Wheel centres were located with a ring-template matcher on a darkness map (`ring.py`, `pair.py`) and cross-checked by eye on 25-px-gridded crops; camera pan was removed by block-matching a static world patch (`stab.py`, `cam.py`). Where a tracker locked onto the wrong object (rider's helmet in clip 03, pole tops in clip 04) I say so and give the by-eye reading instead.

## 0. Frame-rate and source artefacts (important before trusting any timing)

| clip | native frames | duplicated-frame pattern (`dup.py`, mean abs diff < 0.15) | consequence |
|---|---|---|---|
| 01 | 225 | `D.D.D.` every other frame from f5 on | source is effectively **15 fps** — every measurement below has ±1 native frame (±33 ms) quantisation, real step = 66.7 ms |
| 02 | 210 | f1–16 frozen, f19–79 frozen (61 frames = 2.0 s), f80–142 15-fps pairs, **f143–209 frozen** | the "hop at +3.0 s" in the manifest does not exist in the clip; only the approach and the first 16° of front-wheel lift are live (f80–143). |
| 03 | 210 | live f0–76, **f77–172 frozen (96 frames = 3.2 s)**, live f173–209 | the "4 s rear-wheel balance with ±5° wobble" in techniques.md is a freeze-frame. Live balance is ≈ f38–64 (0.9 s). |
| 04 | 195 | `..D.D` — 2 of every 5 frames duplicated (≈18 fps source) up to f149; clean after the hard-cut reset (~f150) | ±1–2 frame quantisation |
| 05, 06, 12, 13, 14, 18 | — | no duplicates | true 30 fps |
| 07 | 195 | 7 isolated dups in f4–40 | fine |
| 18 | 225 | none; **in-game timer visible**: f0 = 01:28.466, f4 = 01:28.600, f8 = 01:28.733, f58 = 01:30.400, f66 = 01:30.666 | confirms 33.3 ms/frame exactly (game runs the timer at 30 Hz steps) |

## 1. Pixel scales used

| clip | wheelbase px (axle-axle, screen) | ring radius px (tyre annulus centre) | scale adopted | check |
|---|---|---|---|---|
| 01 | 273 (f61) → 232 (f103) → 206 (f131) — camera zooms out ~25 % over the hop | 61 → 52 → 49 | 1.35 m / 232 px = **5.8 mm/px at f103**; tyre Ø 0.65 m / (2×58 px outer) = 5.6 mm/px — consistent | wb/r_ring = 4.5 |
| 02 | 267 (f109) → 232 (f141) | 59 → 53 | 5.5 mm/px | same track, same camera |
| 03 | 250–300 (by eye, tight cam) | ~60 | ≈ 5 mm/px | |
| 04 | not measurable (front wheel leaves crop) | 16–18 (outer ≈ 22–24) | 0.30 m / 17 px ring-r = **17.6 mm/px** (scaled from clip 01's r_ring ↔ 0.30 m) | ±25 % |
| 07 | ~110 (f130s), then camera pulls back | 14–22 | 12 mm/px on the plank, ≈ 20 mm/px at apex | zoom changes 2× during the jump |
| 13/14 | ~160–190 | 28–39 | ≈ 8 mm/px | |
| 18 | ~55–90 (bike silhouette length) | 10–18 | ≈ 15–25 mm/px, zoom varies | timer used instead of pixels |

Screen pitch = atan2(rear_axle_y − front_axle_y, front_x − rear_x). The camera has ~15–25° yaw and ~20° down-pitch, so a **world-horizontal surface appears at ≈ +9° screen slope** in clips 01/02 (the bike at rest on the container top reads 9.0–9.7°). "True" pitch in clips 01/02 ≈ screen pitch − 9°.

## 2. A — Bunny hop (clips 01, 02, 12)

### 2a. Clip 01, rear/front axle track (screen → world via plank-patch stabilisation; `c01_world.json`, sheets `t01.jpg`, `gap01.jpg`, `w01_d2.jpg`, `v01.jpg`, `a01_late.jpg`)

| frame | t (s) | rear axle world (x,y) | front axle world (x,y) | wb px | screen pitch ° | rear above plank-line px | note |
|---|---|---|---|---|---|---|---|
| 61 | 2.04 | 185,412 | 456,376 | 273 | 7.6 | +0.9 | rolling, rider neutral standing |
| 73 | 2.44 | 254,403 | 513,366 | 262 | 8.1 | −0.8 | rider starting to crouch |
| 85 | 2.84 | 368,385 | 607,344 | 243 | 9.7 | −0.5 | crouch deepening (helmet at bar height) |
| 91 | 3.04 | 433,374 | 671,333 | 242 | 9.8 | +0.5 | **deepest crouch** f91–101 |
| 95 | 3.17 | 478,368 | 711,321 | 238 | 11.4 | −0.5 | **front lift starts** (pitch leaves 9–10° baseline) |
| 99 | 3.30 | 518,361 | 747,306 | 236 | 13.5 | +0.3 | |
| 103 | 3.44 | 561,354 | 784,291 | 232 | 15.8 | +0.6 | rider extending, hips back |
| 107 | 3.57 | 603,348 | 818,273 | 228 | 19.2 | +0.1 | arms straight |
| 111 | 3.70 | 645,342 | 856,254 | 229 | 22.6 | −0.4 | rear tyre still on plank |
| 113 | 3.77 | 670,338 | 876,247 | 225 | 23.8 | −0.2 | rear tyre at plank end |
| 117 | 3.90 | 720,328 | 921,235 | 222 | 24.8 | +2.0 | |
| 121 | 4.04 | 773,317 | 971,225 | 218 | 24.9 | +4.8 | rear tyre passes plank end |
| 125 | 4.17 | 832,307 | 1023,212 | 213 | 26.4 | +5.7 | rear tyre over barrels (unsupported) |
| 129 | 4.30 | 896,297 | 1081,201 | 208 | 27.4 | +5.7 | **pitch max 27.4° screen (≈18.5° true)** |
| 131 | 4.37 | 929,289 | 1112,194 | 206 | 27.4 | +8.6 | rear tyre on container-top plank |
| 135 | 4.50 | — | — | 201 | 25.0 | — | **exhaust puff** f133–141 (throttle after rear touchdown) |
| 141 | 4.70 | — | — | 198 | 18.9 | — | front dropping |
| 153 | 5.10 | — | — | 194 | 9.2 | — | **front wheel down, bike level on container** (9° = screen horizontal) |
| 165 | 5.50 | — | — | 192 | 16.1 | — | next front lift begins |

Static-anchor check (`w01_d2.jpg`, locked on the D2 plaque, ssd 190–380 f117–133): rear axle y in D2-world = 385–392 for f117–125, then 398–400 for f127–133 — i.e. the rear wheel **drops ≈ 10 px (≈6 cm) between f125 and f129 and then sits**. Combined with the plank-line table (+5 … +9 px above the extended plank line) the rear wheel is unsupported for at most **f123–131 (≈ 8 native frames = 4 real source frames ≈ 0.27 s)** and never rises more than **≈ 6 px = 3.5 cm ≈ 0.05 wheel-Ø** above the plank line.

Derived numbers, clip 01:

| quantity | value | how |
|---|---|---|
| Bike speed when the move starts | 8.6 px/frame (f61–95) = **1.4 m/s**, rising to 14 px/frame = **2.4 m/s** at f113–131 (1.8 wheelbases/s) | world Δx, 5.8 mm/px |
| Stationary? | **No.** Rolling throughout; the plank is ~level in world (8.8° screen slope ≈ the 9° horizontal reference). | plank fit dy/dx = −0.155 |
| Crouch phase | f73 → f95 (22 frames, **0.73 s**) | rider helmet descends from ~y230 to ~y270 screen; deepest f91–101 |
| Front-wheel lift start | **f95** (pitch 11.4° vs 9.7° baseline) | |
| Snap / extension (crouched → standing tall, arms straight) | f101 → f113 (12 frames, **0.40 s**) | `t01.jpg` |
| Rear wheel leaves surface | **f123 ±2** (plank end; barrels visible under the tyre f125–129) | `v01.jpg`, `w01_d2.jpg` |
| Rear wheel touchdown | **f131 ±2** on container top | |
| Rear "airtime" | **≤ 8 native frames = 0.27 s** (probably 6) | |
| Peak rear height above take-off line | ≤ 6 px ≈ **0.035 m ≈ 0.05 wheel-Ø** (measurement floor ±3 px) | plank-line residual |
| Horizontal distance rear axle, take-off → touchdown | 929 − 802 = 127 px ≈ **0.74 m ≈ 0.55 wheelbase** | world table |
| Pitch at lift start / take-off / apex / rear touchdown / front touchdown | 11.4° / 25.9° / 27.4° / 27.4° / 9.2° screen → **≈ 2° / 17° / 18.5° / 18.5° / 0° true** | |
| Which wheel lands first | **Rear** (f131), front 22 frames later (f153, 0.73 s) | |
| Pitch rate during lift | 9.8° → 27.4° over f91–129 = 17.6° in 1.27 s = **14 °/s** (slow, controlled) | |
| Rider pose sequence | neutral (≤f71) → crouch (f73–101, helmet to bar height, elbows out) → extend back & up (f101–113, arms straight, hips behind seat) → tall/forward over bars (f113–131) → absorbs, stands with bent knees (f133–153) | |

**Interpretation:** what the manifest calls a "stationary bunny hop" is a rolling front-wheel lift ("manual up onto the ledge") at 1.4–2.4 m/s with, at most, a 3–4 cm rear-wheel pop across a plank/ledge junction. The 0.6 s airtime in techniques.md item 7 is not supported by the frames; the front wheel is in the air 0.6 s, the rear ≤ 0.27 s.

### 2b. Clip 02 (same D2 obstacle; `b02.jpg`, `pair02`)

| frame | rear axle (x,y) | front axle (x,y) | pitch ° screen | note |
|---|---|---|---|---|
| 93–127 | 175→269 , 414→400 | 447→507 , 368→359 | 9.4–10.2 | rolling at 5.5 px/frame (**0.9 m/s**), rider crouched from f109 (helmet at bar height, `b02.jpg`) |
| 129 | 273,402 | 512,358 | 10.4 | |
| 133 | 284,401 | 519,352 | 11.5 | **front lift starts** |
| 137 | 292,399 | 521,344 | 13.5 | rider extending |
| 141 | 297,397 | 520,333 | 16.0 | |
| 143→209 | frozen frame | | 16.0 | source video freezes here |

Clip 02 gives: pre-load crouch held ≥ 24 frames (0.8 s, f109–133) at 0.9 m/s roll; lift onset rate ≈ 6.5°/8 frames = **24 °/s**, faster than clip 01. No take-off or landing is visible.

### 2c. Clip 12 (`k12.jpg`, `s12b.jpg`, `pair12`)

f100–120: bike on a plank with a box ahead, screen pitch +2° (f118–120), rear axle (150±5, 600) not moving. f122–134: front wheel rises to the box top (front axle 158,450 → 114,480), pitch (by eye) ≈ 25–30°; rear axle stays on the plank. f136–140 pitch 27–28° with the front wheel resting on the box; f142–178 the bike sits on the box edge nose-down (−17° → −35°, rear rising up the box as the rider crawls over). **No rear-wheel hop in clip 12** — it is a front-wheel lift onto a box followed by a nose-down roll-over. The pair-tracker pitch values of 65–76° at f122–134 are a bucket + wheel false pair and must be ignored.

## 3. B — Rear-wheel bounce / hops (clips 03, 04)

### 3a. Clip 03 (`x03.jpg`, `v03.jpg`, `w03.jpg`)

Automatic front-wheel detection locked onto the rider's helmet (r≈35 px, dark, round) in every run, which is where the "70–85°" numbers came from. By-eye axle readings on 50-px grids:

| frame | rear axle (x,y) | front axle (x,y) | wb px | screen pitch ° | what is happening |
|---|---|---|---|---|---|
| 20 | ~300,470 | ~615,330 | 345 | ~24 | on plank edge, rider crouched hard (helmet below bar) |
| 24 | 330,445 | 590,355 | 275 | **19** | front just lifting off plank |
| 28–32 | 347→365 , 464→461 | (rising) | | ~30–40 | rear drops off the ledge onto the post/crate top, rear suspension compresses (rear axle y 464→450→461: 14 px = 8 cm dip and rebound over f28–32) |
| 36 | 453,488 | 647,253 | 305 | **50** | balance on rear wheel |
| 44 | 441,460 | ~680,275 | ~300 | ~38 | |
| 48 | 424,470 | 682,276 | 323 | **37** | |
| 52–56 | 429→437 , 472→493 | | | ~40–45 | the support (hanging crate) starts to move down |
| 60 | 453,494 | 600,294 | 248 | **54** | |
| 64–68 | 469→505 , 515→521 | | | ~55–60 | |
| 72 | 435,494 | 565,253 | 274 | **62** | falling forward-right off the support |
| 76 | ~500,510 | ~700,240 | | ~55 | camera widening, drop |
| 77–172 | frozen frame (rider on rear wheel ~55°) | | | | |
| 173–209 | bike dropping and landing off-screen bottom, camera wide | | | | |

Rear-wheel balance in clip 03: **screen pitch 37–55° (≈ 30–45° true), held live for ≈ f38–64 = 26 frames = 0.87 s**, drifting steadily nose-up from 37° to 55° (about +20°/s, i.e. the rider is letting it go past balance before dropping, not oscillating). No ±5°/1 s oscillation is observable in the live frames. The rear suspension dip at touchdown on the support is ≈ 14 px ≈ 7–8 cm, recovered in 4 frames.

### 3b. Clip 04 (`x04.jpg`, `e04.jpg`, `w04.jpg`, ring track + pole-plank stabilisation)

| frame | rear axle screen (x,y) | camera Δy (world→screen) | rear axle world y | rear tyre vs surface | pitch ° screen (by eye) | rider |
|---|---|---|---|---|---|---|
| 40 | 487,255 | −10 | 265 | on pole-1 top | 43 | crouched, elbows bent |
| 44 | 481,269 | −22 | 291 | on pole-1 top | 39 | |
| 48 | 477,279 | −29 | 308 | rolling/settling onto pole-2 white plank | 47 | |
| 52 | 474,296 | −47 | 343 | on pole-2 plank (tyre bottom 318, plank 320) | 56 | crouching (pre-load) |
| 56 | 475,305 | −71 | 376 | on plank, suspension compressed | 61 | deepest crouch |
| 60 | 477,301 | −112 | 413 | on plank | 62 | extending |
| **62±1** | | | | **rear wheel leaves plank** | | |
| 64 | 474,276 | −123 | 399 | 30 px daylight under tyre | 63 | arms straight, body tall |
| 68 | 468,247 | −144 | 391 | | ~63 | |
| 72 | 453,209 | −168 | 377 | | ~63 | |
| 76 | 445,189 | −177 | 366 | 40 px above an intermediate post top, no contact | | |
| 80 | 440,160 | −178 | 338 | | | |
| 84 | 427,129 | −179 | 308 | | | |
| 88 | 426,116 | −181 | 297 | | | |
| 92 | 426,102 | −182 | **284 (highest)** | | ~55 | |
| **95±2** | | | | **rear wheel lands on upper platform** | | |
| 96 | 427,119 | −179 | 298 | | | knees bent |
| 100 | 428,126 | −172 | 298 | rolling on rear wheel along platform | 37–39 (pair tracker f82–105 on the bike, consistent) | |
| 124–140 | | | | still on rear wheel on platform | 36–40 | |
| ~150 | hard cut to C1 | | | | | |

Hop cadence clip 04: only **one** complete rear-wheel hop is inside the live window (pole-2 plank → upper platform); the earlier move onto pole 2 (f44–52) is a roll-over, not a hop. Numbers for the hop:

| quantity | value |
|---|---|
| Pre-load (crouch) | f50 → f60 = 10 frames = 0.33 s, rear suspension visibly compressing (rear axle −4 px then +) |
| Take-off | f62 ±1 |
| Touchdown | f95 ±2 → **airtime 33 ±3 frames = 1.1 ±0.1 s** |
| Rear-axle rise, take-off → touchdown | 413 − 284 = **129 px world (199 px uncorrected screen)** = 2.9 ring-Ø ≈ 2.5 tyre-Ø ≈ **1.6–2.3 m** (scale ±25 %, camera-pan correction ±35 %) |
| Pitch during hop | 61–63° screen at take-off, held 55–63° in flight, 37–39° after landing |
| Rider motion | dip (f50–60) → full extension at take-off → tall/arms straight in flight → knees bend on landing (f96–100); one dip/extend per hop |

## 4. C — Climbs (clips 05, 06, 07)

| clip / frames | surface | surface angle (screen, from plank edge lines) | bike pitch rel. to surface | ground speed | rider pose |
|---|---|---|---|---|---|
| 05 f6–33 (`i05.jpg`) | curved quarter-pipe | 25–30° at f6–9 → ~55° at f15 → ~65° at f18–21 → ~75–80° at f24–30 (lip) | bike follows the curve (pitch ≈ surface +0…+10°, front wheel hovering off the surface f18–30) | whole transition f6→f30 (0.8 s) ≈ 3.5–4 bike lengths of arc → **≈ 4.5–5 m/s** (carried speed) | standing, chest over bars, arms bent |
| 05 f33–45 | lip → container top | | over the lip nose-down briefly (f33–36), lands on container top by f39–42 | | |
| 06 f0–40 (`s06c.jpg`, `s06a.jpg`) | near-vertical plank | ≈ 60–65° screen | bike ~ parallel to plank, front wheel 0–10 cm off it | stall: forward speed ≈ 0 at f8–14; **rolls back ≈ 0.6–0.8 wheelbase (f14–30, 0.5 s)** then the rider throttles again | rider hangs over the bars, elbows bent; during roll-back he stays forward, does not sit |
| 06 f100–200 (`j06_climb.jpg`) | long straight plank, camera widest | ≈ 42° screen | | rear axle world x: 712 (f100) → 762 (f120) → 853 (f135) → 1016 (f145) → 1071 (f175): mean **≈ 4.5 px/frame** at ~60 px wheelbase ≈ **2.2 wheelbases/s** early, slowing to ~1 wb/s (tracker noisy on the 14-px wheels) | standing tall over bars |
| 07 f0–140 (`s07_60.jpg`, `j07_climb.jpg`) | straight plank | **≈ 49° screen** (edge from (150,520) to (500,120)) | pitch ≈ 30° screen at f133–136 = plank angle −19° → with camera yaw the bike reads ≈ parallel-to-slightly-under the plank | plank length ≈ 4.8 wheelbases covered f0→f141 (4.7 s) → **≈ 1.0 wheelbase/s** average, in throttle blips (exhaust puffs ~every 25 frames / 0.8 s) | standing, hanging over bars |

## 5. D — Landings (clips 07, 18, 08)

### 5a. Clip 07 jump (`d07_launch.jpg`, `d07_land.jpg`, `v07.jpg`, `v07_166.jpg`, pair07)

| frame | rear axle (x,y) | front axle (x,y) | pitch ° screen | note |
|---|---|---|---|---|
| 133–136 | 271→276 , 484→476 | 363→369 , 429→423 | 30.9→29.7 | on plank, front wheel reaches plank crest |
| 137–141 | 279→285 , 469→446 | 372→380 , 421→410 | 27.3→**20.8** | front wheel past crest, bike pitching **nose-down 10° in 5 frames** as front unloads |
| 141 | | | | **exhaust puff (throttle at launch)** |
| **142 ±1** | 321,444 | 389,377 | ~28 | **rear wheel leaves plank crest** |
| 144–146 | 322→324 , 409→404 (r14, camera pulling back) | 370→373 , 350 | ~50 (tracker, foreshortened by zoom – unreliable) | camera pulls back for ~9 frames |
| 150–151 | apex region (camera widest, bike ≈ 60 px) | | | |
| 156–159 | 342→344 , 356→358 (screen, r16) | ~430,360 | ≈ 0 to −5 | **bike level, nose slightly down** |
| **160–161** | 265,423 (r32 after zoom-in) | 449,442 | **−5.9** | **front wheel touches D1 platform planks first** |
| 162–164 | 269→277 , 423→421 | 450→452 , 438→435 | −4.7 … −4.6 | rear coming down |
| **165 ±1** | 282,419 | 453,434 | −5.0 | **rear wheel down** |
| 166–171 | 287→317 , 417→413 | 453→463 , 432→423 | −5.2 → −3.9 | both down, no bounce; pitch change in first 10 frames after touchdown: **+2° (−5.9 → −3.9)**, i.e. essentially none |
| 172–176 | | | | camera zooms in; rider crouches (knees bent, chest down, `v07.jpg` f174–176) |

Summary clip 07: airtime rear-off → front-on **= 18–19 frames = 0.60–0.63 s**; rear-off → rear-on **23 frames = 0.77 s**. Pitch at take-off ≈ 21–28° screen (plank 49°, so ≈ 20–25° nose-down relative to the plank), pitch at touchdown **−5° screen, i.e. level to slightly nose-down; front wheel first, rear 4–5 frames later.** Suspension: no visible rebound; the bike settles within ~6 frames. Rider: standing/neutral at touchdown, then a visible crouch at f172–176 (0.3–0.5 s after). This contradicts techniques.md item 10 ("rear-wheel first, 30° nose-up"); that description matches the *seesaw* clips, not clip 07.

### 5b. Clip 18 drop-in (`h18_takeoff.jpg`, `h18_apex.jpg`, `h18_land.jpg`, `w18.jpg`, `s18c/d.jpg`)

| event | frame | timer | note |
|---|---|---|---|
| bike on platform edge, nose-up | 0 | 01:28.466 | rear tyre on edge at (≈235,430); front axle ≈ (455,340); pitch by eye ≈ 25–30° |
| rear wheel leaves edge | **2** | 01:28.533 | rear tyre below edge line |
| bike rising fast relative to background (camera tilts up 12 px/frame while bike holds screen y) | 4–10 | | large vertical launch velocity |
| apex (bike highest relative to stair line) | ≈ 28–34 | 01:29.40–29.60 | camera at widest |
| rear wheel touches tread | **65–66** | 01:30.633–30.666 | pitch at touchdown ≈ 35–45° screen (nose-up, `w18.jpg` f64–66) |
| front wheel down on tread | 69–70 | | bike rotates nose-down ~35° in 4–5 frames |
| settled on tread | 72 | | pitch ≈ 15–20° (tread itself slopes ~20° in screen) |

Airtime **64 frames = 2.13 s** (timer-verified). Rear first, front 4 frames later, no rebound visible at this resolution.

### 5c. Clip 08

Same jump as clip 07 (source 29.5–36.5 s overlaps 07's 26–32.5 s); the landing is at clip-08 f≈55–65 with the identical front-first, level attitude. Not re-measured separately.

## 6. E — Wheelie (clips 13, 14)

Clip 13 (`w13.jpg`, `f13.jpg`): numeral "1" visible f84–90, gone by f92 (fade ≈ 6 frames); **"GO!" first drawn at f102** (skill-game timer reads 0.016 at f102, i.e. the clock started at f101.5); tutorial strip removed on the same frame. Bike: pitch 5.0–5.7° f100–104 (level), 6.3° f104, 10.9° f106 → **front wheel visibly lifting at f106, 4 frames (0.13 s) after GO**; no crouch beforehand (rider already in the pre-set forward stance during the count). Front axle rises from y≈400 (f104) to ≈380 (f112) and the bike moves off at f110 (rear axle screen x 624 → 515 over f110–125 = 7 px/frame ≈ 6 px/frame world ≈ 1.6 m/s at 8 mm/px); pitch ≈ 20–25° by f116–128, ≈ 50° by f139–140 as speed builds.

Clip 14 pitch series (`g14.jpg`, `z14.jpg`; screen pitch from rear-ring vs red-front-wheel centroid; the red mask also catches the rider's red suit, which biases these **≈ +8° high** — by-eye values on `z14.jpg` are given in brackets where I checked):

| frame | 0 | 25 | 30 | 35 | 40 | 45 | 55 | 60 | 70 | 80 | 85 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pitch ° | 25 [28] | 64 [60] | 21 | 22 [25] | 29 | 33 | 40 | 47 | 54 | 38 | 58* |

| frame | 100 | 105 | 110 | 115 | 120 | 125 | 130 | 135 | 140 | 145 | 150 | 155 | 160 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pitch ° | 57 | 53 [45] | 56 | 61 | 60 [50] | 57 | 64 | 63 [50] | 62 | 58 | 51 [42] | 52 | 71* |

(* = rear detection doubtful.) Over the 4 s window f40–160 (n = 25 samples): **min 21°, max 64°, mean ≈ 50° (tracker) → ≈ 42° after bias correction; by-eye band 40–50° screen during the sustained part f95–160.** Visible corrections: front wheel nearly touches down at f85–90 (pitch → ~0, rider sits back hard, bike recovers to 45° by f95 — a 10-frame save); pitch peaks at f115–120 and f130–140 with troughs at f105, f125, f150: **correction cycle ≈ 25–30 frames (0.8–1.0 s)**, shorter than the 1.5–2 s in techniques.md. Rider corrections are lean (torso fore/aft ±15 cm on the seat) rather than throttle; I found no isolated exhaust puffs in clip 14 (the exhaust is continuously hazing while the throttle is held), so throttle modulation is not readable here. In clip 13 the exhaust haze starts at f108, two frames after the lift.

## 7. F — Effective gravity

| event | Δt (frames / s) | vertical extent | scale | g_eff | verdict |
|---|---|---|---|---|---|
| Clip 04 rear-wheel hop, take-off f62 → touchdown f95 (near apex, since y stops rising at f92) | 33 / 1.10 | rise 129 px world (199 px raw screen) = 1.6–2.3 m (pan-corrected) up to 3.5 m (uncorrected) | 17.6 mm/px ±25 % | **g = 2h/t² = 2.6–3.8 m/s² (corrected), ≤ 5.8 m/s² (uncorrected)** | far below 9.81 under any plausible scale; needs a known-length object to close |
| Clip 01 rear pop, f123 → f131 | ≤ 8 / 0.27 | apex ≤ 6 px ≈ 3.5 cm above line, touchdown 6 cm below take-off line | 5.8 mm/px | 8h/T² with h = 0.035 m, T = 0.27 s → **≈ 3.8 m/s²** (upper bound on h gives upper bound on g; asymmetric landing so ±50 %) | not inconsistent with clip 04 |
| Clip 07 jump, rear-off f142 → front-on f160 | 18–19 / 0.62 | launch and landing surfaces at ≈ same height (the D1 planks are ~level with the plank crest in `d07_wide.jpg` f142 vs f160); apex ≈ 1 bike length (≈ 1.3 m) above the crest by eye at f150 | 12–20 mm/px, zooming | symmetric hop: 8·1.3/0.62² = **27 m/s²** if apex really is 1.3 m; if apex is 0.5 m → 10 m/s² | apex height not measurable during the pull-back — inconclusive |
| Clip 18 drop-in, f2 → f66 | 64 / 2.13 | net drop ≈ 2 treads; tread height ≈ 1 bike height ≈ 1.1–1.3 m → Δh ≈ −2.5 m; bike is ≈ 2.5 m *above* the edge at f10 (0.27 s) | timer exact; heights from bike-length | v0 = (Δh + ½gt²)/t: with g = 9.81 → v0 = 9.3 m/s up and height at 0.27 s = 2.1 m (matches the f10 observation); with g = 4 → v0 = 3.1 m/s and height at 0.27 s = 0.7 m (does not match) | **consistent with g ≈ 9.8 only if the launch carries ~9 m/s vertical**, which the f4–10 frames do suggest (camera tilts up 12 px/frame) |

Bottom line for F: I cannot give one clean g. The two Trials Rising hop events (clips 01 and 04), measured against the bike's own wheel, both read **g_eff ≈ 3–4 m/s²**; the Trials Fusion drop-in (clip 18) is compatible with 9.8 m/s² given a very energetic launch, and clip 07 is undetermined because the camera zoom hides the apex. The physically likely reading is that Trials Rising's *rider hop* is not an instantaneous impulse: the rear wheel keeps rising at 3–7 px/frame for ~30 frames in clip 04 (velocity even *increases* f76–84), which a ballistic body cannot do — i.e. the game applies a sustained upward force/animation (rider extension + suspension release + pitch) over ≈ 0.5–1 s, and the bike itself may also be under reduced gravity. Do not tune g from these clips; tune the *hop force profile* to reproduce "rear wheel rises ≈ 2.5 wheel-Ø in ≈ 1.0 s at constant 60° pitch" (clip 04) and "0.6 s level flight over ~1.5 wheelbases with no nose drop" (clip 07).

## 8. Corrections to `reference/notes/techniques.md` implied by the frames

1. Item 7 (clip 01 stationary hop, 0.6 s airtime): bike is rolling at 1.4–2.4 m/s; front wheel lift 0.4 s snap after a 0.7 s crouch; **rear wheel airborne ≤ 0.27 s, ≤ 4 cm**; rear lands first, front 0.73 s later.
2. Item 8 (clip 03, 65–75° for 4 s with ±5° wobble): live balance is **0.9 s at 37–55° screen (≈30–45° true)**, drifting monotonically nose-up; f77–172 is a frozen frame. The 65–75° came from the helmet.
3. Item 10 (clips 07/08 rear-first, 30° nose-up): touchdown is **front-first, bike level (−5° screen)**, rear 4–5 frames later, no bounce.
4. Item 11 (wheelie correction cycle 1.5–2 s): pitch peaks recur every 0.8–1.0 s.
5. Manifest entries for clips 02 and 03 should note the source-video freezes (02: f19–79 and f143–209; 03: f77–172); clip 01 and 02 are 15-fps material.

## 9. Files (scratch only, nothing written to the repo)

`/private/tmp/claude-501/-Users-raynos-projects-game-demos-trials-gauntlet-demo/f8d5e168-4022-47f3-b796-362acd49ca35/scratchpad/physarch/frames/` — `cNN/f%04d.png` native frames for clips 01, 02, 03, 04, 05, 06, 07, 08, 12, 13, 14, 18; tools `sheet.py`, `stab.py`, `cam.py`, `ring.py`, `pair.py`, `viz.py`, `dup.py`; key evidence sheets `t01.jpg`, `gap01.jpg`, `w01_d2.jpg`, `v01.jpg`, `a01_late.jpg`, `b02.jpg`, `x03.jpg`, `v03.jpg`, `x04.jpg`, `e04.jpg`, `i05.jpg`, `s06c.jpg`, `j06_climb.jpg`, `z07a.jpg`, `v07.jpg`, `v07_166.jpg`, `d07_launch.jpg`, `d07_land.jpg`, `w13.jpg`, `z14.jpg`, `g14.jpg`, `h18_takeoff.jpg`, `h18_apex.jpg`, `w18.jpg`, `k12.jpg`; tables `c01_world.json`, `cam_*.json`.
