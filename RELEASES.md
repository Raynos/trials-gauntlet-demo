# Releases

Pinned, permanent builds. Each entry is a git tag plus a Vercel alias that points at
that exact deployment forever (production `trials-gauntlet-demo.vercel.app` moves on).

| version | date (UTC) | commit | URL | notes |
|---|---|---|---|---|
| **v0.1.0** | 2026-09-14 | `94ecb43` | https://trials-gauntlet-v0-1-0.vercel.app | The build before the mega build. 15 tracks × 5 biomes, deterministic physics (10 rounds), console front end, real loader, glTF + procedural hero, iOS Safari touch/rotate, PB ghost. Strangers r2: b1 1.5 / b2 3 / e1 6 / b3 4. Blind critic: reference 6/6. |
| **v0.2.0 candidate battery** (not pinned) | 2026-09-15 | `682d05c` | — | **The 38-pair battery ran for the first time (harness round 12): ours 5 / 36 judged — manoeuvre 2 / 22, world 1 / 8, audio 2 / 6; two climb cells unfillable (no >= 30 deg face held 0.6 s on any matrix track).** Every win is a flaw in the reference window; 0 on the 31 clean pairs. Named tells (>= 3 pairs): a camera not motivated by the bike (18 pairs: constant-rate orbit, bolted / welded follow, top-down over landings, foreground geometry crossing the frame), no compression / rebound / settle and a pitch that parks (14), a statue rider and a rider-bike welded through crashes (9), one-frame geometry / light pops (6), the engine's metronomic pulse on a pinned fundamental (4 / 4 engine beats). Record: `harness/out/metrics/battery-v0.2.0.jsonl`; cells `harness/out/compare/battery/manifest.md`; write-up `docs/design/harness-metrics.md` Round 12. v0.2.0 pins at H5's >= 2 / 6 on hero pairs — not met (manoeuvre 2 / 22). |

Release media (the trailer, the 15 s cut, the contact sheet, the cut list and the build montage of each pin) is kept
permanently in `project/releases/<version>/` and served at **https://trials-gauntlet-media.vercel.app/** (`pnpm media:deploy`).

To pin a new one: deploy from a clean `git archive <tag>` export, then
`vercel alias set <deployment-url> trials-gauntlet-v<maj>-<min>-<patch>.vercel.app`
(deployment protection is off for this project so aliases are public).
