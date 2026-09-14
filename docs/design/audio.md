# Audio design — procedural Web Audio for the trials gauntlet

Status: design, pre-implementation. Owner paths: `src/audio/**`, `harness/audio.ts`,
`harness/audio/analyze.py`.
Scope: every sound the game makes, synthesised at runtime from `PhysicsState`
+ `InputFrame` + `GameEvent`. No downloaded samples. The reference corpus is
silent (all clips were captured without audio), so timings below come from the
gameplay notes (countdown 1.0 s/beat, crash stamp +0.2 s, hard-cut respawn,
checkpoint/finish beats) and the timbres are designed from first principles
toward the character of the real games: a raspy single-cylinder trials engine
that carries the whole mix, dry chassis thunks, tiny UI, big finish.

## 0. Principles

1. **Two layers, hard boundary.** `model/` is pure, allocation-free,
   deterministic TypeScript that turns `(PhysicsState, InputFrame, dt)` into a
   flat `AudioParams` struct. `graph/` is Web Audio nodes that only ever read
   `AudioParams`. The model runs in vitest under node; the graph runs in
   headless Chromium through `OfflineAudioContext`.
2. **Deterministic by construction.** No `Math.random` anywhere in `src/audio`.
   Every stochastic element (noise, misfire, grain jitter, ambient events) uses
   the seeded sfc32 `Rng` from `src/core/rng.ts`, seeded from
   `(trackSeed ^ 0xA0D10) >>> 0`. Two offline renders of the same recording
   must produce byte-identical PCM.
3. **Physics is the truth.** Continuous sources map from state each render
   frame; transients come from `GameEvent` or edge detection on state (wheel
   `grounded` false→true, compression velocity, Δvelocity of the bike body).
4. **Restart is instant.** One-shots hard-stop on `restart`; engine snaps to
   idle in ≤ 30 ms; no tail leaks across the single-frame respawn cut.
5. **Budget.** Audio thread ≤ 3 % of one core at 48 kHz (offline render ≥ 20×
   realtime on this machine); ≤ 90 sounding nodes; zero node allocation per
   frame — one-shots use a pre-built 12-voice pool.

## 1. Integration with the scaffold

`AudioSystem` (`src/audio/index.ts`) stays as-is with one additive change:
`update` grows an optional third argument so the engine can see throttle.

```ts
export interface AudioSystem {
  unlock(): Promise<void>;
  update(state: PhysicsState, dt: number, input?: Readonly<InputFrame>): void; // + input
  onEvent(event: GameEvent): void;
  setMasterVolume(v: number): void;
  dispose(): void;
}
```

`Game.render()` becomes `this.audio?.update(state, dt, this.input)` — a
one-line change for the game owner. Fallback when `input` is undefined:
throttle is estimated as `clamp((spinVel_rear − prevSpinVel_rear)/dt / 40, 0, 1)`
(rear-wheel spin-up), which is worse (no clutch-slip revving on a wheelie) but
keeps the engine alive.

Surface material is not in `PhysicsState`; audio resolves it from `TrackDef`
via `SurfaceProbe` (§4.2): obstacles may carry `params.material`
(`'dirt'|'wood'|'metal'|'concrete'|'rubber'|'grate'`), the bare profile falls
back to a biome default (an `obstacles` entry of `kind: 'biome'`, else a
track-id prefix table). No new required `TrackDef` fields.

Hook extension for the harness (proposed addition to `TrialsHook`, owned by
game; audio provides the implementation):

```ts
audio: {
  /** Render a recording to PCM without a real clock. Resolves to 16-bit WAV as base64. */
  renderOffline(recordingJson: string, opts?: {
    sampleRate?: 48000 | 44100; updateHz?: number; tailSec?: number;
    solo?: 'engine' | 'tyres' | 'chassis' | 'ambient' | 'ui';
    fixture?: string;                 // scripted PhysicsState sequence instead of physics (M3/M5 tests)
  }): Promise<string>;
  /** Last AudioParams the model produced (for assertions). */
  params(): AudioParams;
  /** Ordered log of transient triggers since (re)start. */
  transients(): TransientLog[];       // { time, kind, gain, pan }
};
```

Two `GameEvent` additions are requested from the game owner so the countdown
is audible: `{ type: 'countdown'; n: 3 | 2 | 1; tick; time }` and
`{ type: 'go'; tick; time }`. Until they exist audio infers GO from the first
`tick > 0` after a load/restart and the 3/2/1 ticks are silent (documented gap).

## 2. Module layout (`src/audio/`)

```
src/audio/
  index.ts              AudioSystem contract (+input arg), NullAudio, createAudio()
  webAudio.ts           WebAudioSystem: owns the context, buses, sources; implements AudioSystem
  offline.ts            renderOffline(): OfflineAudioContext driver used by the harness hook
  params.ts             AudioParams struct, createParams(), and EVERY tuning constant (one file to tune)
  model/
    engineModel.ts      RPM state machine, clutch slip, rev limiter, misfire (pure)
    surface.ts          SurfaceProbe: material under each wheel from TrackDef (pure)
    tyreModel.ts        roll/skid parameters from wheel state + material (pure)
    chassisModel.ts     suspension velocity, landing/bottom-out/impact edge detectors (pure)
    duck.ts             ducking envelope state (pure)
    mapParams.ts        mapParams(...) -> AudioParams: the only entry point into model/
  graph/
    context.ts          createContext(), registerWorklets(), unlock gesture handling
    buses.ts            Bus graph, duck gain, limiter, soft clip, master
    engine.ts           EngineVoice: worklet + formant filters + intake noise
    tyres.ts            TyreVoice x2 (rear/front): six per-material chains, skid
    chain.ts            ChainWhine
    transients.ts       VoicePool (12 voices) + recipes: landing, bottomOut, impact, grunt, skidChirp, crash
    ambient.ts          Biome ambience layers + wind
    ui.ts               countdown, go, checkpoint, restart whoosh, fault stamp, finish fanfare
    reverb.ts           2 x feedback-delay-network sends (small room / canyon), no convolver samples
  worklets/
    engine-processor.ts    AudioWorkletProcessor: firing pulse train + harmonic bank (seeded)
    noise-processor.ts     seeded white/pink/brown noise + granular crackle, one instance per consumer
    worklets.ts            registration helper; URLs via new URL('./x.ts', import.meta.url)
  util/
    db.ts               dbToGain, gainToDb, clamp, lerp, expSmooth(prev, target, dt, tau)
    wav.ts              encodeWav16(AudioBuffer) -> Uint8Array (offline only)
```

Vite emits worklets as separate chunks via `new URL(..., import.meta.url)`;
`addModule()` runs once per context. `main.ts` imports `src/audio` lazily on
the unlock gesture, so cold boot (39–80 ms today) is untouched.

## 3. AudioParams — the contract between model and graph

```ts
export interface AudioParams {
  // engine
  rpm: number;                     // 1500..9500
  load: number;                    // 0..1 effective throttle after lag (drives brightness + gain)
  limiterCut: boolean;             // true on frames where the rev limiter is active
  misfire: boolean;                // off-throttle pop requested this frame
  // tyres (index 0 = rear, 1 = front)
  tyreSpeed: [number, number];     // m/s ground-contact speed, 0 when airborne
  tyreMaterial: [Material, Material];
  tyreSlip: [number, number];      // 0..1 normalised longitudinal slip
  // chain
  chainHz: number;                 // sprocket-tooth frequency, 0 when rear wheel stopped
  // chassis / air
  suspVel: [number, number];       // d(compression)/dt, 1/s (signed, + = compressing)
  airborne: boolean;               // both wheels off ground >= 100 ms
  wind: number;                    // 0..1 from |vel|
  // transients requested this frame (graph schedules them, then clears the array)
  transients: Transient[];         // { kind, gain 0..1, pitch 0..1, pan -1..1 }
  transientCount: number;          // used length; the array is pre-sized to 8 and never reallocated
  // scene
  biome: Biome;
  duck: number;                    // 0..1 game-bus attenuation requested by UI/impacts
}
export type Material = 'dirt' | 'wood' | 'metal' | 'concrete' | 'rubber' | 'grate';
export type Biome = 'warehouse' | 'canyon' | 'night-city' | 'foundry' | 'snow';
export type TransientKind =
  | 'landing' | 'bottomOut' | 'impact' | 'grunt' | 'skidChirp' | 'crash'
  | 'checkpoint' | 'countdown' | 'go' | 'restart' | 'fault' | 'finish';
```

`mapParams` is called once per rendered frame (≈60 Hz). It reads the previous
`AudioParams` and a small `scratch` struct for smoothing so the result depends
only on the ordered sequence of `(state, input, dt)` — the offline renderer
replays exactly that sequence at a fixed `updateHz` (default 60 → dt = 1/60,
two physics ticks per update at 120 Hz).

## 4. Sources

### 4.1 Engine — single-cylinder 2-stroke (4-stroke selectable)

**RPM model (`engineModel.ts`), all in RPM unless noted**

```
idle = 1500   redline = 9500   limiterOn = 9300   limiterOff = 8900
R = 0.34 m (wheel radius)   finalDrive = 11.5 (engine revs per rear-wheel rev, ~2nd gear)
rpmWheel  = spinVel_rear * 60/(2π) * finalDrive
rpmFree   = idle + throttle * (redline - idle)
contact   = grounded_rear ? clamp(compression_rear * 3, 0, 1) : 0
slip      = 0.7 * (1 - contact) + 0.3 * throttle            // clutch feathering / rear unloaded
rpmTarget = max(idle, lerp(rpmWheel, rpmFree, slip))
rpm      += (rpmTarget - rpm) * (1 - exp(-dt / τ)),  τ = rpmTarget > rpm ? 0.12 s : 0.35 s
limiter   : hysteresis flag (on above 9300, off below 8900); while on, limiterCut = true and the
            worklet drops every 3rd firing cycle
misfire   : if throttle < 0.08 && rpm > 3200: P(pop this frame) = 0.12 * (dt * 60)  (seeded draw, always consumed)
```
Result: idle burble at rest; instant bark on throttle (wheelie launch within
0.3 s per the notes); rear-wheel-balance pulses read as clutch revs because
`slip` rises as the rear unloads; redline stutter in the air; pops on descents.

**Synthesis (`engine-processor.ts`, AudioWorklet; k-rate params `rpm`, `load`, `cut`, `pop`)**

- Firing frequency `fFire = rpm/60 · (2/strokes)`; 2-stroke → 25 Hz idle,
  158 Hz redline. 4-stroke → 12.5..79 Hz.
- Per firing cycle the worklet emits an **exhaust pulse**
  `A · exp(−t/τp) · (0.6·sin(2π·fp·t) + 0.4·noise)`, τp = 4.5 ms,
  fp = 190 + 60·load Hz. Double-precision phase accumulator; cycles with `cut`
  emit nothing; a `pop` cycle emits ×2.2 amplitude with τp = 9 ms.
- **Harmonic bank** (in-worklet additive, phase-continuous): partials n = 1..8
  at n·fFire, gain n^−k, k = 1.4 − 0.7·load (closed throttle dull, open
  bright); even partials ×0.8 (single-cylinder asymmetry).
- **Intake noise**: seeded white noise (noise-processor) → `BiquadFilter`
  bandpass f = 900 + 1800·load Hz, Q 0.9, gain −18 + 12·load dB.
- **Expansion-chamber formants** (series, graph side): peaking 240 Hz Q 5 +9 dB;
  peaking 620 Hz Q 4 +6 dB; lowpass 2600 + 3800·load Hz Q 0.7; highpass 45 Hz.
- **Body resonance** (frame/tank): peaking 110 Hz Q 8 +4 dB on the pulse path only.
- Level on the engine bus: gain dB = −22 + 12·load + 2·(rpm−idle)/(redline−idle)
  → idle −22 dBFS, full load at redline −8 dBFS.
- Always centre-panned; no Doppler (camera is glued to the bike).

### 4.2 Surface probe and tyre roll

`SurfaceProbe(track)` builds at `loadTrack` a sorted list of x-intervals →
material from obstacles (`params.material`, else per kind: ramp/plank→wood,
drum/barrel→metal, tyres→rubber, grate→grate) and a biome default for the bare
profile (warehouse→concrete, canyon/snow→dirt, night-city→concrete,
foundry→metal). Lookup is a binary search on wheel x (≤ 1 µs, no allocation).

Per wheel (`tyres.ts`): all six material chains exist permanently; only the
active one has gain > 0, cross-faded with `setTargetAtTime` τ 20 ms.

| material | noise | filter (v = m/s) | extras | base gain @ 10 m/s |
|---|---|---|---|---|
| dirt | brown | LP 900 + 60·v Hz, Q 0.6 | crackle grains 25 + 6·v /s, 3 ms, BP 1.8 kHz Q 2 | −18 dB |
| wood | pink | BP 300 + 25·v Hz, Q 1.2 | plank knock peaking 220 Hz Q 6 +8 dB; joint tick every 1.2 m travelled (BP 1.5 kHz, 4 ms, −22 dB) | −20 dB |
| metal | white | HP 700 Hz | ring peaking 1.85 kHz Q 14 +10 dB; drum tick every 0.31 m | −22 dB |
| concrete | pink | HP 250 Hz, LP 4 kHz | none | −20 dB |
| rubber | brown | LP 500 Hz | soft bounce peaking 95 Hz Q 4 +6 dB | −24 dB |
| grate | white | comb via DelayNode, delay = 0.05 m / v (buzz at v/0.05 Hz) | peaking 2.4 kHz Q 8 +6 dB | −19 dB |

Gain = base + 20·log10((v/10)^0.7); silent when `v < 0.15` or the wheel is
airborne (10 ms fade). Front wheel −4 dB, pan +0.15; rear pan −0.15.
Distance ticks (wood joints, drum ridges) are scheduled from the model by
integrating `tyreSpeed·dt` per wheel — deterministic and replayable.

**Skid** (continuous per wheel): when `tyreSlip > 0.25 && grounded`: white
noise → BP centre 1200 + 1400·slip Hz Q 3 → gain −30 + 22·slip dB; plus a
`skidChirp` transient when slip crosses 0.6 upward (sine 2.4→1.1 kHz over
90 ms, −20 dB). `slip = clamp(|spinVel·R − vAlong| / max(|vAlong|, 2), 0, 1)`
where `vAlong` = bike velocity projected onto the bike x-axis.

### 4.3 Suspension and chassis transients (`chassisModel.ts`)

Edge detectors evaluated per update against `scratch` (previous frame):

- **landing**: `grounded` false→true on a wheel.
  `gain = clamp(|vyImpact| / 7, 0.15, 1)` where `vyImpact` = previous-frame
  vertical velocity of the wheel. Rear-first landings give two thunks ≥ 1 frame
  apart (matches the two-stage settle in the notes).
- **bump thunk while grounded**: `suspVel > 6 /s` → landing recipe at
  `gain·0.5`, rate-limited to one per 80 ms per wheel.
- **bottomOut**: `compression ≥ 0.97` rising edge → clank recipe.
- **impact** (non-fault hits: casing a ledge, bar slap):
  `a = |Δvel_bike| / dt`; if `a > 45 m/s²` and no landing this frame →
  impact recipe, `gain = clamp((a − 45) / 120, 0, 1)`, pan `sign(Δvel.x)·0.3`.
- **airborne**: both wheels ungrounded ≥ 100 ms → `wind` ramps in; tyres mute;
  engine `contact` = 0 (free rev).

Recipes (`transients.ts`; a pooled voice = 1 `OscillatorNode` + 1 noise gain
tap + 2 `BiquadFilterNode` + envelope `GainNode` + `StereoPannerNode`; a voice
is claimed ≤ 600 ms, oldest is stolen if all 12 are busy):

```
landing:   sine 180→55 Hz exponential over 60 ms, env A 2 ms / D 140 ms, −12 dB · gain
           + brown noise LP 600 Hz, 40 ms burst, −18 dB · gain
           + body: sine 92 Hz, D 260 ms, −20 dB · gain
           material tweak: dirt noise +6 dB / sine −3 dB; metal adds ring 1.85 kHz Q 14 D 200 ms −24 dB
bottomOut: sines 2.2 / 3.1 / 4.7 kHz, D 180/120/80 ms, −16 dB  + landing recipe at gain 1
impact:    thud sine 95→40 Hz over 120 ms, −10 dB · gain
           + crunch: white noise BP 800 Hz Q 1, 80 ms, −14 dB · gain
           + frame ring: sines 1.32 / 2.07 / 3.41 kHz (±0.4 % seeded detune), D 420/300/200 ms, −22 dB · gain
skidChirp: sine 2.4→1.1 kHz 90 ms, A 5 ms D 80 ms, −20 dB
```

### 4.4 Chain / gear whine (`chain.ts`)

Rear sprocket 42 teeth: `chainHz = spinVel_rear/(2π) · 42` (≈196 Hz at
10 m/s). Two sines (chainHz; 2·chainHz at −8 dB) with 0.3 % seeded random-walk
pitch jitter updated at 4 Hz, through a `WaveShaperNode` `x + 0.3·x³` and
peaking 1.6 kHz Q 3 +6 dB (mesh hiss). Gain −34 dB at 10 m/s, scaling
20·log10(v/10), muted below 1.5 m/s; ×0.5 when airborne. It is a texture
under the engine, never a feature.

### 4.5 Crash and rider (`transients.ts`, from `onEvent({type:'fault', reason:'crash'})`)

Timing follows the notes: impact on the fault frame, CRASH! stamp +0.2 s,
hard cut to respawn ≥ 0.35 s later (or immediately if the player mashes).

```
t = 0       impact recipe at gain 1, two layers: second delayed 35 ms, pan +0.3, −3 dB
t = 0       debris: 6 seeded grains over 0.4 s, each 12 ms white noise BP 1–4 kHz Q 2, −24 dB, decaying 3 dB/grain
t = 40 ms   grunt: glottal pulse train (sawtooth → LP 1.2 kHz) f0 130→95 Hz over 180 ms, 3 % seeded jitter,
            through 3 formant peaking filters F1 620 Hz Q 8 +12 dB, F2 1150 Hz Q 10 +8 dB, F3 2500 Hz Q 12 +4 dB ("uh"),
            env A 8 ms / hold 60 ms / D 140 ms, −14 dB; seeded 50 % second grunt at +260 ms (120 ms, f0 115→90)
t = 200 ms  fault stamp: slap = white noise BP 2.2 kHz Q 0.8, 30 ms, −12 dB + sub tap sine 60 Hz 90 ms −10 dB
t = 0..     engine: load → 0, rpm → idle with τ 0.6 s (bike is debris), gain → −40 dB by t = 350 ms
```
Non-crash faults (`out-of-bounds`, `timeout`) play only the stamp. If a CC0
grunt library is ever wanted, the `grunt` recipe is the single swap point; the
synth version ships first (deterministic, 0 bytes, no licence audit).

### 4.6 Ambient per biome (`ambient.ts`; ambient bus totals −30 dBFS)

| biome | layers |
|---|---|
| warehouse | mains hum sines 60 + 120 Hz −44 dB; pink room tone LP 1.2 kHz −38 dB; HVAC brown noise LP 180 Hz −40 dB; metal creak every 9–17 s (seeded): sine 680→540 Hz 300 ms with 7 Hz AM, −34 dB, small-room send 30 % |
| canyon | wind: brown noise LP 320 Hz, gain LFO 0.13 Hz ±6 dB and 0.31 Hz ±3 dB, −32 dB; bird: FM chirp carrier 3.1 kHz, mod 40 Hz, index 2, 120 ms, every 6–14 s (seeded), −36 dB, pan seeded ±0.6; canyon send 25 % |
| night-city | traffic bed: brown noise LP 140 Hz −36 dB, 0.05 Hz ±4 dB swell; neon buzz sawtooth 120 Hz + sine 240 Hz → LP 400 Hz −46 dB; cricket: 4.2 kHz sine gated at 18 Hz 60 % duty, −40 dB |
| foundry | fire roar: brown noise LP 220 Hz with 6 Hz ±3 dB flutter, −30 dB; crackle grains 4/s BP 3 kHz 5 ms −32 dB; metal clank every 5–11 s (bottomOut recipe at −20 dB, canyon send 40 %) |
| snow | wind as canyon, LP 500 Hz, +3 dB; high hiss white noise HP 6 kHz −46 dB; tyres force `dirt` with crackle ×2 grains/s and LP 700 Hz (snow crunch) |

Ambience is scheduled at track load and audibly starts at unlock; it fades
250 ms on `finish`. Speed wind (all biomes): white noise HP 1.2 kHz, gain
−40 + 16·wind dB, `wind = clamp(|vel|/14, 0, 1)^1.5`, +6 dB while airborne.

### 4.7 UI (`ui.ts`; ui bus, −12 dBFS peaks; dry except checkpoint/finish)

```
countdown 3/2/1: sine 880 Hz, A 3 ms, D 70 ms, −14 dB; one per countdown event (1.000 s spacing)
go:              sines 1320 + 1760 Hz, A 2 ms, hold 60 ms, D 220 ms, −10 dB
                 + whoosh: white noise BP 600→5000 Hz over 250 ms, −20 dB, pan −0.4→+0.4
checkpoint:      triangle C6 1046.5 Hz 90 ms → E6 1318.5 Hz 90 ms, each D 400 ms, −14 dB, small-room send 30 %
restart:         hard-stop all chassis/ui voices and tyres in 5 ms (cancelAndHoldAtTime + 5 ms ramp)
                 + click: 1-sample impulse → peaking 3 kHz Q 2, −20 dB
                 + whoosh: white noise BP 400→4000 Hz over 180 ms, env A 40 ms / D 140 ms, −16 dB
fault stamp:     §4.5 (t = +200 ms after the fault event)
finish:          t = 0     timer-freeze tick = go recipe at −16 dB, no whoosh
                 t = 150 ms fanfare C5 E5 G5 C6 (523.3 / 659.3 / 784.0 / 1046.5 Hz) triangle+sine, 80 ms apart,
                           each D 600 ms, −12 dB, canyon send 40 %
                 t = 0..1.2 s five seeded firework pops: sine 300→80 Hz 60 ms + noise tail LP 2 kHz 400 ms, −18 dB, pan seeded
                 t = 0..1.5 s crowd: pink noise BP 1.1 kHz Q 0.5 swell, −24 dB
                 engine → idle τ 1.0 s; ambience fades 250 ms
```

## 5. Mix bus, ducking, limiter (`buses.ts`)

```
engine ──┐
tyres ───┤            ┌─ reverbSmall  (FDN: 4 delays 23/29/37/43 ms, fb 0.55, LP 3.5 kHz) ─┐
chassis ─┼─► game ───►│                                                                    ├─► master ─► limiter ─► softclip ─► destination
ambient ─┘  (duck)    └─ reverbCanyon (FDN: 4 delays 61/79/97/113 ms, fb 0.78, LP 2 kHz) ─┘
ui ────────────────────────────────────────────────────────────────────────────────────────┘
```

- Bus trims (dB): engine −6, tyres −8, chassis −4, ambient −18, ui −8;
  master −3. `setMasterVolume(v)` applies `v²` (perceptual) on master.
- **Ducking**: `game.gain` = `dbToGain(−6·duckImpact − 3·duckUi)` via
  `setTargetAtTime`, τ 15 ms attack / 120 ms release. `duckImpact` = 1 for
  300 ms after any `impact`/`crash` transient with gain ≥ 0.5; `duckUi` = 1
  during the first 200 ms of checkpoint/finish/go. Both envelopes are computed
  in the model (`duck.ts`) and delivered as `AudioParams.duck`, so they are
  deterministic and testable in node.
- **Limiter**: `DynamicsCompressorNode` threshold −6 dB, knee 0, ratio 20,
  attack 0.001 s, release 0.08 s → `WaveShaperNode` tanh curve (2048 points,
  drive 1.2, oversample `'2x'`). Targets: every harness render peaks ≤ −1 dBFS;
  a clean 20 s run integrates to −16 ± 2 LUFS (ffmpeg `ebur128`).
- **Panning**: `StereoPannerNode` per source; engine centre, wheels ±0.15,
  transients use the recipe `pan`.

## 6. Deterministic parameter mapping — `mapParams`

```ts
export interface ChassisScratch {   // previous-frame memory; the only state the model keeps
  prevVel: Vec2; prevGrounded: [boolean, boolean]; prevCompression: [number, number]; prevWheelVy: [number, number];
  airborneFor: number; lastThunkAt: [number, number]; travel: [number, number] /* m since last distance tick */;
  rpm: number; load: number; limiterOn: boolean; wind: number; duckImpactUntil: number; duckUiUntil: number; time: number;
}

export function mapParams(
  out: AudioParams,                                    // reused, mutated in place
  state: PhysicsState, input: Readonly<InputFrame> | undefined, dt: number,
  probe: SurfaceProbe, scratch: ChassisScratch,
  rng: Rng,                                            // seeded from the track seed; advanced only here
): void;
```

Rules that make it replayable:
- All musical smoothing (RPM lag, gain lag, wind, duck envelopes) lives in the
  model with explicit `dt`; graph-side `setTargetAtTime` (τ ≤ 20 ms) is only a de-zipper.
- `rng` is drawn in a fixed order per update (misfire, grain jitter, ambient
  event, detune) even when a result is unused, so live and offline never desync.
- `transients` is pre-sized with `transientCount`; the graph schedules entries at
  `at` (live: `ctx.currentTime`; offline: `u / updateHz`, sample-aligned) and zeroes the count.
- Live runs `mapParams` at render rate with real `dt`; offline runs at a fixed
  60 Hz. Live differs slightly (frame jitter) — accepted; the offline render is
  the bit-stable reference artefact.
- `restart` resets `scratch` (except `time`) so no stale edge fires after the
  cut; the first update after a restart cannot emit a landing even though both
  wheels go airborne→grounded in one frame.

## 7. Code-level API sketch (`webAudio.ts`)

```ts
export class WebAudioSystem implements AudioSystem {
  private ctx: BaseAudioContext | null = null;
  private buses!: Buses; private engine!: EngineVoice; private tyres!: [TyreVoice, TyreVoice];
  private chain!: ChainWhine; private pool!: VoicePool; private ambient!: Ambient; private ui!: UiSounds;
  private readonly params = createParams();
  private readonly scratch = createScratch();
  private rng = new Rng(0); private probe: SurfaceProbe | null = null;
  private unlocked = false; private readonly pending: GameEvent[] = [];
  readonly transientLog: TransientLog[] = [];          // only filled when opts.log is set (offline)

  constructor(private readonly opts: { context?: BaseAudioContext; strokes?: 2 | 4; log?: boolean } = {}) {}

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    this.ctx = this.opts.context ?? new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
    await registerWorklets(this.ctx);                                     // engine-processor, noise-processor
    this.buses = buildBuses(this.ctx);
    this.engine = new EngineVoice(this.ctx, this.buses.engine, this.opts.strokes ?? 2);
    this.tyres = [new TyreVoice(this.ctx, this.buses.tyres, -0.15), new TyreVoice(this.ctx, this.buses.tyres, +0.15)];
    this.chain = new ChainWhine(this.ctx, this.buses.tyres);   this.pool = new VoicePool(this.ctx, this.buses.chassis, 12);
    this.ambient = new Ambient(this.ctx, this.buses.ambient, this.buses.reverb);
    this.ui = new UiSounds(this.ctx, this.buses.ui, this.buses.reverb, this.pool);
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') await this.ctx.resume();
    this.unlocked = true;
    if (this.probe) this.ambient.setBiome(this.probe.biome, this.ctx.currentTime);
    for (const e of this.pending.splice(0)) this.onEvent(e);
  }

  /** Game.loadTrack calls this (new, additive) so the probe and rng follow the track. */
  setTrack(track: TrackDef, seed: number): void {
    this.probe = new SurfaceProbe(track);
    this.rng = new Rng((seed ^ 0xa0d10) >>> 0);
    resetScratch(this.scratch);
    if (this.unlocked) this.ambient.setBiome(this.probe.biome, this.ctx!.currentTime);
  }

  update(state: PhysicsState, dt: number, input?: Readonly<InputFrame>): void {
    if (this.unlocked) this.updateAt(state, dt, input, this.ctx!.currentTime);
  }

  /** Offline variant: explicit schedule time. Live update() delegates here. */
  updateAt(state: PhysicsState, dt: number, input: Readonly<InputFrame> | undefined, at: number): void {
    if (!this.probe) return;
    mapParams(this.params, state, input, dt, this.probe, this.scratch, this.rng);
    const p = this.params;
    this.engine.set(p.rpm, p.load, p.limiterCut, p.misfire, at);
    this.tyres[0].set(p.tyreSpeed[0], p.tyreMaterial[0], p.tyreSlip[0], at);
    this.tyres[1].set(p.tyreSpeed[1], p.tyreMaterial[1], p.tyreSlip[1], at);
    this.chain.set(p.chainHz, p.airborne, at);
    this.ambient.setWind(p.wind, p.airborne, at);
    this.buses.duck(p.duck, at);
    for (let i = 0; i < p.transientCount; i++) {
      const t = p.transients[i]!;
      this.pool.trigger(t, at);
      if (this.opts.log) this.transientLog.push({ time: at, kind: t.kind, gain: t.gain, pan: t.pan });
    }
    p.transientCount = 0;
  }

  onEvent(e: GameEvent): void { this.onEventAt(e, this.ctx?.currentTime ?? 0); }

  onEventAt(e: GameEvent, at: number): void {
    if (!this.unlocked) { this.pending.push(e); return; }
    switch (e.type) {
      case 'checkpoint': this.ui.checkpoint(at); this.scratch.duckUiUntil = this.scratch.time + 0.2; break;
      case 'fault':
        if (e.reason === 'crash') { this.pool.crash(at, this.rng); this.scratch.duckImpactUntil = this.scratch.time + 0.3; }
        this.ui.faultStamp(at + 0.2); this.engine.dead(at); break;
      case 'finish': this.ui.finish(at, this.rng); this.engine.toIdle(at, 1.0); this.ambient.fadeOut(at, 0.25); break;
      case 'restart':
        this.pool.stopAll(at); this.tyres[0].mute(at, 0.005); this.tyres[1].mute(at, 0.005);
        this.engine.reset(at); this.ui.restart(at); resetScratch(this.scratch, /*keepTime*/ true); break;
    }
  }

  setMasterVolume(v: number): void { this.buses?.setMaster(v * v); }
  dispose(): void { this.pool?.stopAll(0); if (this.ctx instanceof AudioContext) void this.ctx.close(); this.ctx = null; this.unlocked = false; }
}
```

`EngineVoice.set` writes `rpm`/`load` to the worklet's k-rate `AudioParam`s and
the formant/lowpass frequencies with `setTargetAtTime(v, at, 0.02)`, gain per
§4.1. `dead()`: load → 0, gain → −40 dB over 350 ms. `reset()`:
`cancelAndHoldAtTime(at)`, then idle rpm/gain with a 25 ms ramp. `toIdle(at, τ)`
is the finish glide.

## 8. Offline rendering (`offline.ts`) and headless verification

```ts
export async function renderOffline(
  recordingJson: string,
  makePhysics: PhysicsFactory,
  track: TrackDef,
  opts: { sampleRate?: 48000 | 44100; updateHz?: number; tailSec?: number; solo?: BusName; log?: boolean } = {},
): Promise<{ wav: Uint8Array; transients: TransientLog[]; paramLog: Float32Array /* rpm per update */ }> {
  const rec = decodeAny(recordingJson);
  const sampleRate = opts.sampleRate ?? 48000, updateHz = opts.updateHz ?? 60;
  const ticksPerUpdate = rec.physicsHz / updateHz;                 // 120 / 60 = 2; asserted integer
  const frames = expandRuns(rec);                                   // RLE runs -> InputFrame per tick
  const updates = Math.ceil(frames.length / ticksPerUpdate) + Math.round((opts.tailSec ?? 1) * updateHz);
  const ctx = new OfflineAudioContext(2, Math.ceil((updates / updateHz) * sampleRate), sampleRate);
  const audio = new WebAudioSystem({ context: ctx, log: true });
  await audio.unlock();
  audio.setTrack(track, rec.seed);
  if (opts.solo) audio.solo(opts.solo);
  const physics = makePhysics(rec.physicsHz); physics.loadTrack(track, rec.seed);
  const rpmLog = new Float32Array(updates);
  for (let u = 0; u < updates; u++) {
    const at = u / updateHz;                                        // exact, sample-aligned schedule time
    for (let k = 0; k < ticksPerUpdate; k++) {
      physics.step(frames[u * ticksPerUpdate + k] ?? NEUTRAL_INPUT);
      for (const e of physics.drainEvents()) audio.onEventAt(e, at);
    }
    audio.updateAt(physics.getState(), 1 / updateHz, frames[u * ticksPerUpdate] ?? NEUTRAL_INPUT, at);
    rpmLog[u] = audio.lastRpm;
  }
  const buf = await ctx.startRendering();
  return { wav: encodeWav16(buf), transients: audio.transientLog, paramLog: rpmLog };
}
```

Every schedule time is `u/updateHz` and every stochastic draw is seeded, so two
renders yield identical float buffers. Chromium's `OfflineAudioContext` supports
`audioWorklet.addModule`, so the same worklet code runs live and offline.
`__trials.audio.renderOffline` wraps this with the current track/physics factory.

**Harness stage — `harness/audio.ts` (`pnpm harness:audio <recording> [--track id] [--solo bus] [--fixture name]`)**

1. Boot the page as `harness:replay` does; in two fresh page loads call
   `__trials.audio.renderOffline(json, opts)`; decode base64 →
   `harness/out/audio/<name>/render-{a,b}.wav` + `transients.json`, `rpm.json`.
2. `sha256(render-a) === sha256(render-b)` → DETERMINISTIC, else FAIL.
3. Judge pictures: `ffmpeg -i a.wav -lavfi showspectrumpic=s=1920x600:legend=1:scale=log spectrogram.png`,
   `-lavfi showwavespic=s=1920x300:split_channels=1 wave.png`. Loudness:
   `ffmpeg -i a.wav -af ebur128=peak=true -f null -` → `I:` (LUFS), `Peak:` (dBTP).
4. `python3 harness/audio/analyze.py a.wav transients.json rpm.json --mode <pitch|onsets|duck|bands|silence>`
   (numpy + stdlib `wave`):
   - **pitch**: `--solo engine` render, 4096-pt Hann FFT hop 800 (60 Hz frames);
     dominant peak < 400 Hz vs `rpm/60·(2/strokes)`; pass if within ±3 % on
     ≥ 95 % of frames with |Δrpm| < 200 between updates.
   - **onsets**: spectral flux, 5 ms hop, adaptive threshold (3× median over
     ±200 ms); every logged transient with gain ≥ 0.3 has an onset within ±8 ms;
     countdown/go onsets spaced 1.000 ± 0.002 s.
   - **duck**: game-bus solo RMS 100 ms before vs after each `impact`/`crash`
     with gain ≥ 0.5 → −6 ± 1 dB.
   - **bands**: per-segment spectra; the 220 Hz (wood) / 1.85 kHz (metal) peaks
     stand ≥ 8 dB over their ±1-octave median.
   - **silence**: after each `restart`, chassis+ui solo RMS in any 100 ms window
     until the next logged transient ≤ −60 dBFS (no leaked tails).
5. `report.json` `{deterministic, sha256, lufs, peakDbtp, pitchPass, onsetPass,
   renderRealtimeRatio}`; `harness:all` gains an `audio` stage: PASS =
   deterministic + peak ≤ −1 dBTP + pitch ≥ 95 % + ratio ≥ 20.

**Unit tests (vitest, node, no AudioContext)** — `src/audio/model/*.test.ts`:
RPM monotonic in throttle at rest; idle when stopped; limiter hysteresis and
2/3 duty in the worklet's pure `cycleGate()` helper; `SurfaceProbe` lookups at
interval edges and beyond track ends; landing edge fires once per touchdown and
never on the first frame after restart; bump-thunk rate limiter; `mapParams`
stream hash (FNV-1a from `src/core/hash.ts` over the numeric fields) equals a
golden value for `flat-test-clear.json` through `MockPhysics`; 1e5 `mapParams`
calls grow the heap < 1 MB.

**Perf gate**: 10 s render at 48 kHz in ≤ 500 ms wall (≥ 20× realtime,
`renderRealtimeRatio`). Live: heap growth over 600 rendered frames with audio
unlocked ≤ 0.2 MB (`perf --audio` creates a page-side `AudioContext`; if it
stays `suspended` for lack of an output device the harness falls back to an
`OfflineAudioContext` driven in 1 s chunks and reports `mode: 'offline'`).

## 9. Known gaps and deferred decisions

- `MockPhysics` has no suspension, slip or airtime: until the real `PhysicsWorld`
  lands, landing/skid/bottom-out checks use scripted `PhysicsState` fixtures
  (`--fixture landing|restart-mash|materials|countdown`, `harness/audio/fixtures.ts`,
  replayed through `updateAt`); recording renders exercise engine/tyre/UI/ambient only.
- Countdown/GO events are proposed, not present, in `GameEvent`.
- No sample assets; a CC0 grunt/crowd pack, if ever added, decodes once at unlock
  and is scheduled through the same seeded path. Music: none — the engine is the soundtrack.

## Build plan

Each milestone is one commit; the acceptance test is what the parent runs.

1. **M1 — Pure model + params contract.** `params.ts`, `model/*`,
   `mapParams`, `SurfaceProbe`, vitest suites; `NullAudio` untouched;
   `AudioSystem.update` gains the optional `input` arg and `Game.render`
   passes `this.input`.
   *Accept:* `pnpm typecheck && pnpm test` green with ≥ 20 new tests; golden
   `mapParams` stream hash for `flat-test-clear.json` via `MockPhysics` is
   identical across 3 runs; heap-growth test < 1 MB over 1e5 calls.

2. **M2 — Engine voice + buses + offline render + harness stage.** Worklets,
   `EngineVoice`, `buildBuses` (limiter + softclip, duck gain present but
   fixed at 0 dB), `renderOffline`, `__trials.audio.renderOffline`,
   `harness/audio.ts`, `analyze.py --mode pitch`.
   *Accept:* `pnpm harness:audio harness/inputs/flat-test-clear.json` → two
   renders SHA-256 identical; engine pitch within ±3 % of
   `rpm/60·(2/strokes)` on ≥ 95 % of steady frames; peak ≤ −1 dBTP; render
   ≥ 20× realtime; `spectrogram.png` shows a rising fundamental with ≥ 5
   visible harmonics through the throttle phase and idle at 25 Hz at rest.

3. **M3 — Tyres, chain, suspension transients, voice pool.** Six material
   chains, skid, `ChainWhine`, landing/bottomOut/impact/skidChirp recipes,
   `VoicePool.stopAll`, fixtures.
   *Accept:* `--fixture landing` (3 m drop, rear-first) produces two onsets
   ≥ 16 ms apart each within ±8 ms of the log; `--fixture materials`
   dirt→wood→metal passes `--mode bands`; `--fixture restart-mash` (5
   restarts 0.5 s apart) passes `--mode silence` (≤ −60 dBFS within 10 ms of
   each restart); determinism still byte-identical; ≥ 20× realtime.

4. **M4 — Crash, grunt, UI, ambient, ducking, reverb.** §4.5–4.7, `duck.ts`,
   the two FDN sends.
   *Accept:* `flat-test-10s.json` with a scripted fault at 6.0 s: impact onset
   6.000 ± 0.008 s, stamp onset 6.200 ± 0.008 s, `--mode duck` −6 ± 1 dB;
   with the proposed countdown/go events (or the `--fixture countdown` stand-in)
   onsets are 1.000 ± 0.002 s apart; each biome's `--solo ambient` render is
   −30 ± 3 LUFS; the full-mix 20 s clean run is −16 ± 2 LUFS with peak
   ≤ −1 dBTP.

5. **M5 — Live integration + ship gate.** `createAudio()` wired in `main.ts`
   behind the first keydown/pointerdown; `?audio=0` opt-out; `harness:all`
   includes the audio stage; `perf --audio`.
   *Accept:* `pnpm harness:all` PASS including audio; `pnpm harness:boot`
   cold boot within +10 ms of today's 39–80 ms (worklet chunks load at unlock,
   not boot); `pnpm build` total audio chunks ≤ 40 KB gzipped; live heap
   growth over 600 rendered frames with audio unlocked ≤ 0.2 MB; ship-gate
   sequence (cold boot → clear track → crash → instant restart) renders with
   engine back at idle gain within 30 ms of each restart and zero leaked tails.
