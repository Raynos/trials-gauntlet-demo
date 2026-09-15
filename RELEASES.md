# Releases

Pinned, permanent builds. Each entry is a git tag plus a Vercel alias that points at
that exact deployment forever (production `trials-gauntlet-demo.vercel.app` moves on).

| version | date (UTC) | commit | URL | notes |
|---|---|---|---|---|
| **v0.1.0** | 2026-09-14 | `94ecb43` | https://trials-gauntlet-v0-1-0.vercel.app | The build before the mega build. 15 tracks × 5 biomes, deterministic physics (10 rounds), console front end, real loader, glTF + procedural hero, iOS Safari touch/rotate, PB ghost. Strangers r2: b1 1.5 / b2 3 / e1 6 / b3 4. Blind critic: reference 6/6. |
| **v0.2.0** | 2026-09-15 | `b52dfd0` | https://trials-gauntlet-v0-2-0.vercel.app | **The mega build.** Physics v2 (R6, tag `physics-v2-final`: rider rigid body on a pose servo, brush tyre, Rookie/Pro rows, 157/157 tests, no masked rows), 15 tracks + **5 biome playgrounds**, Broadcast menu, odometer loader with the typed boot plan, G touch strip under the touch-navigation invariant (5184-tap grid, 0 ghosts), 60-cap quality governor + the phone-high tier (b1 205 → 123 draws, 6.57 → 1.59 Mpx), **level reviewer** (REVIEW tab: six segments, notes, Copy review), local leaderboard, `?bench=1` device instrument, WebKit hero gate, ship-gate G11, harness worker pools (reflex 67 → 21 s, e2e 2 327 → 564 s). Trailer + montage: https://trials-gauntlet-media.vercel.app/#v0-2-0. **Mission lines** (`docs/mission.md`): §1 wowed — 38-pair blind battery **ours 5 / 36** (0 of the 31 clean pairs; tells: camera 18, no settle 14, statue rider 9); §2 picture — blind critic r3 2 / 6, battery world 1 / 8; §3 hero — rider tells on 9 / 36 pairs, WebKit drift 2.1 mm; §4 60 fps on a phone — device report #1: low **59.5 fps** at cap 60 (JS 2.1 ms), phone-high modelled 8.8 ms, governor climbs; §5 sound — audio A/B r2 **2 / 6** (the engine loop named 4 / 4); §6 fun — strangers beginner–medium in band, hard on the R6 Pro h1 8 / h3 10 under band, x1 34.5 in band, h2 / x3 one DNF each; the user cleared 6 / 15 on the phone. Gate 22 / 26 under loadavg 65 (the four misses are SwiftShader timing rows + reflex band). |

Release media (the trailer, the 15 s cut, the contact sheet, the cut list and the build montage of each pin) is kept
permanently in `project/releases/<version>/` and served at **https://trials-gauntlet-media.vercel.app/** (`pnpm media:deploy`).

To pin a new one: deploy from a clean `git archive <tag>` export, then
`vercel alias set <deployment-url> trials-gauntlet-v<maj>-<min>-<patch>.vercel.app`
(deployment protection is off for this project so aliases are public).
