# Hero art integration — Astra's delivery into the game

Opened 2026-09-16 when `HERO_OPEN_WORK.md` was split; this is the plan that file was missing. Owner: Claude + Opus
(the README's standing rule: game integration belongs to us, art to Astra's
[HERO_GARAGE_PRODUCTION.md](HERO_GARAGE_PRODUCTION.md)). Blocked on the user's HR-07 review of the art; not on Astra.
The tracker is [README.md](README.md).

## What is delivered (R33 catalog, R34 variants — provisional)

Authoritative selection: `prototypes/hero-garage/public/assets/catalog.json` (never a filename). Handoff:
[ART_HANDOFF.md](../../prototypes/hero-garage/art/ART_HANDOFF.md).

- Rider: 60.16 MB packed (lossless Meshopt of 186.9 MB raw; 12 renderer comparisons byte-identical), 19 bones,
  26 sockets, six clips (`sit_cruise`, `forward_attack`, `hang_back`, `compression`, `extension`, `landing_absorption`), 39 packed images; KTX2/UASTC
  route proven at 8.69 MiB all-image (WebKit transcodes to ASTC 4x4).
- Bike: 5.68 MB GLB, fork / swingarm / shock motion, chain and hose follow endpoints; two liveries (blue/white,
  charcoal/yellow) — the other three bike skins have no source yet.
- Outfits: art exports for all five existing outfit IDs (mustard Street, charcoal Street, open-face Street, blue/white
  Race, charcoal/yellow Race).
- Rig contract: [rig-contract/README.md](../../prototypes/hero-garage/art/rig-contract/README.md) — raw → Three.js
  name mapping, inverse binds, contact drift < 2.3 µm over 750 frames; the 11 mm sole/peg offset is documented, not a
  contact pass.
- Runtime qualification so far: 30 s desktop WebKit mobile proxy, no errors, deterministic canvas replay, **18 ms p95
  — misses the 16.7 ms desktop gate; not an iPhone 30 fps pass.**

## Budgets it must meet (from `docs/design/CONTRACT.md` and PERF)

Phone-high frame today: ≈ 123 draws / 92 k tris / 1.59 Mpx / model 8.8 ms; bundle 588.8 / 600 KB gz; hero mirrored
twins gate off above 150 k hero tris in the garage. The user's authorisation is a **30 fps mobile garage**; in-level
the 60-cap governor and the phone-high tier stand.

## Sequence

1. **Loader path.** Serve the catalog's rider + bike through `src/render/hero/gltf.ts` / `urls.ts` /
   `models.generated.ts` as a fourth rider family beside classic / blender / img2 (ask #30–31 remove classic and
   img2 — land those first so this is a swap, not a fifth), Meshopt + KTX2 through the existing loader invariant
   (two bars, monotone, 100 at the end), missing-file recovery kept.
2. **Rig binding.** Map the 19 bones / 26 sockets onto `riderRig.ts` and `riderBody.drawn`; grips and soles on the
   physics contact points, the 11 mm sole/peg offset resolved here or declared. The six clips are reference only —
   the physical path drives the pose ([RIDING_POSES.md](RIDING_POSES.md)).
3. **LOD and tiers.** A decimated LOD chain under `lod.ts` so low / medium / phone-high each fit their draw / tri /
   Mpx budgets; textures per tier (KTX2 on phones, RGBA8 desktop-high).
4. **Garage first, level second.** The orbit garage (`src/render/world/garageStage.ts`) at 30 fps on the phone proxy, then b1 at the
   phone-high row; outfit / livery rows in the garage rail; the three missing liveries stay greyed until Astra sources
   them.
5. **Evidence.** Played clips (not stills) of garage → outfit swap → b1 ride on WebKit; bench rows; the existing 20
   outfit / bike / LOD combination test extended to the new family; ship gate; then the real phone (HR-07's second
   half).

## Done when

The catalog rider and bike ride in the game and stand in the garage with every delivered outfit and livery; the
phone-high rows hold in-level (≤ 123 draws, model ≤ 8.8 ms) and the garage holds 30 fps on the user's iPhone; the
loader invariant, replay determinism and the ship gate are unchanged; `RELEASES.md` carries the pin. Astra's
"final user visual approval" (HR-07) is a precondition, not a row here.

### Acceptance audit — 2026-09-21

- [x] The catalog rider and bike work in the garage and in-level with all delivered outfits and liveries.
- [x] Loader invariants, replay determinism, and the ship gate hold.
- [x] `RELEASES.md` carries the v0.3.0 pin.
- [ ] Phone-high in-level rows meet ≤ 123 draws and model ≤ 8.8 ms. Integration measured 142 / 9.2; ask 60 measured 139 / 9.7.
- [ ] The integrated garage holds 30 fps on the user's iPhone (HR-10). The existing device report predates this art build.

## Status (ask 43, opened 2026-09-16 23:15)

The user's `/goal`: integrate all of it and retire the prototype once trunk holds every asset, model and recipe. Findings
from the parent's own measurement of the seven selected files before the first round:

- The three Street riders are 3.66 M tris **because of one mesh** — `Bystedt_EvaluatedStrandCrossSections.001`, the strand
  groom, 3,456,000 tris. Without it a Street rider is ≈ 205 k (cotton shell 132 k). The Race riders are 94 k, 6 MB,
  one material; the bikes 33 k with the same mesh names the game's `gltfBike.ts` already drives. So the plan's step 3 is
  really "replace the groom and decimate", not a generic LOD chain.
- The delivered clip set (`sit_cruise, forward_attack, hang_back, compression, extension, landing_absorption`) is not the
  set `gltfRider.ts` weights (`stand_attack, crouch, extend, land_absorb, idle_breathe` + the three shared) — an alias /
  derivation layer in the loader, physics still the pose authority.
- Per-outfit files replace family + palette variant; per-livery bike files replace `bike_rookie / bike_pro` variants.
- The prototype holds no physics; "improved physics" in the ask is physics R10 (`dc450e0`, ask 35), already on trunk.

Owners: art-pipeline (`assets/blender/**`, `public/models/**`), render (`src/render/**`, `riderPresets.ts`); harness
owner joins when there is a file to play. Prototype retirement is the last round: recipes and evidence move under
`assets/blender/` / `docs/evidence/hero-art/`, the 22 GB of untracked intermediates are the user's call.

### Round 1 (2026-09-17 00:40) — the family is live

- Art: `assets/blender/hero_art_build.mjs` regenerates all 14 files from the delivery in ~100 s (recipe + findings in
  `assets/blender/README.md`); riders 44–59 k tris / 1–6 draws / 2–3 MB, LOD 7.8 k with a 400-tri glove floor, bikes 33 k /
  23 draws; rig, sockets and the six clips verified against the delivery (≤ 0.19 mm / 0.2 mrad over every frame). The
  strand groom is a baked shell (7.7 k tris) — puffier than Astra's; ribbons are the alternative, the user judges.
- Render: `ASTRA_HERO` table in `urls.ts`, per-outfit riders + per-class bikes, `clipAliases.ts` windows the delivered
  cycles into the driver's clips (physics stays the authority), `prepareHero` merges skinned draws and flattens
  clearcoat/specular (programs 61 → 53), `lodChoice` = LOD rider on low/medium/phone-high in-level, authored in the
  garage on every tier. b1 phone-high: 139 calls / 82 k tris / model 9.1 ms (baseline 128 / 156 k / 9.2). Boot totals
  keyed by outfit × class; `main.ts` passes the saved class so a Pro boot fetches `bike-pro.glb` once.
- Evidence: hero-webkit PASS, outfits e2e PASS (14 files fetched), D1–D8 PASS with the new `b1:pro` pin, no flash on 15
  garage swaps; gate 26/30 (the three SwiftShader timing rows + heap growth 5.39 vs 5, one run); e2e 1153/1154 — the
  `boot 3g` B3 download held at 58 % for 2 s (new; the hero decode is bigger) — open.
- Open from the frames: hand-to-grip residual up to 11.8 / 14.6 cm in hang-back / launch and elbows above the helmet
  in attack — to be measured against the legacy rider before calling it the art's; the phone-proxy garage clip predates
  the `lodChoice` rule (it shows the LOD hero) and is re-cut next round.

### Round 2 (2026-09-17 01:25) — hair shell v2, the street merge that never ran, the boot bytes

- Hair: ribbons judged against the delivered groom and rejected (they read as texture); the gap was the shell itself —
  flat facets from split vertices, jet-black gloss, an inflated volume. Shell v2 (smooth normals, strand albedo ×6 +
  sheen matched to the reference's crown mean sRGB 0.229/0.182/0.159 → 0.223/0.161/0.137, roughness 0.9, −2 mm) ships
  for mustard and charcoal at the same 7.7 k / 1 draw; stills a/b/c/d in `docs/evidence/hero-art/hair-options/`.
- `prepareHero` threw on every Street rider (Meshopt's stride-padded Int8 normals are interleaved) and the loader
  swallowed it — the merge, physical flatten and cut-out normalisation only ever ran on the Race path. Fixed
  component-wise; `heroArt.test.ts` runs the mustard document end to end.
- Hands on grips: the Astra and legacy riders pose to the identical `wristErr` per tick (worst 11.80 cm @ tick 1374
  Rookie, 14.62 cm @ 1518 Pro, max |Δ| 0.01 cm) — the residual is the rider body vs arm reach, `RIDING_POSES.md`'s.
- 3G boot B3: not a freeze — 1 % of a 10.1 MB boot is 101 KB ≈ 2.1 s at 48 KB/s, because both twins are fetched
  (hero 3.9 → 7.5 MB). Decision: boot fetches the pair the first frame draws (LOD on phones / desktop low-medium,
  authored on desktop-high) and streams the twin after `ready` — next round.
- Garage on every tier draws the authored rider (hero 65 k); `pnpm harness:e2e --only=heroart` is the opt-in played
  flow. Heap growth 6.11 MB / 60 s repeats on the gate (limit 5) — A/B against `LEGACY_HERO` next round.

### Round 3 (2026-09-17 02:40) — boot on the first-drawn pair, ship gate, the twin off-track

- `src/game/startTier.ts` is the one tier rule (boot inline, renderer and app agree); boot fetches only the pair the
  first frame draws — LOD on phones and desktop low/medium (2.48 MB, was 7.54), authored on desktop-high — and the twin
  is prefetched after `ready` and parsed only off-track (menu, finish, crash, garage entry). `boot 3g` B3 green, loader
  gone at 64.8 s (was 123), boot matrix 8/8, inline 8190 / 8192 B. Played on WebKit at phone geometry: 0 fills / 0 gaps
  ≥ 100 ms while riding, garage entry 0 fetches, authored rider up (`docs/evidence/hero-art/round4/`).
- Ship gate on the frozen `4f27f47` build: PASS on WebKit and Chromium/Metal (cold boot 4.2 / 3.5 s, b1 40.558 s, crash
  → restart next tick). Heap growth is GC timing, not the hero: 60 s rows read −6.61, +5.68 (Astra) vs +9.81 (legacy).
- Bench b1 phone-high with the bench awaiting the async tier load: 142 calls / 85 k tris / 52 programs / model 9.2 ms
  (baseline 128 / 156 k / 9.2); garage·high 208 k / 8.9–13.3 ms by canvas size.
- Harness: `--only=camera`, `clip.json` fallback when a child's stdout is lost, frozen-build recipe (`VERCEL_GIT_COMMIT_SHA`).

### Round 4 (2026-09-17 03:30) — one family, the prototype retired

- `urls.ts` is one table; `LEGACY_HERO`, the palette / `KHR_materials_variants` paths and their tests are gone; the ten
  legacy model files left `public/models` (14 hero-art files remain, 7 full/LOD pairs). `rider_asset.py` /
  `bike_asset.py` export to an ignored directory so a base-body export can never re-enter the catalog.
- `prototypes/hero-garage/` (1 436 tracked files, ~50 GB local) and `assets/design/hero-targets/reconstruction/`
  (24 MB of img2threejs analysis only the prototype read) went to the Trash; nothing in trunk referenced either. What
  trunk needs from them lives in `assets/blender/hero-art/` (delivery + ignored masters + rebuild docs) and
  `docs/evidence/hero-art/delivery/` (handoff, rig / material contracts, reviews, provenance).
- Two bounded art-build findings from the repointed loader tests: decoded hose end rings sit 0.97 mm off the authored
  `hose_stations` (bound 1 mm), 8-bit octahedral normals decode to |n| = 1 ± 0.5 %.
- Astra's `HERO_GARAGE_PRODUCTION.md` is archived; HR-09 holds the user's three calls (iPhone 30 fps reading, the hair
  verdict, the licence clearance before a public pin). "Improved physics" in the ask is R10 `dc450e0`; the prototype
  held no physics.
