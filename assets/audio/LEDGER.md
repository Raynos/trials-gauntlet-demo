# ROCKHOP music ledger

Store release D4 / Phase 4 (`docs/plans/STORE_RELEASE.md`). This file records every render: the cue, prompt, seed, model, commit,
weights hash, duration and licence. The shipped picks are marked. Nobody on the project can listen to a render, so every pick below
was made by measurement. **The user can swap any pick** (see [Swapping a pick](#swapping-a-pick)).

## Status (2026-09-22)

| cue | shipped | file (public/audio) | loop | source |
|---|---|---|---|---|
| main menu theme | **yes** | `menu-c017aa05.m4a` 1.46 MB | 32 bars @ 108 bpm = 71.11 s | ACE-Step `menu-b-s47` |
| world map | **yes** | `map-88c58de3.m4a` 1.23 MB | 24 bars @ 96 bpm = 60.00 s | ACE-Step `map-a-s23` |
| ride: COAST | **yes** | `coast-4ec96bd3.m4a` 1.25 MB | 32 bars @ 126 bpm = 60.95 s | ACE-Step `coast-b-s11` |
| ride: ALPINE | **yes** | `alpine-fa9271c0.m4a` 1.02 MB | 24 bars @ 116 bpm = 49.66 s | ACE-Step `alpine-a-s11` |
| ride: QUARRY | **yes** | `quarry-06f54be7.m4a` 1.51 MB | 32 bars @ 104 bpm = 73.85 s | ACE-Step `quarry-b-s23` |
| ride: SNOWLINE | gap | none: rides the ALPINE loop (`RIDE_FALLBACK`, src/audio/music/player.ts) | none | not rendered (below) |
| results sting | gap | none: the procedural finish fanfare + results bed carry it, as before | none | not rendered (below) |

Total under `public/audio/`: **6.48 MB** (budget 15 MB). The music never loads before the first gesture, and never under automation.

**Why two cues are missing.** On 2026-09-22 ACE-Step turbo thrashed this machine: RAM swung between 23 and 99 GB, swap filled
and macOS reported out-of-memory while other sessions were running the harness. On the user's instruction the renders and the
weight downloads were killed, and ACE-Step is not to be relaunched. Round 1 had finished 30 of its 42 renders (menu, map, coast,
alpine and quarry, 6 each), and those are what ship. The next step for SNOWLINE and the sting is a small model: Stable Audio
Open Small (~341 M params), one render at a time, only when swap is below 2 GB and nothing else heavy is running. Its licence
(Stability AI Community Licence) must be re-checked and recorded here first. A CC0 library loop is the other option.

## Generator

| field | value |
|---|---|
| model | ACE-Step 1.5, local on the M5 Max (128 GB) at `~/tools/ace-step`, outside the repo |
| code | https://github.com/ace-step/ACE-Step-1.5 @ `ca1e85fe9430179831e6bc6be790c332190a3866` (2026-08-29, "fix(jetson): remove GPL video codecs…") |
| weights | https://huggingface.co/ACE-Step/Ace-Step1.5 @ `19671f406d603126926c1b7e2adc169acbcade22` |
| DiT | `acestep-v15-turbo/model.safetensors` sha256 `3f6e0797fad420a39bd33979eb6e840e30989e34a3794e843d23b60ec6e422d7` (+ `silence_latent.pt` `a778e9dd…6358b`) |
| 5 Hz LM | `acestep-5Hz-lm-1.7B/model.safetensors` sha256 `f161689da73e5ecefa28ff780d51c2d92a00f056d021d7933c779ed5c6cd7db8` |
| VAE | `vae/diffusion_pytorch_model.safetensors` sha256 `da17edb604c40deaf09e9b24974e590d1ca83a374070e5d0884cfa4bed9a99b0` |
| text encoder | `Qwen3-Embedding-0.6B/model.safetensors` sha256 `0437e45c94563b09e13cb7a64478fc406947a93cb34a7e05870fc8dcd48e23fd` |
| backend | MLX DiT + MLX LM (Apple Silicon), python 3.11.15, torch 2.10.0, mlx 0.30.6 |
| settings | text2music, `[Instrumental]`, instrumental=true, 8 steps, shift 3.0 (turbo), LM "thinking" on (it writes the audio codes), CoT caption / metas / language **off** so the prompt below is exactly what the model saw; bpm, key and 4/4 given; output normalisation off; 48 kHz stereo float WAV |
| driver | `~/tools/ace-step/rockhop_gen.py` (one job at a time, batch 1); jobs from `assets/audio/pipeline/jobs.py` |

All four weight hashes were computed locally with `shasum -a 256`. Each matches the LFS sha256 that Hugging Face publishes for its file.

### Licence evidence (re-checked 2026-09-22)

- **Code: MIT.** `LICENSE` at the commit above reads "MIT License, Copyright (c) 2026 ACEStep".
- **Weights: MIT.** The model card front matter says `license: mit` and its details say "License: [MIT]". The HF API
  reports `cardData.license = mit` for `ACE-Step/Ace-Step1.5` (and for `acestep-v15-xl-sft`, `acestep-v15-sft` and `acestep-5Hz-lm-4B`,
  which were downloaded but not used for anything shipped).
- **Outputs: commercial use allowed.** The model card says: "Commercial-Ready: Unlike many models trained on ambiguous datasets, ACE-Step v1.5 is designed
  for creators. You can strictly use the generated music for **commercial purposes**."
- **Training data** (model card): "Licensed Data: Professionally licensed music tracks. Royalty-Free / No-Copyright Data: A vast
  collection of public domain and royalty-free music. Synthetic Data: High-quality audio generated via advanced MIDI-to-Audio conversion."
- **README disclaimer:** users are encouraged to "verify the originality of generated works, clearly disclose AI involvement, and
  obtain appropriate permissions when adapting protected styles". Our prompts name no artist, game, soundtrack or franchise, and describe only instruments,
  tempo and mood. **Disclosure** is a one-line credit, e.g. "Music generated with ACE-Step 1.5 (MIT)". Adding it to the Credits
  screen is a UI change, filed with the parent.
- Not used, and not allowed: MusicGen/MAGNeT (CC-BY-NC weights), Suno, Udio.
- Plan note: purely AI-generated music is likely not copyrightable by us. That gives no one else a claim against us. Accepted (STORE_RELEASE.md).

## Prompts

Brand mood: sunny expedition / survey kit, confident, playful, outdoor. Not dark neon, not metal. Keys sit around D, the stinger family's key.
`assets/audio/pipeline/jobs.py` is the source of truth.

| cue | bpm / key | A | B |
|---|---|---|---|
| menu | 108, D major | sunny upbeat instrumental adventure theme, bright acoustic and clean electric guitars, punchy live drums, handclaps, warm bass, glockenspiel and marimba melody, confident and playful, outdoor expedition, major key | cheerful instrumental indie rock theme, jangly clean guitars, bouncy bass, tight live drums, bright marimba lead melody, optimistic sunlit outdoor adventure, playful and confident, major key |
| map | 96, G major | light exploratory instrumental, plucked acoustic guitar, marimba, soft shaker, warm upright bass, gentle brushed drums, curious and sunny, planning a summer expedition, major key | laid-back instrumental travel groove, fingerpicked acoustic guitar, ukulele, glockenspiel accents, soft kick and shaker, warm and inviting, relaxed but curious, outdoor adventure, major key |
| coast | 126, E major | bright energetic instrumental surf rock, twangy reverb guitar, driving tom-heavy drums, handclaps, bouncy bass, salty seaside energy, sunny and rhythmic, major key | upbeat instrumental beach rock, clean jangly guitars, steel drum accents, found-metal percussion hits, punchy snare, tambourine, busy bassline, sunny coastal scrapyard, rhythmic and playful |
| alpine | 116, A major | warm driving instrumental folk rock, strummed acoustic guitars, banjo, stomp and clap percussion, upright bass, fiddle melody, forest trail energy, uplifting and confident | instrumental acoustic driving groove, fast strummed acoustic guitar, mandolin, kick drum and tambourine, warm cello bass line, sunny mountain forest trail, energetic and hopeful |
| quarry | 104, E minor | dusty desert rock instrumental, tremolo baritone guitar, big floor toms, shakers and frame drum, deep groove, sun-baked heat haze, percussive and confident | instrumental desert groove, twangy slide guitar, hand percussion, djembe and cajon, rolling bass, dry dusty heat, rhythmic and driving, bright midday sun |
| snowline | 144, B minor | fast tense instrumental, crisp driving breakbeat, icy plucked synth arpeggios, glassy bells, pulsing bass, cold mountain air, urgent but bright, high energy | fast crisp instrumental, pizzicato strings ostinato, tight snare rolls, glockenspiel, driving bass, cold clear winter morning on the ridge, tense and exciting |
| results | 120, D major | short triumphant instrumental fanfare, bright brass stabs and electric guitar flourish, snare roll into a big major chord, celebratory, ends on a ringing final chord | short victorious instrumental jingle, bright horns and glockenspiel, quick drum fill, uplifting major key ending chord that rings out, celebratory and playful |

## Renders (round 1, 2026-09-22)

Every render used ACE-Step 1.5 turbo with the weights above and prompt A or B of its cue. Licence: MIT model, outputs cleared for commercial use by the model card.
The WAVs and sidecar JSONs (prompt, seed, model, timing) are in `~/tools/ace-step/rockhop/r1-turbo/`, outside the repo. The loop encodes of every
render are in `assets/audio/candidates/`, git-ignored and made by `publish.py --candidates`.

| render | cue | prompt | seed | bpm | key | duration s | render s |
|---|---|---|---|---|---|---|---|
| menu-a-s11 | menu | A | 11 | 108 | D major | 100 | 47.0 |
| menu-a-s23 | menu | A | 23 | 108 | D major | 100 | 55.6 |
| menu-a-s47 | menu | A | 47 | 108 | D major | 100 | 32.8 |
| menu-b-s11 | menu | B | 11 | 108 | D major | 100 | 53.7 |
| menu-b-s23 | menu | B | 23 | 108 | D major | 100 | 74.1 |
| **menu-b-s47** | menu | B | 47 | 108 | D major | 100 | 34.4 |
| map-a-s11 | map | A | 11 | 96 | G major | 84 | 23.5 |
| **map-a-s23** | map | A | 23 | 96 | G major | 84 | 23.7 |
| map-a-s47 | map | A | 47 | 96 | G major | 84 | 58.2 |
| map-b-s11 | map | B | 11 | 96 | G major | 84 | 61.2 |
| map-b-s23 | map | B | 23 | 96 | G major | 84 | 56.4 |
| map-b-s47 | map | B | 47 | 96 | G major | 84 | 25.6 |
| coast-a-s11 | coast | A | 11 | 126 | E major | 100 | 32.3 |
| coast-a-s23 | coast | A | 23 | 126 | E major | 100 | 33.5 |
| coast-a-s47 | coast | A | 47 | 126 | E major | 100 | 35.9 |
| **coast-b-s11** | coast | B | 11 | 126 | E major | 100 | 39.4 |
| coast-b-s23 | coast | B | 23 | 126 | E major | 100 | 34.8 |
| coast-b-s47 | coast | B | 47 | 126 | E major | 100 | 37.7 |
| **alpine-a-s11** | alpine | A | 11 | 116 | A major | 100 | 37.3 |
| alpine-a-s23 | alpine | A | 23 | 116 | A major | 100 | 30.7 |
| alpine-a-s47 | alpine | A | 47 | 116 | A major | 100 | 29.9 |
| alpine-b-s11 | alpine | B | 11 | 116 | A major | 100 | 30.3 |
| alpine-b-s23 | alpine | B | 23 | 116 | A major | 100 | 30.3 |
| alpine-b-s47 | alpine | B | 47 | 116 | A major | 100 | 41.2 |
| quarry-a-s11 | quarry | A | 11 | 104 | E minor | 100 | 40.0 |
| quarry-a-s23 | quarry | A | 23 | 104 | E minor | 100 | 40.3 |
| quarry-a-s47 | quarry | A | 47 | 104 | E minor | 100 | 41.2 |
| quarry-b-s11 | quarry | B | 11 | 104 | E minor | 100 | 43.3 |
| **quarry-b-s23** | quarry | B | 23 | 104 | E minor | 100 | 34.2 |
| quarry-b-s47 | quarry | B | 47 | 104 | E minor | 100 | 31.1 |

The 12 jobs still queued (6 snowline and 6 results) never ran: the round was stopped first.

## How the picks were made (by measurement)

`assets/audio/pipeline/analyze.py` measures each render. `ledger.py` gates and scores the renders, and its docstring holds the exact formula. In short:

- **Vocals:** Demucs `htdemucs` separates each render. A render fails if the vocal stem is louder than −14 dB relative to the mix, or within 12 dB of it in more than 8 % of
  one-second windows. Every render passed. The highest was `map-b-s11` at −15.3 dB / 19.8 %, which failed its seam anyway.
- **Silence:** no internal gap of 1.0 s or more under −50 dBFS in the loop body. `menu-a-s11` failed with a 1.8 s break.
- **Tempo:** the beat-interval CV of the loop body must be at most 6 %, with the tempo within 3 % of the prompt's. Every render passed: CV 0.9–3.3 %.
  Each loop's length is also refined to the sample by cross-correlation, and its exact tempo matches the prompt to ±0.01 %.
- **Loop:** the best window of N whole bars (24/32; 40–80 s) starts on a detected beat. Its seam is scored three ways: the
  bar after the wrap must look like the bar that really followed (mel cosine, `seam sim`), the chord must match
  (`chroma`), and the waveform must line up (`xcorr`). Scoring also penalises a level step or spectral flux the wrap adds over the music's own
  continuation. The seam gate is `seam sim ≥ 0.55`.
- **Engine room:** the synth engine's pipe resonator sits at 95–140 Hz, its second mode at 225–330 Hz, and its pulse train at 12–83 Hz
  (src/audio/dsp/engine.ts). Ride loops lose score for 90–350 Hz energy above the ride median. Mastering then takes a −2.5 dB
  bell out at 180 Hz (Q 0.7) on every ride loop.
- **Brightness:** a small penalty if the band above 4 kHz sits below −22 dB relative to the total.

### Mastering and the decoded check (`publish.py`)

Each pick's loop is cut, its head crossfaded (40 ms, equal power) into the audio that followed the window, and the ride loops get the engine EQ above. It is then set to
−16 LUFS integrated with one static gain and limited (look-ahead true peak) to −2 dBTP. The limiter and the EQ run on three copies of the loop, keeping the
middle one, so the result is exactly periodic. The file is padded `[last 0.5 s | loop | first 0.5 s]` and encoded as AAC 160 kb/s 48 kHz `.m4a` with
AudioToolbox (`aac_at`). The player loops `[0.5 s, 0.5 s + len)`. Any decoder offset up to 0.5 s is harmless, which covers the AAC priming
that one decoder trims and another does not. Each `.m4a` is then decoded and measured again:

| cue | LUFS | true peak dBTP | decoder shift (samples) | seam: click / step dB / flux × / err dB | same, at +2112 samples | periodicity err dB | engine band dB |
|---|---|---|---|---|---|---|---|
| menu | −16.02 | −2.15 | 0 | 0.085 / 0.04 / 1.007 / −28.0 | 0.074 / −0.05 / 1.006 / −28.4 | −24.6 | −4.50 |
| map | −16.02 | −3.26 | 0 | 0.103 / −0.10 / 1.020 / −29.9 | 0.018 / −0.08 / 0.988 / −28.0 | −22.9 | −4.22 |
| coast | −16.02 | −2.33 | 0 | 0.233 / 0.11 / 1.015 / −19.9 | 0.116 / −0.06 / 0.988 / −23.9 | −19.8 | −5.40 |
| alpine | −16.03 | −1.73 | 0 | 0.107 / −0.00 / 0.980 / −26.1 | 0.012 / 0.06 / 0.998 / −23.3 | −17.8 | −6.17 |
| quarry | −16.10 | −1.31 | 0 | 0.350 / −0.12 / 1.002 / −29.1 | 0.002 / −0.13 / 0.999 / −22.9 | −19.2 | −6.23 |

How to read the seam columns: `click` below 1 means the jump across the wrap is smaller than the loudest 0.1 % of ordinary sample steps. `step` is the level step the wrap adds over the music's own step, in dB, and `flux ×` is the
spectral change of the wrap divided by the music's own change, where 1.00 means the wrap sounds like the music simply continuing. `err` compares the 50 ms after the wrap with
the 50 ms that really follows, and what remains is AAC coding noise. The engine EQ lowered the ride loops' 90–350 Hz share by about 0.8 dB
(coast −4.65 → −5.40, alpine −5.34 → −6.17, quarry −5.39 → −6.23).

**`src/audio/tools/critic.ts`** was run on 40 s of each decoded pick. Most of its columns (jitter, thump) are engine metrics that don't apply to music. The ones that do:

| cue | RMS dBFS | level range dB (p95−p5, 200 ms) | centroid p10 / p90 Hz | L/R corr | side/mid | > 3 kHz dB |
|---|---|---|---|---|---|---|
| menu | −17.69 | 11.76 | 120 / 926 | 0.88 | 0.25 | −17.59 |
| map | −18.44 | 10.81 | 127 / 960 | 0.77 | 0.36 | −17.06 |
| coast | −17.72 | 7.81 | 94 / 779 | 0.80 | 0.33 | −17.70 |
| alpine | −17.76 | 11.39 | 98 / 1386 | 0.82 | 0.31 | −15.92 |
| quarry | −17.76 | 11.79 | 83 / 1880 | 0.90 | 0.23 | −14.25 |

### In-game levels (src/audio/music/player.ts `MUSIC_LEVELS`)

These are measured against the synth offline at master 1: the procedural menu bed plays at −22.8 LUFS and the results bed at −21.5. A b1 ride's engine
bus measures −15.7 and the whole ride mix −14.4. Given that, the front end and map play at −6 dB (→ −22 LUFS, level with the bed they replace), and ride loops at −8 dB (→ −24 LUFS).
Ride loops also duck under the engine by `1 + 3·load` dB, scaled by the engine's gain, so the music sits about 10 LU under the engine and 4 dB lower at full throttle.
The master volume scales everything, and `setMusicVolume` (0..1) scales the music alone.

## Metrics per render (round 1)

Raw-render columns are measured before mastering: loudness, true peak, clipped samples, tempo, beat-interval CV, the chosen loop window and its seam
(sim / chroma / xcorr; click / step / flux × / err against the natural continuation), band shares relative to the total (dB), the longest internal silence, the vocal stem's
level relative to the mix and the share of vocal seconds, the gates failed, and the score. **PICK** marks the ship. Machine-readable copy: `assets/audio/picks.json`
(the shipped five, decoded check included) and `assets/audio/metrics-r1.json` (every render).


### menu

| render | seed | LUFS raw | TP raw | clip | bpm (err %) | IBI CV % | loop bars @ t0 s | len s | seam sim / chroma / xcorr | click / step dB / flux × / err dB | engine 90–350 dB | air >4k dB | silence s | vox rel dB / % s | gates | score | pick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| menu-b-s47 | 47 | -14.31 | 0.03 | 1 | 107.67 (-0.31) | 1.54 | 32 @ 11.192 | 71.11148 | 0.9579 / 0.9959 / 0.9392 | 0.088 / 1.21 / 1.119 / -12.1 | -4.51 | -19.18 | 0.0 | -54.3 / 0.0 | pass | 4.653 | **PICK** |
| menu-b-s23 | 23 | -13.25 | 0.07 | 1 | 107.67 (-0.31) | 2.08 | 24 @ 38.2665 | 53.33333 | 0.9493 / 0.9942 / 0.917 | 0.043 / 0.64 / 1.524 / -9.0 | -6.5 | -16.95 | 0.0 | -60.5 / 0.0 | pass | 4.49 |  |
| menu-a-s47 | 47 | -14.07 | 0.06 | 1 | 107.67 (-0.31) | 1.44 | 24 @ 28.8392 | 53.34452 | 0.4598 / 0.9953 / 0.3482 | 0.031 / -0.64 / 1.937 / -1.8 | -5.22 | -15.37 | 0.0 | -57.8 / 0.0 | seam | 2.536 |  |
| menu-a-s11 | 11 | -14.63 | 0.05 | 1 | 107.67 (-0.31) | 1.62 | 24 @ 32.1364 | 53.33048 | 0.5545 / 0.9876 / 0.3555 | 0.076 / 1.3 / 1.786 / 3.5 | -5.32 | -15.28 | 1.8 | -44.2 / 0.0 | silence | 2.474 |  |
| menu-b-s11 | 11 | -13.15 | 0.17 | 1 | 107.67 (-0.31) | 1.48 | 24 @ 10.7044 | 53.33992 | 0.61 / 0.9785 / 0.531 | 0.02 / -2.88 / 3.895 / 0.5 | -4.83 | -18.26 | 0.0 | -20.7 / 5.3 | pass | 2.159 |  |
| menu-a-s23 | 23 | -14.21 | 0.01 | 1 | 107.67 (-0.31) | 1.99 | 24 @ 13.3747 | 53.34479 | 0.4979 / 0.9799 / 0.5567 | 0.04 / -2.04 / 3.907 / 1.6 | -6.16 | -15.96 | 0.0 | -61.1 / 0.0 | seam | 1.768 |  |

### map

| render | seed | LUFS raw | TP raw | clip | bpm (err %) | IBI CV % | loop bars @ t0 s | len s | seam sim / chroma / xcorr | click / step dB / flux × / err dB | engine 90–350 dB | air >4k dB | silence s | vox rel dB / % s | gates | score | pick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| map-a-s23 | 23 | -12.96 | 0.01 | 1 | 95.7 (-0.31) | 1.46 | 24 @ 5.7353 | 59.99785 | 0.664 / 0.9928 / 0.6882 | 0.035 / 1.25 / 0.88 / -8.0 | -4.22 | -18.21 | 0.0 | -60.9 / 0.0 | pass | 3.575 | **PICK** |
| map-b-s11 | 11 | -14.05 | 0.21 | 1 | 95.7 (-0.31) | 2.14 | 24 @ 17.0434 | 59.99921 | 0.5115 / 0.9915 / 0.7406 | 0.001 / -0.35 / 0.656 / -4.5 | -4.69 | -17.64 | 0.0 | -15.3 / 19.8 | vocals,seam | 3.441 |  |
| map-b-s47 | 47 | -14.97 | 0.06 | 1 | 95.7 (-0.31) | 1.66 | 24 @ 12.0744 | 60.00075 | 0.6528 / 0.9807 / 0.7772 | 0.011 / 2.09 / 1.015 / -9.0 | -5.28 | -21.63 | 0.0 | -60.7 / 0.0 | pass | 3.323 |  |
| map-a-s11 | 11 | -14.36 | 0.07 | 1 | 95.7 (-0.31) | 1.77 | 24 @ 11.4707 | 59.99923 | 0.7169 / 0.9957 / 0.6059 | 0.134 / 2.38 / 0.996 / -1.7 | -5.38 | -20.04 | 0.0 | -24.4 / 2.4 | pass | 3.271 |  |
| map-a-s47 | 47 | -14.48 | 0.17 | 1 | 95.7 (-0.31) | 1.48 | 24 @ 14.5821 | 60.00477 | 0.5105 / 0.99 / 0.2602 | 0.172 / -1.62 / 2.216 / 0.9 | -7.19 | -17.81 | 0.0 | -56.7 / 0.0 | seam | 2.447 |  |
| map-b-s23 | 23 | -15.26 | 0.3 | 1 | 95.7 (-0.31) | 3.07 | 24 @ 6.8034 | 60.00254 | 0.6495 / 0.8953 / 0.7084 | 0.106 / -3.78 / 4.673 / 2.6 | -5.38 | -19.31 | 0.0 | -59.2 / 0.0 | pass | 1.703 |  |

### coast

| render | seed | LUFS raw | TP raw | clip | bpm (err %) | IBI CV % | loop bars @ t0 s | len s | seam sim / chroma / xcorr | click / step dB / flux × / err dB | engine 90–350 dB | air >4k dB | silence s | vox rel dB / % s | gates | score | pick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| coast-b-s11 | 11 | -13.73 | 0.15 | 1 | 123.05 (-2.34) | 0.87 | 32 @ 16.6487 | 60.95446 | 0.7756 / 0.9884 / 0.2239 | 0.272 / 0.63 / 0.857 / -0.4 | -4.65 | -19.59 | 0.0 | -56.8 / 0.0 | pass | 3.566 | **PICK** |
| coast-a-s23 | 23 | -16.33 | 0.35 | 1 | 129.2 (2.54) | 2.41 | 32 @ 6.2229 | 60.95581 | 0.564 / 0.9728 / 0.7485 | 0.161 / -1.46 / 0.875 / -5.3 | -5.73 | -19.48 | 0.0 | -50.0 / 0.0 | pass | 3.538 |  |
| coast-a-s11 | 11 | -13.29 | 0.05 | 1 | 123.05 (-2.34) | 1.29 | 32 @ 26.8887 | 60.9614 | 0.6935 / 0.994 / 0.4079 | 0.457 / 0.9 / 1.075 / -7.2 | -5.83 | -17.65 | 0.0 | -59.6 / 0.0 | pass | 3.478 |  |
| coast-a-s47 | 47 | -14.78 | 0.44 | 1 | 123.05 (-2.34) | 2.29 | 32 @ 24.5667 | 60.94508 | 0.749 / 0.9816 / 0.482 | 0.041 / 1.36 / 1.027 / -1.6 | -5.14 | -17.86 | 0.0 | -36.2 / 0.0 | pass | 3.362 |  |
| coast-b-s47 | 47 | -17.03 | 0.88 | 1 | 129.2 (2.54) | 2.34 | 32 @ 4.8297 | 60.94502 | 0.7237 / 0.9835 / 0.2083 | 0.174 / 1.78 / 0.928 / 2.7 | -4.59 | -15.61 | 0.0 | -57.7 / 0.0 | pass | 2.813 |  |
| coast-b-s23 | 23 | -14.02 | 0.07 | 1 | 129.2 (2.54) | 2.88 | 24 @ 24.4274 | 45.70229 | 0.6936 / 0.9889 / 0.3493 | 0.026 / 2.36 / 0.944 / 1.1 | -6.67 | -19.55 | 0.0 | -58.8 / 0.0 | pass | 2.773 |  |

### alpine

| render | seed | LUFS raw | TP raw | clip | bpm (err %) | IBI CV % | loop bars @ t0 s | len s | seam sim / chroma / xcorr | click / step dB / flux × / err dB | engine 90–350 dB | air >4k dB | silence s | vox rel dB / % s | gates | score | pick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alpine-a-s11 | 11 | -13.6 | 0.01 | 1 | 117.45 (1.25) | 3.32 | 24 @ 30.3485 | 49.65548 | 0.9084 / 0.9978 / 0.775 | 0.067 / -1.33 / 1.488 / -7.2 | -5.34 | -18.3 | 0.0 | -35.5 / 0.0 | pass | 4.211 | **PICK** |
| alpine-b-s11 | 11 | -14.88 | 0.01 | 1 | 117.45 (1.25) | 2.29 | 32 @ 11.7493 | 66.21115 | 0.5888 / 0.9073 / 0.3055 | 0.185 / -0.77 / 0.898 / -8.9 | -5.29 | -17.21 | 0.0 | -35.3 / 1.0 | pass | 3.038 |  |
| alpine-b-s23 | 23 | -13.6 | 0.49 | 1 | 117.45 (1.25) | 2.22 | 32 @ 7.0821 | 66.21635 | 0.5538 / 0.9786 / 0.4697 | 0.059 / 0.37 / 0.857 / -9.9 | -3.46 | -17.58 | 0.0 | -38.8 / 0.0 | pass | 2.829 |  |
| alpine-b-s47 | 47 | -15.1 | 0.12 | 1 | 117.45 (1.25) | 1.26 | 24 @ 26.494 | 49.65983 | 0.5337 / 0.9829 / 0.4433 | 0.002 / 1.81 / 1.02 / 1.0 | -7.26 | -18.96 | 0.0 | -54.0 / 0.0 | seam | 2.777 |  |
| alpine-a-s23 | 23 | -13.8 | 0.29 | 1 | 117.45 (1.25) | 2.22 | 24 @ 17.7865 | 49.64448 | 0.4713 / 0.9963 / 0.2901 | 0.033 / 1.48 / 1.535 / 2.5 | -5.06 | -16.67 | 0.0 | -32.4 / 0.0 | seam | 2.068 |  |
| alpine-a-s47 | 47 | -15.56 | 0.01 | 1 | 117.45 (1.25) | 2.22 | 24 @ 26.4011 | 49.64775 | 0.5334 / 0.9868 / 0.313 | 0.019 / 5.32 / 1.311 / -3.6 | -5.9 | -16.63 | 0.0 | -60.6 / 0.0 | seam | 1.309 |  |

### quarry

| render | seed | LUFS raw | TP raw | clip | bpm (err %) | IBI CV % | loop bars @ t0 s | len s | seam sim / chroma / xcorr | click / step dB / flux × / err dB | engine 90–350 dB | air >4k dB | silence s | vox rel dB / % s | gates | score | pick |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| quarry-b-s23 | 23 | -16.18 | 0.27 | 1 | 103.36 (-0.62) | 1.87 | 32 @ 13.8855 | 73.84629 | 0.9548 / 0.998 / 0.9643 | 0.31 / 2.28 / 1.179 / -9.3 | -5.39 | -16.13 | 0.0 | -21.7 / 3.2 | pass | 4.235 | **PICK** |
| quarry-a-s47 | 47 | -16.7 | 0.05 | 1 | 103.36 (-0.62) | 1.47 | 24 @ 33.5296 | 55.38475 | 0.7452 / 0.9897 / 0.9378 | 0.014 / 0.31 / 1.199 / -12.3 | -5.54 | -23.29 | 0.0 | -41.0 / 0.0 | pass | 4.102 |  |
| quarry-a-s23 | 23 | -16.86 | 0.01 | 1 | 103.36 (-0.62) | 1.12 | 24 @ 9.9614 | 55.38681 | 0.6376 / 0.9899 / 0.179 | 0.097 / 2.03 / 1.182 / -4.8 | -6.93 | -20.58 | 0.0 | -18.2 / 5.2 | pass | 2.709 |  |
| quarry-a-s11 | 11 | -15.45 | 0.12 | 1 | 103.36 (-0.62) | 1.52 | 24 @ 37.9182 | 55.37354 | 0.5854 / 0.9769 / 0.6901 | 0.053 / 0.61 / 3.237 / -5.9 | -9.42 | -18.79 | 0.0 | -28.4 / 2.1 | pass | 2.382 |  |
| quarry-b-s47 | 47 | -13.68 | 0.03 | 1 | 103.36 (-0.62) | 2.54 | 32 @ 10.0542 | 73.84642 | 0.4175 / 0.9 / 0.2367 | 0.035 / 2.24 / 0.715 / -4.4 | -6.17 | -17.47 | 0.1 | -31.1 / 0.0 | seam | 1.786 |  |
| quarry-b-s11 | 11 | -15.08 | 0.32 | 1 | 103.36 (-0.62) | 1.55 | 32 @ 16.3701 | 73.83494 | 0.5672 / 0.988 / 0.1593 | 0.013 / -1.51 / 5.511 / 19.2 | -7.38 | -20.53 | 0.0 | -43.2 / 0.0 | pass | 0.855 |  |

## Swapping a pick

Every candidate's mastered loop is in `assets/audio/candidates/<render>.m4a`, git-ignored. Audition them on a device, not on this machine. To ship
a different render:

```sh
~/tools/music-analysis/.venv/bin/python assets/audio/pipeline/publish.py ~/tools/ace-step/rockhop/r1-turbo --pick coast=coast-a-s23
```

This re-masters that render, replaces `public/audio/coast-*.m4a`, rewrites `src/audio/music/cues.generated.ts` and `picks.json`, and checks the
15 MB budget. Then add a row here. `publish.py` needs the raw WAVs outside the repo. `~/tools/music-analysis` is a Python 3.11 venv with numpy, scipy, librosa,
pyloudnorm, soundfile and demucs.
