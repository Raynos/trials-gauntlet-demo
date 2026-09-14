# Headless harness

Drives the game in headless Chromium (SwiftShader WebGL2, no GPU, no window)
through `window.__trials`, the in-page test hook. Nothing here uses a real
clock: the harness owns every physics tick and every rendered frame.

## Commands

| command | what it proves | output |
| --- | --- | --- |
| `pnpm harness:boot [--runs 3]` | cold boot → `__trials.ready` ms, JS heap, WebGL renderer string, first-frame draw calls, restart latency | `harness/out/boot/boot.json` |
| `pnpm harness:gen-input [--seconds 10] [--style wiggle\|throttle] [--out f.json\|f.bin]` | synthesizes a recording | `harness/inputs/*.json` / `*.bin` |
| `pnpm harness:replay <input>` | **determinism gate**: replays in two fresh page loads, asserts identical state hash + finish time (exit 1 on mismatch) | `harness/out/replay/<name>.json` |
| `pnpm harness:capture <input> [--out clip.mp4] [--fps 60] [--mode screenshot\|canvas]` | evidence clip: steps `physicsHz/fps` ticks per frame, screenshots each, ffmpeg → h264 mp4 + 4x2 contact sheet; ffprobe-verified frame count | `harness/out/capture/<name>/{clip.mp4,sheet.jpg,capture.json}` |
| `pnpm harness:perf [--seconds 10]` | in-page `performance.now` render cost (submit-only and readPixels-synced), physics µs/tick, heap growth, GPU-independent counters (draw calls, tris, textures MB, programs) | `harness/out/perf/perf.json` |
| `pnpm harness:all` | ship gate: boot ×3 → replay → capture → perf, non-zero exit if any step fails | all of the above |

All commands accept `--dev` (Vite dev server instead of `vite preview` over
`dist/`), `--build` (force a rebuild first), `--json` (machine output) and
`--verbose` (forward page console).

## Recording format

`src/core/replay.ts`. Header `{version, trackId, seed, physicsHz}` + one input
per tick, RLE-compressed. Inputs are quantized (u8 throttle/brake, i8 lean,
flag byte) *before* physics sees them in both live play and replay, so the two
paths feed physics identical bytes. JSON (`.json`) and binary (`.bin`/`.trin`,
magic `TRIN`) encodings decode to the same frames — `replay` on either gives
the same hash.

## Notes / caveats

- Timing precision inside headless Chromium is 0.1 ms (`performance.now`
  coarsening); sub-0.1 ms numbers print as 0.
- `gl.finish()` returns immediately in Chromium WebGL; the harness syncs with a
  1x1 `readPixels` instead (`__trials.render(true)`).
- SwiftShader is a CPU rasterizer: synced render ms are pessimistic by an
  order of magnitude versus a real GPU. Trend the GPU-independent counters.
- The first synced frame after a scene change pays SwiftShader pipeline setup
  (~200 ms); boot and perf warm before measuring.
- `capture` stops 1 s after the run finishes (`--tail`), so its final hash
  includes tail ticks and only equals the `replay` hash when the recording
  does not finish early.
