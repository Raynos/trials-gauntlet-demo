# Audio design — procedural Web Audio for the trials gauntlet

Status: **round 4 implemented** (`src/audio/**`; §11 — the engine is a per-firing resonator excitation with seeded
jitter, misfires and a hunt, rendered in stereo; the landing is a suspension thump and settle; wind and tyres climb
with speed; every one-shot varies per event so a crash and its replay are different sounds). Round 3 (§10) retuned
everything to physics v2 and added the crowd, rooms, stingers and music. Round 2 (v1 tuning) is the body of §1–§8;
where a later section says a number changed, the later section wins. Owner paths: `src/audio/**`, this file.
Binding contract: `docs/design/CONTRACT.md` §2.3 (audio consumes `state.engine`, never
re-derives rpm), §2.7 (`AudioSystem.update(state, dt, input)` + optional `renderOffline`),
§2.8 (unlock on first touch/key). Where this file and CONTRACT disagree, CONTRACT wins.

Scope: every sound the game makes, synthesised at runtime from `PhysicsState` +
`InputFrame` + `GameEvent`. No downloaded samples, no `Math.random`. The reference
corpus is silent, so timings come from the gameplay notes (countdown 1.0 s/beat,
CRASH! stamp +0.2 s, hard-cut respawn, checkpoint/finish beats) and the timbres are
designed from first principles toward the character of the real games: a raspy
single-cylinder trials engine that carries the mix, dry chassis thunks, tiny UI, big finish.

## 0. Principles

1. **Two layers, hard boundary.** `model/` is pure, allocation-free TypeScript that turns
   `(PhysicsState, InputFrame, dt)` + `GameEvent`s into a flat `AudioParams` struct.
   `dsp/` is a sample-rate synth that reads only the packed `AudioParams`. The graph
   (`graph/`) just moves one `Float32Array` per frame into an `AudioWorklet`.
2. **Deterministic by construction.** Model randomness is the seeded sfc32 `Rng` from
   `src/core/rng.ts` (`(trackSeed ^ 0xA0D10) >>> 0`); DSP noise is per-voice xorshift32
   seeded from the same seed. Two offline renders of the same input are byte-identical
   (tested; `sha256` of the gauntlet WAV is stable).
3. **Physics is the truth.** `rpm / throttleEff / limiter` come from `state.engine`
   (idle 1500, redline 10 000, limiter 10 000 → 9 500 — physics' numbers). Surfaces come
   from `state.contacts`, slip from `state.rearSlip`, landings from `land` events,
   countdown/GO from the game's events. The model only smooths, edge-detects and scales.
4. **Restart is instant.** The `restart` event hard-stops every chassis/UI voice within
   5 ms, drops pending delayed one-shots, mutes and clears the reverb, and the engine is
   back at its live level on the next block (a 0.3 s starter whir + catch plays over it).
   Measured: chassis bus −34.6 dBFS before → ≤ −60 dBFS at +10 ms; nothing but the
   starter follows.
5. **Budget.** Whole mix ≈ 0.28 ms of CPU per 60 Hz frame in node (59× realtime);
   main-thread `update()` 0.03–0.04 ms/frame in Chromium; worklet chunk 8.4 KB gz.

## 1. Integration (what the core-game owner wires)

```ts
import { WebAudioSystem } from './audio';
const audio = new WebAudioSystem({ makePhysics: (hz) => new MockPhysics(hz) }); // factory → renderOffline exists
const game = new Game({ ..., audio });
// Game.loadTrack (additive, optional): biome + seed follow the track
audio.setTrack(compiledTrack, seed);
// first touch/key — call synchronously inside the handler (iOS creates the context there)
window.addEventListener('pointerdown', () => void audio.unlock(), { once: false });
window.addEventListener('keydown', () => void audio.unlock());
// Game.render: pass the live input (contract §2.7)
this.audio?.update(state, dt, this.input);
// harness hook (contract §2.9)
hook.audio = audio.renderOffline ? { renderOffline: audio.renderOffline } : undefined;
```

- `unlock()` is safe to call on every gesture: it creates the `AudioContext` once,
  calls `resume()` synchronously each time (Safari "interrupted" state after calls /
  tab switches), and builds the backend once.
- `update()` accepts the physics `dt` the game passes today; the model clocks itself from
  `state.time` deltas (segment time), so render-rate jitter and the fixed 1/120 argument
  are both fine.
- Events before unlock are still fed to the model (nothing is queued to the graph until it
  exists), so no stale transients fire when audio comes alive.
- `renderOffline(recordingJson, seconds)` → `Promise<Float32Array>` of **interleaved
  stereo 48 kHz** PCM (`OFFLINE_SAMPLE_RATE`). `encodeWav16(pcm, 48000, 2)` is exported.

## 2. Module layout

```
src/audio/
  index.ts            AudioSystem (+input, +renderOffline?), NullAudio, exports
  params.ts           AudioParams, transient kinds, Float32Array wire format, tuning constants
  driver.ts           ModelDriver: params + scratch + rng → packed frame (shared live/offline)
  offline.ts          renderRecording / renderScript / createOfflineRenderer / encodeWav16
  model/
    mapParams.ts      state → params (engine passthrough, tyres, skid, chain, distance ticks,
                      suspension edges, airborne/wind, duck envelopes, crash/finish fades)
    events.ts         GameEvent → transients (+delays) and scratch flags
    mapParams.test.ts golden stream hash, edge rules, ducking, allocation stability
  dsp/                pure sample-rate synth (runs in the worklet, OfflineAudioContext and node)
    util.ts           Biquad, noise colours, xorshift rng, pan, FDN reverb
    engine.ts         4-stroke single: pulses + harmonic bank + chamber formants + intake (+ torque, Pro voicing)
    tyres.ts          8 surface chains, skid, chain whine
    voices.ts         16-voice one-shot pool + every recipe (chassis, crash, UI family in D, hop, body thud, ambience events)
    ambience.ts       5 biome beds + sparse events (press, gusts, pass-bys, steam) + speed wind
    crowd.ts          the stands: murmur bed, roar / cheer / groan / applause (round 3)
    music.ts          procedural front-end / results bed, 92 bpm in D (round 3)
    synth.ts          buses, ducking, reverb room per biome, canyon slap-back, limiter, soft clip
    synth.test.ts     pitch tracking, blip latency, limiter duty, onsets, duck, restart, ambience, tyres, crowd, music, stingers, rooms, budget
  graph/
    worklet.ts        AudioWorkletProcessor 'trials-synth' (Vite chunk via dynamic import('./worklet?worker&url'))
    webAudio.ts       WebAudioSystem: gesture-safe context, worklet → fallback, param posting
    fallback.ts       oscillator-bank engine + noise tyres + native one-shots (no worklet)
  tools/
    fixture.ts        blankState(), gauntlet StateScript (countdown→…→finish, 17 s)
    renderDemo.ts     WAV + spectrogram + ebur128 report (headless listening)
    beats.ts          the four beats vs the reference corpus' audio: WAV ×2 (sha256), spectrograms, RMS/peak/crest/centroid table
```

## 3. AudioParams — the model ↔ DSP contract (`params.ts`)

```ts
interface AudioParams {
  rpm; load; limiter; engineGain;          // physics engine; on a crash the engine stalls: gain 1 → 0 and the
                                           // audible rpm sags 55 % over 450 ms (physics parks rpm at idle)
  clutch; scrape; speed;                   // auto-clutch slipping (0..1), crashed frame scrubbing (0..1), speed/20
  tyreSpeed: [rear, front]; tyreSurface: [rear, front];   // m/s, surface index or -1 airborne
  skid;                                   // 0..1 = clamp(|rearSlip| / max(2, speed))
  chainHz;                                // rear spinVel/2π · 42 teeth, 0 below 1.5 m/s
  wind; airborne;                         // clamp(speed/14)^1.5 smoothed τ 150 ms; both wheels off ≥ 100 ms
  biome; ambientGain;                     // BIOMES index; fades 250 ms after finish
  duckDb;                                 // 6 dB for 300 ms after impact/crash, 3 dB for 200 ms after UI beats
  transients[24]: { kind, gain, pitch, pan, delay }; transientCount;
}
```
Packed as a 140-float `Float32Array` (`packParams`) — one `postMessage` per frame. Transient
kinds (`TRANSIENT_KINDS`): landing, thunk, bottomOut, impact, debris, grunt, fault, tick,
skidChirp, countdown, go, checkpoint, restart, finishTick, fanfare, firework, crowd, hazard, kill,
starter, plank.
`delay` lets one event schedule a whole cue (stamp +200 ms, fanfare 80 ms apart, fireworks
over 1.2 s) sample-accurately; a restart discards anything still pending.

## 4. Sources

### 4.1 Engine (`dsp/engine.ts`) — 250 cc single-cylinder 4-stroke trials engine

What a 4T trials engine (Montesa 4RT / Beta Evo 4T) sounds like, and how the model gets there:

| real engine | model |
|---|---|
| low, soft "putt-putt" idle at ~1500 rpm — each power stroke is a rounded thump, 12.5/s, energy 50–250 Hz, almost no top end | exhaust pulse `A·exp(−t/τ)·(0.7·sin(2π·fp·t) + noise)` with τ = 10 ms and fp = 120 Hz at idle, through muffler resonances 130 Hz Q 3 +6 dB / 380 Hz Q 2.5 +3 dB and a lowpass at 1400 Hz; the noise share of the pulse is only 0.15 at idle |
| a hard, throaty bark the instant the throttle opens; the note gets shorter and harder | τ → 4 ms and fp → 210 Hz at load 1; pulse amplitude 0.5 → 1.0; lowpass opens to 4600 Hz; harmonic-bank tilt k = 1.6 → 0.8 |
| the airbox "honk" under load (intake resonance ~400–700 Hz) — the thing that says *4T*, absent at idle | the same pulse train excites a resonator BP 380 + 300·load Hz Q 5 with gain ∝ load² (silent at idle) |
| mechanical ticking (valve train) under the idle | 1 ms clicks at 2·fFire (cam), −34 dB |
| no two-stroke ring, no 2–3 kHz whistle | no resonance above 380 Hz; intake noise is a broad BP 700 + 1200·load Hz at −26 + 12·load dB |
| the slipping auto-clutch off the line: the crank parks at ~3500 while the wheel catches up | `clutch` from the model (load ≥ 0.25, rpm within 80 of 3500, rear roll < 6 m/s, τ 60 ms) adds a gated 2.8 kHz whine with 30 Hz chatter at −30 dB — the distinct held note is physics' 3500 hold itself |
| rev limiter stutter | every 3rd cycle emits nothing while `limiter` (2/3 duty, −1.8 dB measured) |
| overrun pops on a closed throttle | load < 0.08 and rpm > 3200: P 0.12 per cycle ×2 amplitude, τ ×1.6 |
| the engine dies in a crash | model: gain 1 → 0 and audible rpm sags 55 % over 450 ms; a `starter` whir (chattering 95 → 140 Hz saw, 14 Hz gate, 0.25 s) + catch thump plays on every respawn / track load |

`fFire = rpm / 120`; rpm/load de-zippered per block (τ 8 / 4 ms) — physics owns the dynamics.
Level dB = −18 + 12·load + 2·(rpm−1500)/8500 + 2·speed/20, × `engineGain`; centre-panned.

Measured: fundamental tracks rpm/120 with ≤ 0.07 % error from 1500 to 10 000 rpm
(autocorrelation on the engine solo); throttle step 0 → 1 adds +13 dB and reaches 50 % of that
inside the first 5 ms window after the update (< 20 ms end-to-end incl. the 16.7 ms update).
On the flat-test recording the launch reads as: idle comb → 0.25 s climb → a held comb at
29 Hz firing (3500 rpm) for ~0.45 s with the clutch whine on top → the climb to the limiter.

### 4.2 Tyres, skid, chain (`dsp/tyres.ts`)

| surface | noise → filter (v m/s) | extras | base @10 m/s |
|---|---|---|---|
| dirt | brown → LP 900+60v Q 0.6 | crackle grains 25+6v /s, 3 ms, BP 1.8 kHz Q 2 | −18 dB |
| wood | pink → BP 300+25v Q 1.2 → peak 220 Hz Q 6 +8 | **plank thud** per board joint every 0.24 m (0.22 m boards + 2 cm gaps): 210 Hz knock + click, harder/brighter with speed, sample-placed by sub-frame delay, up to 4 per update per wheel (≈ 42/s per wheel at 10 m/s) | −20 dB |
| metal | white → HP 700 → peak 1850 Hz Q 6 +2 | ridge tick every 0.31 m (model), each ringing 1.85 kHz briefly | −22 dB |
| concrete | pink → HP 250 → LP 4 kHz | — | −20 dB |
| rubber | brown → LP 500 → peak 95 Hz Q 4 +6 | — | −24 dB |
| grate | white → comb (delay 0.05 m / v, fb 0.6) → peak 2.4 kHz Q 8 +6 | **grate whine**: sine + 2nd harmonic at the bar-crossing rate v/0.05 Hz (160 Hz at 8 m/s, tested ±3 %) | −19 dB |
| stone | pink → HP 200 → LP 3 kHz | clatter grains 12+4v /s, 2 ms, BP 2.5 kHz Q 3 | −19 dB |
| snow | brown → LP 700 | crunch grains 50+12v /s, 4 ms, BP 1.2 kHz Q 1.5; hiss HP 6 kHz −20 dB | −20 dB |

Gain = base · (v/10)^0.7; silent when v < 0.15 m/s or the wheel is off its surface (10 ms
de-zipper); rear panned −0.15, front +0.15. Skid: white → BP 1200 + 1400·slip Hz Q 3,
−30 + 22·slip dB above slip 0.25; `skidChirp` (sine 2.4 → 1.1 kHz, 90 ms) when slip
crosses 0.6 upward. Chain: sines at chainHz and 2·chainHz (−8 dB), 0.3 % seeded jitter at
4 Hz, `x + 0.3x³`, peak 1.6 kHz Q 3 +6 dB, −34 dB @10 m/s ∝ 20·log10(v/10), ×0.5 airborne.

### 4.3 Chassis (`model/mapParams.ts` edges → `dsp/voices.ts` recipes)

- **landing**: from `land` events. `impulse` is the touchdown tick's normal impulse (N·s); the
  bot corpus at 1.4 g gives p50 ≈ 10, p75 ≈ 30–60, max ≈ 210, with ≤ 5 being a wheel settling.
  gain = (impulse/120)^0.6, ignored below 5 → 10 N·s ≈ 0.22, 60 ≈ 0.66, ≥ 120 = 1; pitch = surface.
  Recipe: sine 180 → 55 Hz over 60 ms D 140 ms + body 92 Hz D 260 ms + brown LP 600 Hz
  40 ms, −12 dB·gain; dirt/snow: more noise, less sine; metal/grate: + ring 1.85 kHz D 200 ms.
- **thunk**: grounded wheel with d(compression)/dt > 6 /s → landing at ×0.5, ≥ 80 ms apart.
- **bottomOut**: compression ≥ 0.97 rising edge → sines 2.2/3.1/4.7 kHz D 180/120/80 ms −16 dB + landing
  (the suspension now cycles through 0.9+ on hard landings, so this fires for real; rebound re-arms it).
- **crashed bike**: while `faulted === 'crash'` with the ragdoll out, the frame scrubbing the ground
  gives `scrape` = speed/8 → gritty noise HP 400 Hz / LP 3–5 kHz at −24 + 10·scrape dB (chassis bus);
  suspension hits become sparse metal clatter ticks (≥ 250 ms apart) instead of landing thunks, and
  bottom-outs are muted — a wreck rattles, it does not thump like a landing.
- **crash** (`fault: crash`): impact ×2 (thud 95 → 40 Hz + crunch BP 800 Hz + frame ring
  1.32/2.07/3.41 kHz, second layer +35 ms pan +0.3 −3 dB); 6 seeded debris grains over 0.4 s
  (−3 dB/grain); **grunt** at +40 ms: sawtooth glottal source f0 130 → 95 Hz (3 % seeded
  jitter) → formants 620 Hz Q 8 +12, 1150 Hz Q 10 +8, 2500 Hz Q 12 +4 → LP 1.2 kHz, env
  A 8 / H 60 / D 140 ms, −14 dB; seeded 50 % second grunt at +260 ms; **fault stamp** at
  +200 ms (white BP 2.2 kHz 30 ms −10 dB + 60 Hz tap); engine `load → 0`, `engineGain → 0`
  over 350 ms. `hazard` faults: fire/water whoosh (brown BP 300 → 2500 Hz, 600 ms) + grunt
  + stamp. `out-of-bounds`/`timeout`: stamp only. Manual `restart` fault: nothing (the
  restart event does the work).
- Edge detectors are suppressed on the first update after a restart, so the respawn
  (both wheels planted in one frame) never produces a landing.

### 4.4 UI (`dsp/voices.ts`, ui bus — not ducked)

```
countdown   sine 880 Hz, A 3 ms, hold 10, D 70 ms, −14 dB, one per event (1.000 s cadence from the game)
go          1320 + 1760 Hz, A 2 ms, hold 60, D 220 ms, −10 dB + whoosh BP 600 → 5000 Hz over 250 ms −20 dB
checkpoint  triangle C6 1046.5 → E6 1318.5 Hz (+90 ms), D 400 ms, −14 dB, + flame-jet whoosh BP 400 → 1500 Hz 350 ms −18 dB
restart     hard-stop chassis+ui voices (5 ms), drop pending, mute+clear reverb (7 ms);
            click BP 3 kHz 2 ms −20 dB; whoosh BP 400 → 4000 Hz A 40 / D 140 ms −16 dB
finish      timer-freeze tick (go chord −16 dB, no whoosh); fanfare C5 E5 G5 C6 at +150 ms,
            80 ms apart, D 600 ms −12 dB; five seeded firework pops 0.2..1.3 s (sine 300 → 80 Hz + LP 2 kHz
            noise tail 400 ms, −18 dB, seeded pan); crowd swell pink BP 1.1 kHz A 300 / H 500 / D 700 ms −24 dB;
            ambience fades 250 ms
```
Measured onset latency (event → first audible sample, offline): countdown 0.12 ms, go 0.04,
checkpoint 0.29, finish 0.06, land 0.15, fault/crash 0.04 ms. Countdown spacing 1.000 ± 0.002 s.
Live adds one worklet block (2.7 ms at 48 kHz) plus the frame interval.

### 4.5 Ambience (`dsp/ambience.ts`, ambient bus)

| biome | bed | sparse events (seeded) |
|---|---|---|
| industrial | brown LP 1.2 kHz −33 dB; HVAC pink LP 180 Hz −36 dB; mains hum 60 + 120 Hz −40 dB | metal creak 680 → 540 Hz 300 ms, 7 Hz AM, every 9–17 s |
| canyon | brown LP 320 Hz −27 dB, gain LFO 0.13 Hz ±6 dB + 0.31 Hz ±3 dB | bird chirp 2.8 → 3.4 kHz gated 40 Hz, every 6–14 s, panned |
| snow | brown LP 500 Hz −29 dB with canyon LFOs; hiss HP 6 kHz −46 dB | — |
| nightCity | brown LP 140 Hz −25 dB, 0.05 Hz ±4 dB swell; neon saw 120 + 240 Hz → LP 400 Hz −42 dB; cricket 4.2 kHz gated 18 Hz 60 % −40 dB | — |
| foundry | brown LP 220 Hz −22 dB, 6 Hz ±3 dB flutter | crackle grains 4/s BP 3 kHz 5 ms −32 dB; clank every 5–11 s |

Each bed solos to −29 ± 1 LUFS over the gauntlet (target −30 ± 3). Speed wind (all biomes,
not gated by `ambientGain`): white HP 1.2 kHz, −40 + 16·wind dB, +6 dB airborne.

## 5. Mix (`dsp/synth.ts`)

```
engine ─┐
tyres ──┤
chassis ┼─► game (duck) ──┬─► master ─► peak limiter (−2.5 dBFS, instant attack, 80 ms release) ─► 0.85·tanh(x/0.85)
ambient ┘                 │
ui ───────────────────────┤
FDN reverb (sends ui 0.3, chassis 0.15; 23/29/37/43 ms, fb 0.55, canyon 0.78, LP 3.5 kHz) ┘
```
Bus trims (dB): engine −6, tyres −5, chassis 0, ambient −4, ui −4, master 0.
`setMasterVolume(v)` applies `v²`. Ducking: `duckDb` from the model, smoothed in the synth
(attack 15 ms, release 120 ms). Measured on the engine solo: −6.1 dB during a hard landing.

Gauntlet render (17 s, all sources): **−17.3 LUFS integrated, −4.2 dBTP, LRA 12 LU**;
solos: engine −17.5, tyres −29.3, chassis −30, ambient −28.9, ui −25 LUFS (GO peaks −9 dBFS,
fault stamp −12, checkpoint −16: the cues sit on top of the engine, plus the 3 dB UI duck).
Real recordings through the bike physics: flat-test-clear (flat out) −14.3 LUFS, b3-kicker-row
bot-3 −17.6, e3-stairway bot-3 −18.2, x2-pipe-dream bot-3 −18.3; every peak −4.2..−4.5 dBTP.

## 6. Offline rendering & headless verification (`offline.ts`, `tools/renderDemo.ts`)

`renderRecording(json, seconds, makePhysics, opts)` replays the recording at 60 Hz updates
(2 physics ticks each), feeds every drained event to the model, packs, and lets the synth
render exactly 800 samples per update — sample-aligned, seeded, byte-identical. Optional
`countdown: true` prepends 3-2-1-GO (3 s); otherwise `go` fires at t = 0 so the WAV lines up
with the replay's tick clock. `autoRestartS` (default 1.0, mirroring CONTRACT §2.8) resets physics
to the last checkpoint one second after a crash/hazard fault — what the player hears — unless the
recording restarts first; 0 disables. Recording renders default to the real `bikePhysicsFactory`
(`--physics mock` for the mock). `renderScript(script, seconds, opts)` does the same from a
`StateScript` (no physics) — this is how the tests and the gauntlet WAV are made.

```
npx tsx src/audio/tools/renderDemo.ts <outDir> [--solo engine|tyres|chassis|ambient|ui] [--biome canyon]
npx tsx src/audio/tools/renderDemo.ts <outDir> --recording harness/inputs/flat-test-clear.json --seconds 15
```
writes `<name>.wav`, `<name>.spectrogram.png` (`showspectrumpic`, log/log 20 Hz–12 kHz),
`<name>.wave.png`, and `<name>.report.json` `{deterministic, sha256, lufs, peakDbtp, lra,
samplePeakDbfs, realtimeRatio}`. A harness stage can call `__trials.audio.renderOffline`
in the page instead; it is the same code path.

**Vitest (node, no AudioContext)** — 21 tests: golden `mapParams` stream hash
(`eea714701daae4d1` over the gauntlet), clutch/scrape flags, landing impulse curve, plank-joint
rate, grate whine pitch, crash stall + starter, transient causality, physics passthrough, surface
mapping, first-frame-after-restart suppression, crash fade/restore, duck request levels,
allocation stability; DSP: byte-identical double render under −1 dBTP, pitch ≤ 3 % (actual
≤ 0.05 %), blip < 20 ms, limiter duty, countdown onsets ±8 ms / 1.000 ± 0.002 s, duck −6 ± 1 dB,
restart ≤ −60 dBFS within 10 ms with no tail, every biome bed −45..−20 dBFS, every surface
silent at rest and louder with speed.

## 7. Mobile / browser behaviour (`graph/webAudio.ts`)

- iOS Safari: `AudioContext` constructed synchronously inside `unlock()` (call from the
  gesture — verified: the context exists and is `running` before `unlock()`'s promise settles);
  `resume()` fired synchronously as well; `statechange` and `visibilitychange` (page visible
  again) → auto-resume when `interrupted`/`suspended` (verified: suspended → running after a
  synthetic visibilitychange). The device sample rate (44.1 or 48 kHz) is passed to the synth.
- AudioWorklet (iOS ≥ 14.5, all evergreen): `addModule(workletUrl)` with a 4 s timeout;
  on failure → `FallbackGraph` (native oscillators: saw 4·fFire + square 2·fFire → lowpass,
  looped seeded-noise tyres/wind, oscillator/noise one-shots for the main cues). Same
  packed params; `backendKind` reports which is live.
- Verified in headless Chromium: worklet backend unlocks in 113–164 ms, context running at
  48 kHz, main-thread `update()` 0.03–0.04 ms/frame; fallback backend unlocks in 3 ms.
- Fallback determinism: the fallback's *parameter stream* is the same deterministic model output,
  and a static fallback graph renders bit-identically in `OfflineAudioContext`; with per-frame
  `setTargetAtTime` automation Chromium's native AudioParam evaluation differs by ≤ 1.5e-8
  (1 float ulp, ~2 % of samples) between two renders. Byte-exact evidence therefore always
  comes from `renderOffline` (the worklet synth run directly), never from a native graph.
- Size: worklet chunk 24.3 KB min / **8.4 KB gz**; main-thread audio code ≲ 10 KB gz
  (well under the 40 KB budget). No node allocation per frame (one `Float32Array` copy).

## 8. Known gaps / requests

- **Core-game wiring** (not mine to edit): construct `WebAudioSystem` in `main.ts` (with
  `?audio=0` opt-out), call `unlock()` from the first gesture, pass `this.input` in
  `Game.render`, call `audio.setTrack(compiled, seed)` from `loadTrack`, and expose
  `hook.audio = { renderOffline }`. Until then the game runs `NullAudio`.
- Physics at 2bdd175 reports `engine.rpm` = 1500 (not 0) while ragdolling; the stall is audio's
  presentation (gain + pitch sag). If physics later drives rpm → 0 the sag simply follows it.
- The bot recordings under `harness/inputs/*/bot-*.json` were being regenerated for the frozen
  physics while this round ran (several replay to an early crash); renders above use them as-is.
- Live per-frame timing jitter means a live capture is not bit-identical to the offline
  render (accepted; offline is the reference artefact).
- The worklet's parameter delivery is per-frame `postMessage`; if the harness ever needs
  bit-exact **live** capture it should use `renderOffline`, not a media stream.
- No harness stage yet (`harness/**` is the harness owner's); `renderDemo.ts` is the
  interim listening tool.


## 10. Round 3 — retuned to physics v2, crowd, rooms, stingers, music (`src/audio/**`)

Everything in §1–§9 that was calibrated to v1 was re-derived from `docs/design/physics.md` "v2 status — R3/R4/R5"
and a probe of the v2 world itself (`createBikePhysicsV2`: launch traces, hop phases, 0.5–3 m drops at 6 / 12 m/s on
both classes, a crash, and every `land` event over the 21 `bot-3.json` recordings). Nothing re-derives rpm
(CONTRACT §2.3): the model reads `state.engine`, and where it needs the engine's *shape* (the thrust curve) it
carries a copy of physics' table as a tone map.

### 10.1 The retune table (model input → v1 value → v2 value → source)

| model input | v1 (round 2) | v2 (round 3) | source |
|--|--|--|--|
| clutch detector | rpm within 80 of 3500 **and rear roll < 6 m/s**, load ≥ 0.25 | rpm within 80 of 3500 and **rim speed < 7 m/s** (`clutchSpeed`), load ≥ 0.25 | `v2/engine.ts reportRpm`: below 7 m/s rpm = max(wheel, idle + throttleEff·2000); probe: Rookie holds 3499 from t 0.6 to 1.3 s, 6.1 m/s |
| launch shape (what the clutch whine sits on) | "0.25 s climb → 3500 hold ~0.45 s → limiter" | the 0.15 s throttle lag climbs 1500 → 3500 over ~1 s, holds to 7 m/s, then a 4 s pull: 5000 @ 2 s, 8000 @ 4 s, 9500 @ 6 s — no stall, no rev cut | R3 FEEL "0 → 16 in 3.98 s", `throttleTau` 0.15 (Pro 0.08); probe trace |
| engine tone: `torque` (new) | — (load only) | `throttleEff × f(v_rim) / f(0)`, f = `curveV/curveF` per class (Rookie 1.07 1.07 1 1 0.7 0.48 0.35 at 0 3 5 8 12 17 20 m/s; Pro 1 … at 0 3 5 8 12.6 17.85 21); drives pulse amplitude (0.45 + 0.3·load + 0.25·torque), the honk (× 0.55 + 0.45·torque) and 3 dB of level | `v2/tuning.ts` engine.curveV/F; R3 deviation 21 (the knot) |
| engine level | −18 + 12·load + 2·rev + 2·speed dB | **−14 + 6·load + 3·torque** + 2·rev + 2·speed | beats table: the reference wheelie / coast beats keep the engine at −22 dBFS; v1's closed-throttle floor left ours at −32 |
| engine spectrum | pulse 1.7 / bank 0.6, chambers 130 (+6) / 380 Hz, intake −26 + 12·load dB | pulse **2.0** / bank **0.45**, chambers 130 (+4) / **260 (+5)** / 380 Hz, intake **−32** + 12·load dB | ref start-gate spectrogram: engine energy in moving 200–500 Hz ridges with a dotted pulse texture; ours was a smooth 100–250 Hz band under a flat 0.5–8 kHz wash |
| Pro voicing (new) | — | pulse τ × 0.75, fp +25 Hz, pulse noise 0.25 (Rookie 0.15), lowpass +700 Hz, 380 Hz chamber → 430 Hz +4 dB, harmonic tilt −0.15, intake +2 dB. Limiter stays 10 000 / 9 500 on both classes (physics') — the Pro reaches it at 21 m/s through `gearFor(21)`, the Rookie at 20 | `v2/tuning.ts` CLASSES.pro (Fpeak 1000, τ 0.08, k 12 000 / 9 000) |
| landing gain: `land.impulse` | ref 120 N·s, min 5, ^0.6 (v1 corpus p50 10, p75 30–60, max 210) | **ref 60**, min 5, ^0.6 — v2 corpus (1007 landings) p50 10.3, p75 20.2, p90 37.3, p97 63.5, max 225; the R3 2 m drop reads rear 42 / front 59 at 6 m/s, 15 / 47 at 12 (the servo's legs absorb the rest over the next ticks, so the touchdown tick under-reports: v1's ref left a 2 m drop at 0.59) | R3 landing table; probe |
| landing thump: the compression spike | bottom-out = a 2.2 / 3.1 / 4.7 kHz **clang** at −16 dB + landing, "fires for real on hard landings" | **every drop ≥ 1 m runs the rear to 100 % and rides away** (R3 table: 1.5 / 2 / 3 m all 100 %, rebound ≤ 0.05) — so the bump stop *is* the landing: a deep stop knock (160 → 70 Hz + 1.1 kHz tap + BP 700 Hz burst, −6 dB, gain 0.5 + dC/dt/30) + the landing recipe at full gain; the metallic ring only on metal / grate | R3 landing table; probe max dC/dt 30.7 /s, maxRear 1.00 for h ≥ 1 m |
| the hop | nothing hop-specific (thunks / bottom-outs only) | `hopPhase` edges: idle → preload = **creak** (190 → 150 Hz saw, 11 Hz AM, LP 900, −28 dB); preload → push = **snap** (BP 900 Hz 8 ms burst + 140 → 90 Hz + 480 → 420 Hz spring, −22 dB); airtime = whatever physics does to the free wheel (the rear spins up toward the limiter under gas — that is the free-rev, not an audio invention); landing = above | R3 hop row 0.46 / 0.74 / 0.29 m, `hopPhase` in `PhysicsState` |
| Rookie wheelie control | — | **nothing audible by construction**: the assist trims *thrust*, not `throttleEff` or rpm; tested (rpm 6200 / load 1 pass through unchanged with the front lifting) | R4 `wheelieControl`, `debug().engine.assist` |
| crash: engine | stall over 0.45 s from the live rpm, sag 55 % | physics parks rpm at idle and throttleEff at 0 **on the crash tick**; audio lets it die over **0.35 s** from 1500 (two putts) | probe: crash state rpm 1500, thrEff 0 |
| crash: bike | frame scrape while sliding, clatter ticks | v2's crash brakes stop the bike in ≈ 0.1 s (probe: 0.05 m/s after the tick) — the scrape path stays but is rarely on; **ragdoll sensors** instead: a body whose frame-to-frame speed drops ≥ 2.5 m/s is a soft thud (torso / pelvis 90 → 50 Hz, limbs 140 → 80 Hz), **at most 3 inside 1.2 s**, then quiet | physics §8 ragdoll, `state.ragdoll` |
| respawn | hard cut ≤ 5 ms + starter | unchanged (also cuts the crowd reactions and the slap-back line) | CONTRACT §2.8 |
| wind | white HP 1.2 kHz, −40 + 16·wind dB, +6 airborne | **pink → BP 350 + 550·wind Hz** (+ HP 3 kHz hiss 12 dB under), −38 + 14·wind, +4 airborne | beats table: the landing beat's centroid was 1620 Hz against the reference's 153–287; the ambient bus alone read 8.5–10 kHz |

### 10.2 Crowd (`dsp/crowd.ts`, model `crowdDensity`)

The gates kit places people in three kinds of stand (`src/render/world/gates.ts` `crowdZone`): **start 30** over
[sx − 9, sx + 7], **7 per checkpoint** over [x + 1.5, x + 6.5], **finish 34** over [fx − 7, fx + 9]. `setTrack` turns the
compiled track into that list; every update the model measures `density = Σ (n / 30) / (1 + (d / 12 m)²)` from the
bike's x to the nearest edge of each stand, clamped to 1 (1 at the start, 0.28 at a checkpoint, 0.05 sixty metres
from anything; below 0.06 a stand is "out of earshot" and nothing reacts). The DSP:

- **bed**: three "vowel" bands of pink noise (280 / 520 / 900 Hz, Q 2) each under its own seeded random-walk gain
  (retargeted every 120 ms, τ 0.35 s), a little L/R decorrelation, −27 dB × density → −33 dBFS on its bus at the
  start stands, < −70 dBFS 80 m out; the crowd bus is trimmed −3 dB, ducked with the game, sent 0.25 to the room.
- **roar** on GO: +14 dB with a 1.5 kHz band, A 120 ms / hold 500 / D 1.4 s, gain = density (so a start with the bike
  already 60 m down the track — a checkpoint restart — gets nothing).
- **cheer** on a landing after **≥ 0.5 s** of air with no crash in the flight: +11 dB, bands shifted × 1.25, two or
  three seeded whistles (2.3–2.9 kHz, 6 Hz vibrato), 120–180 ms after the touchdown. The corpus' airtimes > 50 ms are
  p50 0.17 s / p90 0.73 s, so ~15 % of landings earn one.
- **groan** on a crash (+220 ms): bands glide down × 0.72 with the 350 Hz "ooh" up 8 dB.
- **applause** at the finish (+350 ms): a seeded clap train — 18 → 70 → 0 claps/s over 3.2 s, each a 3 ms burst through
  BP 1.9 kHz alternating ±0.5 pan — over the bed lifted 9 dB; the finish always gets at least a thin scatter
  (gain 0.3 + density) so a finish line without a stand still reads as one.
- Deterministic: the crowd's noise, walks, whistles and clap timing come from one xorshift seeded from the track seed;
  every restart cuts pending reactions.

Measured (solo, start stands): roar +11.7 dB over the murmur, groan +4, applause +8 with a 9+ dB crest (claps).

### 10.3 Ambience per biome (`dsp/ambience.ts` + `synth.ts` rooms)

| biome (`def.meta.biome`) | bed (as §4.5) + round 3 | room (FDN fb / damping) |
|--|--|--|
| industrial | + **distant machinery**: a press thump every 1.15–1.35 s (70 → 45 Hz, −34 dB, sent 0.6 into the hall), a conveyor hum 90 / 135 Hz under a 0.4 Hz swell | **hall**: 0.74 / 2.8 kHz — the longest tail |
| canyon | wind bed + birds; **slap-back**: engine + chassis into a 190 ms line, fb 0.35, LP 2.5 kHz, −9 dB send — a landing answers off the far wall (+3 dB in the 190–250 ms window, tested) | 0.60 / 3.5 kHz |
| snow | **hush**: the bed 4 dB quieter and darker (LP 420 Hz) than the canyon; **gusts** every 5–9 s (pink BP 500 → 900 Hz rising over 0.9 s, falling 1.2 s) | 0.35 / 3 kHz — almost no room (shortest tail, tested) |
| nightCity | traffic bed + neon saw + cricket; **pass-bys** every 7–13 s (brown noise LP 700 → 400 Hz, one side, 2.5 s) | 0.55 / 3.5 kHz |
| foundry | furnace roar + crackle + clank; **breathing hiss** HP 3 kHz, −38 ± 4 dB at 0.3 Hz; **steam vents** alternating with the clanks | 0.70 / 2 kHz — big and very damped |

### 10.4 Stingers and the music bed (`dsp/voices.ts` stab, `dsp/music.ts`)

One family: two detuned saws + a triangle an octave down through a 2.8 kHz lowpass — a small brass — everything in
**D**. Countdown = one D5 stab (587 Hz; onsets still ±8 ms, 1.000 s apart), GO = D6 / A5 / D5 stab + the whoosh,
checkpoint = A5 → D6 (+90 ms) + the flame-jet, finish tick = the GO chord quiet, fanfare = D5 F#5 A5 D6 (tested
within 3 % each). The finish fanfare resolves into the results bed because the bed is in the same key.

**Music**: a procedural loop, no files. Decision: composed rather than a CC0 download — the brief allows CC0 with its
licence committed, but a downloaded loop cannot be seeded per track, cannot be guaranteed free of a real artist's
identity, and adds bytes to the 40 KB budget; a 250-line generator costs ~4 KB gz and is byte-identical per seed.
92 bpm, 8 bars of 16ths, key of D. Front end (scene `menu`): D Aeolian, one of three progressions (i VI III VII ·
i VII VI VII · i iv VI v) two bars each, a pad (3 notes × 2 detuned saws → a lowpass swept 600–1400 Hz at 0.08 Hz),
a bass (sine + saw → LP 250 Hz) on a seeded euclidean E(5,16), a pluck arpeggio (triangle + 2nd harmonic, 220 ms)
on a seeded 5-of-16 pattern over the chord tones. Results (scene `results`): D Mixolydian (I V vi IV · I IV I V ·
I vi IV V), the same voices an octave brighter plus drums (kick 130 → 42 Hz on 1 and 3, hats on the off-8ths, a clap
on 2 and 4). −4 dB bus, not ducked, fades 0.8 s in / 0.5 s out, restarts at step 0 on every scene change so a seed's
menu always opens the same way; −22 dBFS RMS in the menu, −20 in results (tested −30..−14, in key by ≥ 6 dB
Goertzel margin, byte-identical, different per seed).

**Scene** (`AudioParams.scene`, `P_SCENE`): the model starts in `menu`, goes to `run` on the first `countdown` / `go`,
to `results` **1.4 s after `finish`** (after the fanfare's last note), back to `run` on the next `restart`. The app
can override with `audio.setScene('menu' | 'results' | 'run' | null)` (additive on `AudioSystem`; null = infer).
Because the front end renders no frames (`Game.renderEnabled = false` → no `update()`), the worklet receives the
scene by message (`{ scene }`) and runs the bed on its own clock; the fallback graph has no music (documented gap).
`audio.setBike('rookie' | 'pro')` (additive) selects the voicing; `renderOffline` takes it from the recording header.

### 10.5 Measured, not posed — the four beats vs the reference corpus (`tools/beats.ts`)

The committed reference clips are silent; the beats were cut from the raw downloads
(`reference/evolution-gameplay/raw/*.mp4`, AAC 44.1 kHz) at the manifest's timestamps with ffmpeg
(`-ss/-to … -ac 2 -ar 48000 pcm_s16le`). Ours are rendered through the real v2 physics: **start-gate** =
`flat-test-clear.json` with the countdown (9 s); **wheelie** = `wheelieHoldV3(40, 4)` on lab-flat-200 exactly as
`r3.test.ts` drives it (8 s); **landing-2m** = lab-flat-200 with the bike teleported 2 m up at 8 m/s (then 3 m at
12 m/s four seconds later), throttle 0.2 — the R3 landing table's row (8 s); **crash-respawn** =
`flat-test/crash.json` with the 1.0 s auto-restart (7 s). Each rendered twice; the two WAVs' sha256 match on every
beat and both classes. RMS/peak over the whole cut, centroid = energy-weighted mean over 4096-pt Hann frames above
−50 dBFS.

| beat | clip | s | RMS dBFS | peak dBFS | crest dB | centroid Hz |
|--|--|--|--|--|--|--|
| start-gate | **ours (rookie)** | 9.0 | −18.2 | −4.4 | 13.7 | 310 |
| start-gate | ours (pro) | 9.0 | −20.3 | −4.8 | 15.6 | 445 |
| start-gate | ref 01 D-license countdown-launch | 5.7 | −23.8 | −7.0 | 16.8 | 370 |
| start-gate | ref 08 warehouse ready-go | 7.5 | −21.3 | −5.3 | 16.0 | 597 |
| wheelie | **ours (rookie)** | 8.0 | −29.7 | −7.0 | 22.7 | 314 |
| wheelie | ours (pro) | 8.0 | −32.7 | −8.7 | 24.0 | 451 |
| wheelie | ref 02 D-license log ramps | 6.5 | −21.6 | −7.4 | 14.2 | 512 |
| wheelie | ref 05 A-license obstacle climb | 7.0 | −23.4 | −8.7 | 14.7 | 427 |
| landing-2m | **ours (rookie)** | 8.0 | −24.7 | −4.9 | 19.8 | 272 |
| landing-2m | ours (pro) | 8.0 | −26.3 | −8.7 | 17.5 | 338 |
| landing-2m | ref 12 rock steady big jump | 8.0 | −28.8 | −5.4 | 23.4 | 153 |
| landing-2m | ref 14 roller coaster huge jump | 7.0 | −26.2 | −6.4 | 19.8 | 287 |
| crash-respawn | **ours (rookie)** | 7.0 | −26.2 | −6.0 | 20.1 | 335 |
| crash-respawn | ours (pro) | 7.0 | −27.7 | −6.6 | 21.2 | 471 |
| crash-respawn | ref 04 A-license crash-checkpoint-respawn | 5.5 | −22.4 | −7.7 | 14.7 | 417 |
| crash-respawn | ref 13 roller coaster crash-instant-restart | 7.0 | −17.4 | −0.6 | 16.8 | 554 |

Before the round-3 mix changes (same beats, v1 engine level / wind): start 585 Hz, wheelie −32.1 dBFS / 716 Hz,
landing 1620 Hz, crash 475 Hz — the wind and the intake wash were the brightness, the closed-throttle floor the
quietness. Where we still differ: the **wheelie** is 7–8 dB quieter than the reference because v2's wheelie *is* a
2 m/s balance on the slipping clutch at ~1700 rpm (physics' truth, `reportRpm`), while the reference clips are
power wheelies over log ramps at speed — a physics/track difference, not an audio one; the **crash** cuts are 4–9 dB
quieter than the reference (ref 13 is a barrel explosion peaking −0.6 dBFS); the references also carry the games'
music under everything, which lifts their RMS and pulls their centroids down.

**CPU** (plain node, `npx tsx`, best of 3 over the 17 s gauntlet, 800 samples per update): run scene **0.26–0.28
ms per 60 Hz frame**, results scene (crowd + music + rooms all on) **0.37–0.39 ms** — under the 0.5 ms budget;
`beats.ts` prints 0.28–0.40 ms on its cold first renders. Under vitest the same loop reads ~1.45× (worker + transform
overhead), so the test gate is 0.8. Worklet chunk after round 3: 40.9 KB min / **13.3 KB gz** (round 2: 8.4 KB gz;
budget 40 KB).

WAVs and spectrograms: `npx tsx src/audio/tools/beats.ts <outDir> --ref <refWavDir> [--bike pro]` writes
`<beat>-<bike>.wav`, `.spectrogram.png`, `ref-*.spectrogram.png` and `report-<bike>.json` (sha256, deterministic
flag, the measures, ms per update).

### 10.6 Tests (`pnpm vitest run src/audio`: 36)

Model (19): golden stream hash re-stamped `0e821b2a87108a99` (the header grew: `scene`, `crowd`, `torque`, `bike`,
`hop`; `P_HEADER` 20 → 28); v2 landing curve (10 → 0.34, 20 → 0.52, 42 → ≥ 0.78, 60 → 1); torque vs the class
curves; the wheelie control's silence; the v2 clutch flag (3500 below 7 m/s, off above); hop creak + snap edges;
crowd density geometry; roar / cheer (≥ 0.5 s air only) / groan / applause and their silence out of earshot; ≤ 3
body thuds; scene inference and override. DSP (17): crowd bed level and silence, reactions' lift and the clap crest,
music level / determinism / per-seed difference / in-key margin / silence in `run`, finish → results bed → cut by
restart, the stinger family's fundamentals, canyon slap-back and the snow's short tail, the CPU gate; the round-2
suite unchanged (snow bed re-levelled −31 dB after the hush pushed it under −45 dBFS).

### 10.7 What still reads synthetic (the tells, from the spectrogram pairs)

1. **The engine's top end is still too even.** The reference's 500 Hz–3 kHz is a *dotted* pulse texture with the
   dots spreading as rpm rises; ours is denser and flatter (the harmonic bank's eight steady partials + the intake
   noise). Round 3 moved the balance toward the pulses and cut the wash 6 dB; the next step is a per-cycle
   variation of the pulse spectrum (a resonator excited per firing with seeded Q / centre jitter) instead of a bank.
2. **The wheelie beat** cannot match the reference's power wheelie while v2's wheelie is a 2 m/s clutch balance —
   physics / bot territory (a track with a log-ramp wheelie at 8–10 m/s would give the audio a real one).
3. **The crowd** is a formant murmur; it has no words, no individual voices in the cheer beyond the whistles. It
   reads as a crowd at −33 dBFS under an engine; solo'd it is obviously synthetic.
4. **The music** is a competent loop, not a composition: no B section, no fills beyond the results' ghost kick.
5. **Countdown pings**: the reference's are thin ~2.4 kHz pings; ours are D5 brass stabs by design (the family).
   Worth an A/B on its own.
6. Nothing here has been *heard* by a person yet — the blind audio A/B (P6 done line, ≥ 2/6) still needs the harness
   owner's `harness/compare` audio pairs; `beats.ts` produces the clips.

### 10.8 Requests

- **core-game**: call `audio.setBike?.(bike)` where `Game.setBike` / `loadTrack` fixes the class, and
  `audio.setScene?.('menu' | 'results' | 'run')` from `App.goto` / results / run entry (both optional; inference
  covers the common path but a quit-to-menu after a run is only heard as `menu` if the app says so).
- **harness**: `harness/compare` audio pairs from `beats.ts`'s WAVs (mux onto the clips with ffmpeg) for the blind
  A/B; a `harness:audio` stage running `beats.ts` each round so the table above stays current.
- **physics / tracks**: a power-wheelie beat (a log-ramp row at 8–10 m/s) if the wheelie A/B is to be meaningful.


## 11. Round 4 — the engine fires, one pulse at a time (`src/audio/**`)

The round-11 blind audio A/B (docs/design/harness-metrics.md, "Blind audio A/B") took the reference **11 of 12** and
named the same tell eleven ways: *a metronomic, pinned-pitch, mono pulse train under a level that never moves, a
click for a landing, and a crash that replays itself.* Every one of those was measurable, so this round measures
them — before, after, and on the eight reference cuts — with `src/audio/tools/critic.ts`, and closes them.

### 11.1 What changed, tell by tell

| the critics' tell (verbatim) | what it was | round 4 |
|--|--|--|
| "every pulse the same … no per-cycle jitter" / "pitch-locked ~150 Hz tone amplitude-modulated by a metronomic 36.5 Hz pulse" | `EngineVoice` = 8 steady partials at n·fFire + one fixed-frequency (120 + 90·load Hz) exponential pulse; nothing varied cycle to cycle | **per-firing excitation** (`dsp/engine.ts`): each combustion is a 0.7 ms seeded burst into three resonators (pipe 95 Hz·(1 + 0.35·rev + 0.12·load), pipe 2 at 2.37× — inharmonic, body 330 + 260·load + 60·rev Hz) re-jittered ±2.5 % per firing; cycle period × (1 ± 5 % idle → ± 2.2 % load); amplitude ± 15 %; misfires at idle (p 0.05); a seeded hunt (17-cycle random walk, ± 3 % rate / ± 2.4 dB) below 25 % load; overrun pops (closed throttle > 2500 rpm, p 0.18) |
| "nothing above 3 kHz" / "every 35 ms combustion pulse is a click that drops the whole spectrum by 25 dB" | the pulse *was* the whole engine; between pulses only the −32 dB intake wash | a per-pulse exhaust noise burst (HP 1.5 kHz → LP 2.5 + 5.5·load kHz, τ 2.5 + 3·load ms) and a continuous bed: decorrelated intake hiss gulped once per cycle (−46 + 14·load dB), a mechanical 1.1 kHz bed (−46 dB), valve ticks at 2·fFire |
| "no stereo" (L/R 0.99, S/M 0.05–0.08) | the engine was a mono buffer added to both channels | the engine renders stereo: dry at pan −0.15, the exhaust path through a 30 ms tapped early-reflection line (5.9 / 13.7 / 27 ms right, 9.3 / 19.1 ms left, damped); the intake hiss is independent noise per ear; the wind rush is delayed 7.3 ms to the right ear with its own hiss; the tyres sit at ±0.35 |
| "level never leaves a 4.6 dB window" / "no speed-linked wind or tyre noise rises" | wind −38 + 14·w dB and tyres −5 dB trim sat 16 dB under the engine at 19 m/s | wind −36 + 20·w dB (−44 → −29 dBFS over 0 → 19 m/s, measured), tyre trim −2 dB (−43 → −29 dBFS); the engine's level law is now −5 + 5·√load + torque + speed + 4·lug − 8·overrun dB over a per-pulse energy 4·(0.5 + 0.35·load + 0.15·lug)/(1 + 3·rev): idle ≈ −28 dBFS, WOT ≈ −16, overrun ≈ −34 — the three states are ≥ 6 dB apart with their own centroids |
| "its landing is a 20 ms click followed by the bed getting quieter" / "a 50 ms blip standing in for the 2 m landing" | `landing` recipe: 180 → 55 Hz partial decaying in 0.14 s, brown noise 0.04 s, then a −6 dB duck on the whole game bus | **thump and settle**: 110 → 62 Hz body thump (0.4 s partial, 70 ms hold, 0.55 s envelope), the compression's brown whump (0.22 s), a 2–3.5 kHz chassis rattle 4 ms after, a new `scrub` transient (kind 27: 1.4–3.2 kHz rubber scrub with 48 Hz chatter, gain = the landing's, pitch = speed/20) — and **no duck on a landing** (the crash still ducks) |
| "a wheelie with no throttle feathering" / "a dry, mono, unmodulated idle loop where a wheelie should be surging" | physics' truth: the v2 wheelie is a 2 m/s balance on the slipping clutch at 1550–1770 rpm, throttle 0.03–0.13 (probed: `state.engine.rpm` over the beat) — there is no rpm to surge with | a new model output **`lug`** (spare header slot 24: front up, rear down, < 6 m/s, throttle on, rpm < 2600) voices **load, not rpm**: +4 dB, heavier pulses, pipe Q 5 → 7, the deep hunt (± 6 % rate / ± 8 dB), more misfires, muffler +2.5 kHz, burst +8 dB — a laboured single held at the balance point. The beat's rpm (14.1 → 14.8 pulses/s) is physics'; see 11.5 |
| "the identical impact sequence plays twice 1.8 s apart (r = 0.67)" | `flat-test/crash.json` replays the same crash after the 1.0 s auto-restart; every one-shot recipe was a pure function of (kind, gain, pitch), every partial started at phase 0 | **per-event variation** (`VoicePool.vary`): a second rng reseeded on every trigger from (seed, kind, occurrence index) — determinism kept (the same recording renders the same bytes) but the *n*-th crash never replays the first: impact / grunt / fault stamp / debris / ticks / body thuds / landing / starter all draw centres, decays and timing from it, and every physical one-shot's partials start at a per-event phase (the UI stinger family keeps phase 0 — a synth stab is phase-coherent by design). The crowd groans **once per crash** (`groanMinGapS` 4 s). The engine **dies** rather than fades: the crank runs 1500 → 150 rpm (`stallDrop` 0.9 over 0.5 s) under a 1 − k² gain — sparse slowing putts; the respawn is the starter + catch with its own whir length / pitch / chatter rate per respawn |
| (start gate) "no clutch hold or limiter" | the limiter dropped 1 cycle in 3; at 83 firings/s the reflections and the ring bridged a 12 ms gap | the rev limiter cuts **two consecutive cycles in six** (same duty, a 24 ms gap), resets the pipe / body resonators and kills the intake gulp on a cut — an ignition-cut stutter (≥ 0.8 dB off the level, tested) |

Model changes (`model/`): `lug`, `scratch.speed` (the scrub reads it — events carry no velocity), `lastGroanAt` kept
across restarts, the landing duck removed, `crashFadeS` 0.35 → 0.5 / `stallDrop` 0.55 → 0.9. The golden stream hash
is restamped `51351dbc623cc60f` (`lug` in the header; the transient stream gained `scrub`).

### 11.2 Measured the way the critics judged — `tools/critic.ts`

`npx tsx src/audio/tools/critic.ts <wav> [--repeat a0,a1,b0,b1]` prints, per WAV: **jitter %** (std / mean of the
combustion-pulse onset intervals from the 60–400 Hz envelope over the steadiest 2 s, intervals kept within 0.6–1.6 T
so a misfire or a double trigger is not timing) and **r1** (the envelope's autocorrelation at the firing period —
1.00 = a metronome; timing jitter, misfires, amplitude jitter and hunting all pull it down); **level range** (p95 − p5 of
200 ms RMS over the cut); **centroid** p10–p90 (4096-pt Hann frames above −55 dBFS); **L/R** Pearson correlation and
side/mid RMS; energy **> 3 kHz** re the whole; the biggest **60–120 Hz onset** (band energy 150 ms after vs 150 ms
before) with the 400 ms RMS envelope after it in 50 ms steps; and **repeat r**, the max normalised cross-correlation
between two windows over ± 20 ms of lag. "Before" = round 3's WAVs (`beats.ts` at 5649aa6); "after" = the WAVs
`pnpm harness:audio` rendered for this round's pairs; the references are `reference/evolution-gameplay/audio/*.wav`
(they carry the games' music under the engine, which is why their r1 is low and their p10 centroid sits at 50 Hz).

| clip | RMS dBFS | jitter % @ pulse, r1 | level range dB | centroid Hz p10–p90 | L/R corr / S/M | > 3 kHz dB | thump 60–120 Hz +dB [env re peak, 50 ms steps] | repeat r |
|--|--|--|--|--|--|--|--|--|
| start **before** | −18.2 | — @ 59 Hz, **0.75** | 21.3 | 170–376 | **1.00 / 0.05** | −19.3 | +5.2 [0 −6 −6 −6 −6 −4 −2 −4] | — |
| start **after** | −19.0 | — @ 31 Hz, 0.59 | 12.0 | 191–626 | 0.65 / 0.46 | −15.7 | +5.0 [−5 −4 −4 −4 −2 0 −1 0] | — |
| ref start-01 / 08 | −23.8 / −21.3 | — / — , 0.50 / 0.55 | 20.8 / 33.3 | 166–861 / 268–1117 | 0.86 / 0.28 · 0.62 / 0.49 | −19.4 / −14.2 | +12.0 / +18.6 | — |
| wheelie **before** | −29.7 | **0.7 @ 14.7 Hz, 0.97** | 12.1 | 174–423 | **0.99 / 0.08** | −20.9 | +5.6 | — |
| wheelie **after** | −20.0 | **6.7 @ 14.1 Hz, 0.74** | 8.2 | 165–299 | 0.59 / 0.56 | −24.4 | +11.4 [0 −4 −3 0 −4 −4 −1 −5] | — |
| ref wheelie-02 / 05 | −21.6 / −23.4 | — (music) | 15.0 / 18.2 | 313–1131 / 276–817 | 0.84 / 0.43 · 0.87 / 0.43 | −15.3 / −19.7 | +22.7 / +12.9 | — |
| landing **before** | −24.7 | — @ 37 Hz, 0.77 | **5.3** | 188–328 | **0.99 / 0.06** | −23.1 | **+5.5** [−3 −7 −8 −5 −6 −3 −1 0] | — |
| landing **after** | −22.1 | — @ 38 Hz, 0.63 | 10.3 | 225–786 | 0.68 / 0.45 | −19.1 | **+15.0 @ 5.25 s [−4 0 −2 −8 −9 −11 −10 −12]** | — |
| ref landing-12 / 14 | −28.8 / −26.2 | — | 16.9 / 21.7 | 48–507 / 50–666 | 1.00 / 0.05 · 1.00 / 0.03 | −24.2 / −22.9 | +10.3 [−4 0 0 −1 −2 −2 −7 −2] / +27.8 [−19 −6 0 −1 −2 −6 −9 −11] | — |
| crash **before** | −26.2 | **0.9 @ 12.5 Hz, 0.92** | 19.4 | 167–670 | **0.99 / 0.07** | −18.6 | +14.0 | **0.66** |
| crash **after** | −23.6 | **3.1 @ 12.4 Hz, 0.84** | 19.2 | 169–551 | 0.71 / 0.43 | −18.9 | +15.4 [−14 −12 −6 −4 0 −2 −1 −2] | **0.35** |
| ref crash-04 / 13 | −22.4 / −17.4 | — , 0.47 / — | 16.1 / 32.2 | 263–915 / 146–812 | 0.92 / 0.38 · 1.00 / 0.01 | −18.5 / −19.9 | +16.5 / +25.7 | — |

Read across: the pulse train's periodicity fell from a metronome's 0.92–0.97 to 0.74–0.84 with 3–7 % measured
timing jitter (at 30–60 firings/s the pipe ring defeats onset picking, so r1 carries it: 0.59–0.60 vs 0.75–0.77);
L/R went from 0.99–1.00 / 0.05–0.08 to 0.59–0.72 / 0.42–0.56 against the references' 0.62–0.92 / 0.28–0.49 (two of the
reference cuts are themselves mono captures); the landing went from a +5.5 dB click to a +15.0 dB thump settling over
350 ms; the crash's replay correlation from 0.66 to 0.35; the wheelie and landing level ranges from 12 / 5 dB to 8 / 10
dB (the wheelie is discussed below). The launch's wind and tyre rise: ambient bus −44 → −29 dBFS and tyres −43 → −29
over 2 → 19 m/s under an engine at −18 (`rise.ts` probe, 1 s windows). Reference spectrograms and ours:
`harness/out/audio-beats/*.spectrogram.png`.

`beats.ts` table (unchanged tool): start −19.0 dBFS / 474 Hz (r3 −18.2 / 310; ref −23.8 / 370, −21.3 / 597), wheelie
**−20.0** / 234 (r3 −29.7 / 314; ref −21.6 / 512, −23.4 / 427), landing −22.1 / 368 (r3 −24.7 / 272; ref −28.8 / 153,
−26.2 / 287), crash −23.6 / 279 (r3 −26.2 / 335; ref −22.4 / 417, −17.4 / 554). Every beat renders **byte-identically**
twice in one process and across processes (`pnpm harness:audio` twice: start `cc53c2f4f340…`, wheelie
`ae263d163473…` both runs).

### 11.3 CPU and size

The new engine is **cheaper** than the harmonic bank (no per-sample `sin`): 0.093 vs 0.117 ms per 800-sample frame
alone (4000 rpm, load 0.5); the stereo wind costs +0.009 (a delayed tap, not a second generator). Whole mix in plain
node (`renderScript` gauntlet, warm, best of 3) on a machine at **load average 27** while other agents ran: run scene
**0.44 ms** per 60 Hz frame, results scene **0.57 ms** — under the 0.6 budget even so (round 3 measured 0.26–0.28 /
0.37–0.39 on a quiet box; the vitest gate stays 0.8). `beats.ts` cold: 0.46–0.64 under the same load. Worklet chunk
after this round: **44.2 KB min / 14.4 KB gz** (round 3: 40.9 / 13.3; budget 20 KB gz).

### 11.4 Tests (`pnpm vitest run src/audio`: 38)

Restamped golden hash; the stall test follows the new law (200 ms in: gain > 0.8, rpm < 1125; 500 ms: 0 / 150); the
landing test asserts **no** duck (≤ 1.5 dB) while a crash still ducks 5–7 dB (read on the ambient bed); the limiter
test reads the two-in-six stutter; the fundamental test allows the idle hunt (5 %); the canyon slap-back is read
against the hall's same window (the landing no longer leaves a gap at 190 ms). New: the idle is a jittered stereo
pulse train (12.5 pulses/s, ≥ 2 % jitter, r1 < 0.95, L/R < 0.9, S/M > 0.2) and the lug is louder and moves more than
the idle; a crash and its replay 1.75 s later cross-correlate < 0.5 on the full mix.

### 11.5 What still reads synthetic — and what is not audio's to fix

1. **The wheelie beat is the physics.** `wheelieHoldV3(40, 4)` on lab-flat-200 holds 1550–1770 rpm at throttle
   0.03–0.13 with the rear slipping 0.5–0.8 m/s for eight seconds; the reference wheelies are 5000+ rpm power
   wheelies over log ramps with the rider feathering. `lug` makes ours a laboured, hunting single (8.2 dB of range,
   6.7 % jitter, r1 0.74) — an honest voicing of a 2 m/s clutch balance, not a surge, because there is no rpm to
   surge with (CONTRACT §2.3: audio never re-derives rpm). A power-wheelie beat (a log-ramp row at 8–10 m/s) is the
   physics / tracks request that would make the two wheelie pairs meaningful.
2. **The launch's dynamic range** is 12 dB against the references' 21–33: ours is a smooth pull from a −28 dBFS idle
   to a −16 WOT; the references' start cuts carry READY/GO stingers and music under a much louder first burst.
3. The **crowd** and **music** are as §10.7 left them (a formant murmur; a competent loop).
4. The exhaust burst and intake are still filtered white noise; a granular "dotted" texture per pulse (short seeded
   grains at 2–6 kHz) is the next step if the burst reads as hiss.
5. The 20 kHz noise floor vs the captures' 12–14 kHz brick-wall (harness note) is a pair-build matter, not the synth's.

### 11.6 Requests

- **harness**: the six new pairs are `apair-audio-*-20260915-1514*` (wheelie-02 `151446-3063`, wheelie-05 `151448-8685`,
  landing-12 `151449-731e`, landing-14 `151450-904b`, crash-04 `151451-eaec`, start-01 `151453-6af8`; the `1510*` and
  `1512*` sets are earlier calibrations of the same round — discard); the audio rubric can now also ask the critic for jitter / L/R / thump numbers, since `critic.ts` prints them.
- **physics / tracks**: a power-wheelie beat (above).
- **core-game**: nothing new; `setBike` / `setScene` wiring as §10.8.
