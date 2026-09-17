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
