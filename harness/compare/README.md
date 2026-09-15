# Blind clip comparison (`harness/compare`)

Build a pair (see `docs/design/harness-metrics.md` §4; tags are listed in `RUBRIC.md`):

    pnpm harness:pair <ours.mp4> <ref.mp4> --tag <manoeuvre> [--seed N] [--mask] [--align <ours_s>:<ref_s>] [--out harness/out/compare]

Both clips are normalized to 640x360 @ 30 fps, same frame count (`min(len)`, or `[t0-1.0, t0+2.5]` around the `--align` anchors);
`--mask` blacks out the HUD regions (`mask.ts` `DEFAULT_HUD_REGIONS`). A seeded coin (`Rng(seed)`) decides which clip is A (left).
Outputs: `pair-<id>.mp4` (1280x384, label bar: one square = A/left, two squares = B/right, amber clock), `pair-<id>-sheet.jpg`
(2 rows x 8 frames, row 1 = A, row 2 = B, identical frame indices), and `pair-<id>.answer.json` (chmod 000 - the sealed key).
The last stdout lines are `pair: <mp4>`, `sheet: <jpg>`, `id: <id>`. Intermediates live in `<out>/work/<id>/`.

Run a critic: spawn a sub-agent with `RUBRIC.md`, the sheet (as an image) and the mp4 path. Tell it the tag and that it may
extract frames with ffmpeg. Never give it the answer file, the `pair` stdout `answer` line, or the input file names. It must
answer only the rubric JSON. Use a different `--seed` per critic so sides are balanced.

Log and unmask the verdict (the critic must never run this):

    pnpm exec tsx harness/compare/log.ts <id> --verdict '<json>' [--critic <name>]      # or --verdict-file f.json

It validates the JSON (bad shape -> winner `invalid`), unseals the answer (chmod 600 -> read -> 000), appends a `CompareVerdict`
to `harness/out/metrics/compare.jsonl`, and prints the unmasked result (`ours`/`ref`/`tie`/`invalid`) and per-tag stats:
n, oursWinRate = wins/(n - ties - invalid), positionBias = |P(A wins) - 0.5|.

## Audio pairs (`audio.ts`, round 11)

    pnpm harness:audio [--seed N] [--bike pro] [--beats-only | --pairs-only] [--out harness/out/compare]

Renders the four beats (`src/audio/tools/beats.ts` -> `harness/out/audio-beats/`, table printed) against the reference cuts in
`reference/evolution-gameplay/audio/` (see its README for the raw file and `-ss/-to` of each), then builds six sealed pairs
(`AUDIO_PAIRS`): `apair-<id>.mp4` (black 640x384 picture, the same label bar - one square while A plays, two while B - and clock;
audio = A, 1.0 s silence, B), `apair-<id>-A.wav` / `-B.wav` (both trimmed to `min(len)` <= 8 s from t = 0, each brought to
-23 LUFS integrated with ONE linear gain capped at -1 dBFS peak - no compression), `apair-<id>-sheet.jpg` (spectrograms, A above B,
identical axes, no labels) and `apair-<id>.answer.json` (chmod 000). Sides: `--coin balanced` (default) shuffles three ours-A / three ref-A with `Rng(seed)`; `--coin plain` uses `coinLeft(seed + k)` per pair. The id is
`audio-<beat>-<refNN>-<stamp>-<hex>` so `harness:critic-prompt <id>` (which emits the audio prompt: black by design, WAV / sheet
paths, measure-don't-listen, the `audio` rubric) and `harness:log-verdict <id>` work unchanged. For an audio pair `winner` is the
side the critic believes is the REAL game, so `winnerUnmasked = ours` means the critic took ours for the real one.
