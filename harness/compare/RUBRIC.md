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

## Audio pairs (`apair-<id>`) — "which one is the real game's audio?"

An `apair-` pair is SOUND only. The picture is black by design: only the label
bar (one square = A, two squares = B) and the clock are drawn, so there is
nothing to see and nothing visual to lean on. Judge what you can measure in the
audio: you cannot hear, so analyse the WAVs (ffmpeg / ffprobe / sox / python
numpy: spectrograms, RMS envelopes, onset times, pitch tracks, spectral
centroid, crest factor, band energies) and read the spectrogram sheet.

- `apair-<id>.mp4` — 640x384 @ 30 fps, one audio stream (AAC): **A first**, then
  1.0 s of silence, then **B**. The bar shows one square while A plays and two
  while B plays; the amber clock spans the whole file.
- `apair-<id>-A.wav`, `apair-<id>-B.wav` — the two clips, 48 kHz stereo 16-bit,
  the same length (min of the two, at most 8 s), each loudness-matched to the
  same integrated level with ONE linear gain (no compression, dynamics intact).
  Absolute level is therefore not a signal; relative dynamics, spectrum and
  timing are.
- `apair-<id>-sheet.jpg` — two spectrograms, **A on top, B below**, identical
  axes (20 Hz–12 kHz log frequency, 80 dB range), no other labelling.
- Both were cut from longer material; neither is aligned to the other's events.
  A missing event inside the window is not a fault by itself.

Question: **Which of A and B is the real game's audio?** Name the one tell that
makes the other synthetic. Output the same JSON as every pair: `winner` = the
side you believe is the real game, `confidence`, `reasons[]` (measured,
with times and numbers), `nonAAA` = **the one tell that makes the synthetic one
synthetic** (one sentence, sound terms only). `criteria` is optional for audio
pairs; if you include it, use the ids below (5 = indistinguishable from a
shipped Trials title, 1 = obviously synthesized).

### `audio` — applied to every audio pair

| id | what a 5 looks like | what a 1 looks like |
| --- | --- | --- |
| `engine-pitch-and-load` | Engine pitch follows rpm continuously with a combustion pulse texture whose harmonics spread and blur as rpm rises; load (throttle) changes the timbre (brighter, more intake / exhaust bark), not just the level | A steady harmonic stack or a smooth band that slides in pitch; partials too even, too clean, no per-cycle variation; load only changes volume |
| `clutch-and-launch` | The launch has a clutch phase: rpm climbs and holds while speed catches up, then a long pull to the limiter; a limiter is a ragged cut, not a clean ceiling | Rpm and speed move as one; the launch is a linear sweep; nothing holds, nothing cuts |
| `suspension-and-chassis` | Landings and bumps are a low thump (a compression knock, 60–200 Hz) with a mechanical tick, scaled by the drop; small bumps read as chassis rattle | Landings are a generic boom or a click; every impact is the same sample at the same size; nothing between the big hit and silence |
| `tyre-and-surface` | Rolling and slip make a surface-dependent noise bed (dirt grit, wood knock, metal ring) tied to speed and wheel slip | No surface at all, or one broadband hiss that ignores speed and slip |
| `impact-and-ragdoll` | A crash is a cluster of distinct body / bike hits with their own sizes and spacing (2–5 events over ~1 s), the engine dies or idles, then it goes quiet | One thud, or a dense pile of identical thuds; the engine keeps running unchanged through the crash |
| `ambience-and-crowd` | A room and a place: reverb / slap-back that fits the space, a crowd with individual voices and reactions, distant world sounds | Dry, or one static noise bed; a crowd that is a formant hum with no voices |
| `mix-balance-and-dynamics` | The engine sits in a mix with music / UI / ambience at plausible relative levels; crest factor and loudness range are those of a produced game mix | Everything at one level, or one element dominating; crest factor extreme (a compressor-less synth) or flat; long stretches of near-identical spectrum |

### `audio-start-gate`

Countdown 3-2-1-GO (1.0 s per beat) and the launch. A 5: the countdown pings
are thin, evenly spaced UI tones (expect ~1.0 s apart); a crowd roar or musical
sting on GO; the engine goes from idle through a clutch hold to a long pull; the
rear tyre spins up on dirt. Look at: onset spacing of the pings, rpm (fundamental)
trajectory after GO, whether speed-linked noise (wind / tyre) rises with it.

### `audio-wheelie`

A held wheelie / rear-wheel balance. A 5: the engine sits high and modulates as
the rider feathers the throttle to hold the balance, with small rpm surges and
sags every 0.3–0.8 s; no landings, little wind. Look at: pitch-track variance
and its rate, whether the modulation is throttle-shaped (fast up, slower down),
and whether the timbre changes with the surges rather than only the level.

### `audio-landing-2m`

A big drop / jump landing. A 5: airtime is quieter and windier, the engine free-
revs or idles in the air, the touchdown is a heavy suspension thump (low knock,
compression, then a settle over ~0.5 s) with tyre / dirt scrub after it, and the
engine loads up again as the bike rides away. Look at: the pre-landing dip, the
impact's low-band energy and length, the settle, and what the engine does before
and after the touchdown.

### `audio-crash-respawn`

A crash, a ragdoll, and a respawn. A 5: the impact is a cluster of distinct
thuds and a bike clatter, the engine dies or drops to idle on the crash, the
crowd groans, then a hard cut to silence / restart and the engine starts again
within ~1 s. Look at: the number and spacing of impact events, the engine's
behaviour across the crash, the cut's cleanness (no tail, no click) and the
restart's onset.
