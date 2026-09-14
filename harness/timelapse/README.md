# Build timelapse

Progress videos of the game's evolution, one build per commit, captured
headless (SwiftShader WebGL2) exactly the way the evidence harness captures
clips. Nothing here touches the working tree: every commit is built from a
`git archive <sha>` export in a scratch directory, and all outputs live under
`harness/out/timelapse/` (gitignored).

## Run

```
npx tsx harness/timelapse/index.mts                       # build + capture every new commit, re-render the videos
npx tsx harness/timelapse/index.mts --since <sha>         # only commits after <sha>
npx tsx harness/timelapse/index.mts --milestones a,b,c    # override the milestone set for progress-clips.mp4
npx tsx harness/timelapse/index.mts --render-only         # re-render from the ledger, no build/capture
npx tsx harness/timelapse/index.mts --retry-failed        # re-capture commits whose capture failed or was cut short
npx tsx harness/timelapse/index.mts --clips milestones    # 4 s clips only for milestones (stills for the rest)
npx tsx harness/timelapse/index.mts --limit 5             # stop after 5 new commits (budgeting)
```

Only commits not yet in `harness/out/timelapse/commits.json` (the ledger) are
built and captured, so re-running after a round adds the new commits and
re-renders. Builds are cached per sha under `harness/out/timelapse/builds/`.

Environment: `TIMELAPSE_SCRATCH` (export dir root; default `$TMPDIR/trials-timelapse`),
`FFMPEG_PATH` (default `/opt/homebrew/bin/ffmpeg`), `TIMELAPSE_PYTHON`
(default `python3`, needs Pillow: `python3 -c "import PIL"`).

Captures run one at a time; on this machine a modern commit takes ~5 s to
build (offline pnpm install from the store + vite) and ~2 min to capture
(120 screenshots on SwiftShader); the scaffold commits take ~10 s in total.

## Pieces

| script | does |
| --- | --- |
| `build-commit.mts <sha> [<outdir>] [--force]` | `git archive` the commit (minus docs/reference/harness) to scratch, `CI=true pnpm install --offline --frozen-lockfile`, `pnpm build`, copy `dist/` to `builds/<sha>/dist`, trash the export. Skips commits without `package.json`/`src/`. |
| `capture-commit.mts <sha> <dist> [<outdir>] [--track b1-first-ride] [--seconds 4] [--fps 30]` | serve the dist (own static server with COOP/COEP), open `?harness=1&track=b1-first-ride` (falls back to `flat-test`, then whatever loaded), `resize(1280,720)`, `setQuality('high')` when present, hold `{throttle:1, lean:0.5}`, step 4 ticks per frame at 30 fps for 4 s with `render(true)` + `page.screenshot`; keeps `still-0.5s.png`, `still-2.0s.png`, `still-4.0s.png` and `clip.mp4` (h264 crf 20). Whatever the build does — mock physics, loop-out, a crash, a blank canvas — is what gets recorded. A boot that never becomes ready still yields a screenshot. |
| `render.mts [--milestones a,b,c]` | `progress-stills.mp4` (one 2.0 s still per commit, 1.2 s each, 0.3 s crossfade, caption bar + counter, intro/outro cards, final frame held 3 s), `progress-clips.mp4` (milestone clips, captioned, hard cuts, ≤ 60 s), `progress.gif` (stills at 640 px / 12 fps, ≤ 15 MB). |
| `overlay.py` | PIL text burner (this ffmpeg has no drawtext): caption PNGs, title cards, and the whole stills timelapse piped raw into ffmpeg. |
| `lib.mts` | ledger, git, static server, ffmpeg helpers. |

## Outputs (`harness/out/timelapse/`)

```
commits.json              ledger: every first-parent commit, build + capture status, still/clip paths, notes
builds/<sha>/dist         cached build (+ build.json / build.log)
captures/<sha>/           still-0.5s.png, still-2.0s.png, still-4.0s.png, clip.mp4, capture.json
progress-stills.mp4       the whole history, one still per commit
progress-clips.mp4        milestones, 4 s of play each
progress.gif              the stills timelapse for chat
render.json               durations, sizes, milestone list, skipped commits
render/                   captions, cards, per-clip intermediates
```

The caption reads `#NN · <short sha> · <date time> · <subject>`; the counter
top-left is the commit's position in the whole history. The default milestone
list lives in `render.mts` (`DEFAULT_MILESTONES`); the latest commit is always
appended.
