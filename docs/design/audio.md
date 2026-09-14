# Audio design — procedural Web Audio for the trials gauntlet

Status: **round 2 implemented** (`src/audio/**`; retuned to physics 2bdd175: auto-clutch launch, 1.4 g impulses, rebounding suspension, stalling crash). Owner paths: `src/audio/**`, this file.
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
    engine.ts         4-stroke single: pulses + harmonic bank + chamber formants + intake
    tyres.ts          8 surface chains, skid, chain whine
    voices.ts         16-voice one-shot pool + every recipe (chassis, crash, UI, ambience events)
    ambience.ts       5 biome beds + sparse events + speed wind
    synth.ts          buses, ducking, reverb sends, limiter, soft clip
    synth.test.ts     pitch tracking, blip latency, limiter duty, onsets, duck, restart, ambience, tyres
  graph/
    worklet.ts        AudioWorkletProcessor 'trials-synth' (Vite chunk via dynamic import('./worklet?worker&url'))
    webAudio.ts       WebAudioSystem: gesture-safe context, worklet → fallback, param posting
    fallback.ts       oscillator-bank engine + noise tyres + native one-shots (no worklet)
  tools/
    fixture.ts        blankState(), gauntlet StateScript (countdown→…→finish, 17 s)
    renderDemo.ts     WAV + spectrogram + ebur128 report (headless listening)
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
