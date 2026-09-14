# Blind A/B rubric — "which one looks like a shipped AAA trials game?"

You are the critic. You are given one manoeuvre tag, a side-by-side video and a
contact sheet. You do **not** know which side is ours and which is the reference,
and you must not try to find out. Judge motion, not art budget.

## What you are looking at

- `pair-<id>.mp4` — 1280x384 @ 30 fps. Two 640x360 clips side by side under a
  24 px label bar. **A is the LEFT half** (bar shows ONE white square).
  **B is the RIGHT half** (bar shows TWO white squares). A thin amber bar along
  the bottom of the label bar fills left-to-right as a clock (16 segments over
  the whole clip). There is no text; there is no audio. Both halves start at
  the same instant and have the same number of frames.
- `pair-<id>-sheet.jpg` — 2 rows x 8 tiles. **Row 1 (top) = A, row 2 (bottom) = B.**
  Column *k* in both rows is the *same frame index*, evenly spaced from the
  first to the last frame, so a timing difference shows as a column where one
  row has moved on and the other has not.
- Some pairs are HUD-masked (black strips at the top). Ignore the strips.
- Letterboxing (black bars) is normalization, not a quality signal.

## How to judge

1. Watch the mp4. You may extract frames yourself, e.g.
   `ffmpeg -i pair-<id>.mp4 -vf fps=10 f-%03d.png` or `-ss <t> -frames:v 1`.
   The clock bar tells you the time of any frame.
2. Score every criterion for the manoeuvre tag **and** every `general`
   criterion, 1-5 for A and for B (5 = indistinguishable from a shipped Trials
   title, 1 = obviously a prototype). Use the whole scale.
3. Decide the winner and how confident you are. `tie` is allowed.
4. Say, in motion terms, what most makes the weaker side read as not-AAA.
5. **Never read, open, list or guess at any `*.answer.json`.** Never mention
   "ours" / "reference" / engine names. Only A and B exist.
6. Answer with the JSON below and **nothing else** — no prose, no code fence.

## Output (exact shape)

```json
{
  "winner": "A" | "B" | "tie",
  "confidence": 0.0-1.0,
  "reasons": ["short, motion-specific observations with times, e.g. 'B rear wheel lands 3 frames before front (t=2.1s); A lands flat'"],
  "nonAAA": "what most makes the weaker side read as not-AAA, in motion terms (timing, weight, settle, camera, cut)",
  "criteria": {
    "<criterion-id>": { "A": 1-5, "B": 1-5, "note": "" }
  }
}
```

Integers only for scores. Include every criterion listed for the tag plus the
`general` set. A verdict with a bad shape is logged as `invalid`, which counts
against nobody — so get the shape right.

## Vocabulary

"Settle" = the damped oscillation after a load change (landing, tip, stop).
"Snap" = a rotation that reaches its target in 1-2 frames with no overshoot.
"Lag" = the rider body reaching a pose *after* the bike does. "Cut" = a hard
frame-to-frame scene change. "Motivated" camera = every camera move is caused
by something the bike did.

## Criteria by manoeuvre tag

### `general` — applied to every pair

| id | what a 5 looks like | what a 1 looks like |
| --- | --- | --- |
| `weight-and-mass` | Bike accelerates, pitches and stops like ~100 kg of metal plus a rider: nothing changes direction instantly; big inputs produce overshoot and recovery | Velocity or pitch changes in one frame; the bike feels like a cursor |
| `contact-not-floating` | Wheels visibly compress into surfaces; the bike never hovers a pixel above ground; suspension travel matches the load | Wheels skate over geometry, sit above it, or the bike slides with locked wheels |
| `camera-motion-motivated` | Every pan, zoom and lead is caused by bike speed/height/direction and arrives smoothly (eased in and out) | Camera moves for no visible reason, jitters, or is bolted rigidly to the bike |
| `cut-timing` | Any hard cut (respawn, checkpoint) lands on a beat the eye expects; no fade, no black frame, no half-rendered frame | Cuts feel early/late, show a fade or a blank frame, or leave the camera mid-move |
| `motion-continuity` | Motion is continuous frame to frame: no pops, no teleports, no frozen frames, no duplicated frames | Visible stutter, popping geometry, frozen or duplicated frames |

### `fault-respawn`

| id | what a 5 looks like |
| --- | --- |
| `hard-cut-no-fade` | The respawn is a single hard cut; no fade to black, no wipe |
| `back-in-control-under-1s` | From the crash frame to a frame where the bike is visibly moving under player input: under 1.0 s (30 frames) |
| `camera-settled-on-cut` | On the first frame after the cut the camera is already at rest at the checkpoint framing, not sliding into place |
| `bike-becomes-debris` | On crash the bike and rider separate and tumble as loose bodies with their own momentum; they do not freeze or vanish |
| `dust-on-impact` | Impact raises dust/debris within ~3 frames, at the contact point, in the direction of travel |

### `wheelie-launch`

| id | what a 5 looks like |
| --- | --- |
| `pitch-back-within-0.3s` | From the throttle frame, the front wheel is clearly off the ground within 0.3 s (9 frames) |
| `rider-lean-lags-100-150ms` | The rider's upper body reaches its lean-back pose 3-5 frames after the bike pitches, then leads it |
| `pitch-drifts-and-corrects-not-snaps` | The wheelie angle wanders and is corrected with visible small counter-inputs; it never locks to a fixed angle |
| `exhaust-puff-on-throttle` | A short exhaust/heat puff coincides with the throttle blip that starts the wheelie |

### `big-jump-landing`

| id | what a 5 looks like |
| --- | --- |
| `rear-wheel-first` | The rear wheel touches down first; the front follows 2-6 frames later |
| `two-stage-settle` | Suspension compresses hard on touchdown, rebounds, then a second smaller compression before rest (~0.25 s then ~0.4 s) |
| `dust-after-touchdown` | Dust appears at the rear contact patch 2-4 frames after touchdown, not before and not simultaneously with the front |
| `camera-pullback-to-apex` | The camera eases out (wider) on the way up, widest near the apex, and eases back in through the landing |
| `landing-in-bottom-third` | At touchdown the bike sits in the bottom third of its half of the frame with the landing surface visible ahead |

### `countdown-go`

| id | what a 5 looks like |
| --- | --- |
| `1.0s-beat-spacing` | The countdown steps (3-2-1-GO or equivalent) are 1.0 s apart (30 frames), to the frame |
| `bike-live-during-count` | The bike is simulated during the count: suspension breathes, throttle input pitches it, the rider shifts |
| `moves-on-go-frame` | Forward motion starts on the GO frame itself, not a frame later |
| `camera-dolly-during-count` | The camera performs a slow dolly/orbit during the count and lands on the gameplay framing exactly on GO |

### `finish`

| id | what a 5 looks like |
| --- | --- |
| `timer-freezes-on-line` | Whatever indicates time stops on the frame the front wheel crosses the line (if the HUD is masked, judge from the flash/plaque timing) |
| `flash-within-0.2s` | A finish flash/pyro/colour pop occurs within 0.2 s (6 frames) of the crossing |
| `physics-keeps-running` | After the line the bike keeps rolling, pitching and settling under its own momentum; nothing freezes |

### `bunny-hop`

| id | what a 5 looks like |
| --- | --- |
| `preload-crouch-visible` | Before take-off the suspension compresses and the rider crouches (2-6 frames), then extends explosively |
| `rear-wheel-apex-0.55-0.75m-relative-to-bike` | At apex the rear wheel is roughly 0.55-0.75 m above take-off height — about half to three-quarters of a wheel-to-wheel bike length |
| `landing-settle` | Landing compresses the suspension, rebounds and settles in one damped cycle; the bike does not bounce back into the air or stop dead |

### `steep-climb`

| id | what a 5 looks like |
| --- | --- |
| `rear-wheel-bite` | On the incline the rear wheel visibly loads and grips: the rear squats, the front lightens, small slip is recovered |
| `nose-drop-with-lean` | As the rider leans forward the nose drops proportionally; lean and pitch change together, not one after the other |
| `stall-and-rollback-reads-as-weight` | If the bike stalls it hangs for a beat, then rolls back accelerating under gravity, not at a constant speed |

### `seesaw`

| id | what a 5 looks like |
| --- | --- |
| `plank-tips-under-weight-not-before` | The plank starts rotating only once the bike's mass passes the pivot, and accelerates as the lever arm grows |
| `rider-commits-then-bike-drops` | The rider shifts forward first; the plank's drop follows the shift, not the other way round |
| `momentum-carries-off-end` | Leaving the plank, the bike's trajectory continues the plank's motion; it does not lose or gain speed at the edge |

### `stairs`

| id | what a 5 looks like |
| --- | --- |
| `wheel-by-wheel-or-hop-reads-as-choice` | Either each wheel rides each step (bob per step) or the bike hops several at once; both read as a deliberate line, never as clipping through |
| `suspension-bottoms-then-rebounds` | On the hardest step the suspension visibly bottoms and rebounds; travel scales with drop height |
| `pitch-bob-per-step` | The bike pitches down-then-up once per step with a consistent cadence tied to speed |

## Other tags

If the tag is not listed (e.g. `rear-wheel-balance`), score the `general` set
plus whatever from the closest listed manoeuvre applies, and say in `reasons`
which set you used.
