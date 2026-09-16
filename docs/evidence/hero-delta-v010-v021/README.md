# Hero delta — the Blender bike + rider shipped at v0.1.0 vs v0.2.1

The user's question (2026-09-16): *"I swear Astra used 70 % of the weekly usage to make the Blender hero and bike AAA but I can't see the
difference in game."* This folder answers it with the GLBs each pin actually serves, rendered in one isolated three.js scene — same
camera, same lights, RoomEnvironment — because the in-game camera moved between the versions (dist 15.3 → 12.0 m, pitch 4° → 21°) and
the physics puts the bike in a different place, so a raw game screenshot is not a fair delta.

| | v0.1.0 (`/models/rider.glb`, `/models/bike.glb`) | v0.2.1 (`rider-street`, `bike`) |
|---|---|---|
| Rider | 11 718 tris, 1 mesh, 1 material, 3 × 1024 textures, 19 bones — the yellow race-suit + blue-helmet mannequin | **44 734 tris** (street) / 51 092 (open-face) / 44 796 (race), 1 mesh, 3 textures (1024 + 512), same 19-bone rig; bare head with hair and a face, hoodie + jeans + trainers; three outfits |
| Bike | 29 356 tris, 16 meshes, 2 materials, 4 textures (2048/1024/64) | **29 940 tris**, 23 meshes, 4 materials, 8 textures (1024/512/128/64) — the same bike: livery and texture set changed, a few parts added (chain, guards); see the delta panels |

Reading: the usage went into the **rider** (≈ 4× the geometry, a real head, three outfits, plus the R7–R9 physics/rig work that makes it a
body rather than a statue); the **bike barely changed**. At the game camera the rider is 20–23 % of frame height, so a 4× mesh reads as
"the suit is a hoodie now", and the garage — the screen meant to show it — covered the hero with cards (see `assets/design/garage/SPEC.md` §0).

Files: `1-3-bike-*.jpg` (before | after | |diff| × 3), `4-6-rider-*.jpg` (before | after), `7-v021-outfits.jpg`,
`rider-turntable-before-after.mp4` / `bike-turntable-before-after.mp4` (360°, 6 s, side by side). Reproduce: serve a folder holding
`viewer.html`, the GLBs under `models/` and a `three` checkout, then `tsx shoot.ts` (stills + stats) / `tsx turntable.ts` (frames → ffmpeg).
GLB URLs: v0.1.0 `https://trials-gauntlet-v0-1-0.vercel.app/load-manifest.json`; v0.2.1 `https://trials-gauntlet-v0-2-1.vercel.app/model-catalog.json`.
