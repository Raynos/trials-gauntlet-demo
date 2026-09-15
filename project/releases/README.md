# Release media — the trailers and montages of each pinned milestone

`harness/out/trailer/` and `harness/out/timelapse/` are working folders: every cut overwrites the last. This folder
is the permanent copy, one directory per pinned version (`RELEASES.md` has the build, tag and alias URL). Files are
committed with the pin and never re-rendered; a re-cut for the same version goes in as `trailer-r2.mp4` next to the
original, it does not replace it.

Public copies: **https://trials-gauntlet-media.vercel.app/** (this folder deployed as a static site by
`pnpm media:deploy`; `vercel.json` here is that project's config). `index.html` is the page; keep it in step.

| version | pin | files |
|---|---|---|
| **v0.1.0** | `94ecb43`, 2026-09-14 | `trailer.mp4` (53 s, 1280×720, the web encode of cut `a1dd083`), `trailer-15s.mp4` (the 15 s cut), `trailer-sheet.jpg` (contact sheet), `trailer.cutlist.json` (beats → source recordings), `timelapse.mp4` (54 s build montage through `f837365`) |
| **v0.2.0** | pending | `trailer.mp4`, `trailer-15s.mp4`, `trailer-sheet.jpg`, `trailer.cutlist.json` from the v0.2.0 cut (`harness/trailer/beats-v2.json`, 13 beats); `timelapse.mp4` = the wave-4 montage |

Per version, the convention: `trailer.mp4` (full cut, web encode ≤ 30 MB), `trailer-15s.mp4`, `trailer-sheet.jpg`,
`trailer.cutlist.json`, `timelapse.mp4` (the build montage up to the pin), optional `notes.md`.
