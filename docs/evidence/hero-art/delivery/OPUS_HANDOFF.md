<!-- Archived from prototypes/hero-garage/art/variants/OPUS_HANDOFF.md at 9b09013 for the hero-art integration record (ask 43); links rewritten to docs/evidence/hero-art/delivery/, assets/blender/hero-art/ or the archived prototype path. -->

# Opus integration handoff

The art is already committed on shared `main`; there is no experiment branch to merge. Start from the current checkout and preserve concurrent game/UI/physics work. Do not cherry-pick these commits back into the same branch.

Relevant art commits: `85a03c8` (complete target01 rider/bike), `4d2e762` (five outfits and two authored bike liveries), `9471131` (open-face helmet remaster). Earlier component recipes are dependencies in this repository. These are provisional art deliveries, not final visual or mobile approval.

## Exact selections

Authoritative export URLs and SHA256: [manifest.json](variants-manifest.json). Selection/review/master mapping: [selection.json](variants-selection.json). Paths below are relative to `prototypes/hero-garage/public/assets/`.

| Game ID | Delivered GLB |
| --- | --- |
| street-mustard | street01-rider-round33-lossless.glb |
| street-charcoal | variants/street-charcoal.glb |
| street-openface | variants/street-openface-remaster.glb |
| race-bluewhite | variants/race-bluewhite.glb |
| race-charcoalyellow | variants/race-charcoalyellow.glb |
| rookie bike | variants/bike-rookie-art.glb |
| pro bike | variants/bike-pro-art.glb |

Only two bike skins exist in the current source. Three more requested skins await design identification. Do not infer five bike liveries from five outfits.

Do not integrate `*-r35.glb`, `street-openface-satin.glb`, raw/geometry intermediates, older open-face files, or arbitrary newest files. R35 Race masks were too soft; candidate sources/evidence remain local. The three tracked Race recipe edits were saved in `art/delivery/unaccepted-r35-race/` and restored to the committed R34 version for this handoff.

## Integration work belongs to Opus

1. Load selected complete GLBs with MeshoptDecoder where required. Inspect existing `src/core/riderPresets.ts` and `src/render/hero/` loader contracts before wiring. These are separate complete assets; do not assume their old palette-variant tables match the existing two-palette loader.
2. Preserve all five existing outfit IDs and both bike IDs. Treat `manifest.json` as an asset map, not a ready-made game catalog. The standalone prototype catalog still intentionally shows target01.
3. Verify scale, placement, skeleton binding, sockets and live physics pose driving. Blender uses metres/Z-up/+X forward; glTF metres/Y-up/+X forward. Prototype placement is [0,0.34,0] for both assets. Do not blindly add that offset again inside an existing game rig.
4. Retain game physics as the pose authority. Six baked garage clips demonstrate art motion; they do not replace the game's physical pose mapping. See original [ART_HANDOFF.md](ART_HANDOFF.md) for 19-bone rig, sockets, clip names/durations and driver order.
5. Validate actual iPhone Safari performance/memory and all outfit switches before release. Dense Street assets are about60MB each and contain millions of groom triangles; the open-face scalp groom is hidden but its payload remains. Lazy loading/resource disposal and reviewed export reduction remain integration/performance work.

No game code, garage UI, physics, runtime selection, deployment or public distribution was performed by this art pass. Existing unrelated working-tree edits belong to other tasks and were preserved.

## Evidence and editable sources

[Variant guide](VARIANTS.md), manifest-listed recorded WebKit clips and rig reports, plus [R35 review](art-round35-review.json). All selected new rider assets were inspected through six clips under neutral/garage lighting. Rig audits sample750 frames; reopened Blender masters retain six actions and packed images. These are scoped checks, not proof of global intersection freedom or actual-device performance.

Editable masters live in `art/delivery/`: original `hero-garage-master.blend`, `street-charcoal-master.blend`, `street-openface-remaster-master.blend`, and the two unsuffixed Race masters. Component recipes/sources are retained in the repository. Local ZIP `art/delivery/hero-garage-variants.zip` includes selected exports, four variant masters and evidence; original mustard master is in the separate original hero handoff.

Known remaining art: Race collar/panel tailoring, natural cloth/hand/anatomy refinements and final likeness/visual approval. Race helmet remaster was not undertaken; only open-face was remastered. Licensing/provenance from ART_HANDOFF continues to apply, including beard-pack license ambiguity and groom attribution/share-alike; public redistribution clearance remains open.

Art work stopped at the user's2% remaining usage floor. Do not interpret this handoff as AAA completion or deployment approval.
