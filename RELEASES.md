# Releases

Pinned, permanent builds. Each entry is a git tag plus a Vercel alias that points at
that exact deployment forever (production `trials-gauntlet-demo.vercel.app` moves on).

| version | date (UTC) | commit | URL | notes |
|---|---|---|---|---|
| **v0.1.0** | 2026-09-14 | `94ecb43` | https://trials-gauntlet-v0-1-0.vercel.app | The build before the mega build. 15 tracks × 5 biomes, deterministic physics (10 rounds), console front end, real loader, glTF + procedural hero, iOS Safari touch/rotate, PB ghost. Strangers r2: b1 1.5 / b2 3 / e1 6 / b3 4. Blind critic: reference 6/6. |

Release media (the trailer, the 15 s cut, the contact sheet, the cut list and the build montage of each pin) is kept
permanently in `project/releases/<version>/` and served at **https://trials-gauntlet-media.vercel.app/** (`pnpm media:deploy`).

To pin a new one: deploy from a clean `git archive <tag>` export, then
`vercel alias set <deployment-url> trials-gauntlet-v<maj>-<min>-<patch>.vercel.app`
(deployment protection is off for this project so aliases are public).
