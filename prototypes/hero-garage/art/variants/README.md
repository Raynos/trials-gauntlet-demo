# Five-outfit art delivery

This is a local art handoff for Claude + Opus, who own game integration. The existing target01 catalog and original master remain unchanged. `manifest.json` lists exact exports and SHA256 hashes; there is no runtime selection change.

| Outfit | Art scope |
| --- | --- |
| street-mustard | Accepted R33 mustard hoodie, denim, trainers, saved face/curls/beard |
| street-charcoal | Same repaired Street geometry and identity, charcoal garment palette |
| street-openface | Repaired charcoal Street, remastered open-face helmet with lower crown, recessed vents, thin peak and joined webbing; scalp curls hidden beneath shell, face/beard retained |
| race-bluewhite | Genuine jersey, technical pants, boots and full-face helmet; race materials, smoother shoulders, fitted low neckline and six accepted clips |
| race-charcoalyellow | Same genuine Race family in its authored charcoal/yellow palette |

Only **two** bike liveries are present in the current game sources: Rookie blue/white/black7 and Pro charcoal/gunmetal/yellow/red1. Both use the improved mechanical bike. The user has been asked to identify three additional skins; this delivery does not invent them or claim five bikes.

Canonical IDs come from `src/core/riderPresets.ts`; bike identities from `src/render/bike/livery.ts` and `assets/blender/build_bike.py`. Pairing examples are cosmetic, not a restriction: each rider and bike is a separate asset at the original [0, 0.34, 0] glTF placement.

## Rebuild and edit

- Street: [recipe and provenance](../street-variants/README.md).
- Race: [recipe and verification](../race-variants/README.md).
- Bikes: [recipe and verification](../bike-variants/README.md).
- Original target01: [full handoff](../ART_HANDOFF.md).

Variant editable review masters live in `art/delivery/{outfit}-master.blend`. They import the exact delivered GLBs and preserve six actions; component recipes remain canonical for export. Rebuild from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python-exit-code 1 --python prototypes/hero-garage/art/variants/build-review-master.py -- variants/street-charcoal.glb variants/bike-pro-art.glb
```

Substitute the rider/bike filenames for other masters. Original mustard master remains `hero-garage-master.blend`. Geometry uses meters, Blender Z-up / glTF Y-up, +X forward. The shared 19-bone skeleton and six-clip conventions are described in the original handoff. Meshopt compressed exports require Three.js MeshoptDecoder. No spending or neural generation was used.

## Limits and approval

These are provisional art upgrades, not AAA approval or an actual iPhone performance pass. Dense Street groom remains expensive; open-face hides the scalp mesh but retains its payload. Race tailoring, panel continuity and anatomy need further art refinement. Existing Street raglan streaks and hand/cloth limitations remain. Final user visual approval is open. Socket checks do not prove all garment/skin/helmet intersections absent.

Recorded WebKit motion and exact export hashes are packaged with the delivery. Parent review uses decoded sequential video frames plus detail stills, not a claim of human continuous playback. Licensing and provenance from the original handoff continue to apply, including the beard-pack attribution/header conflict and groom attribution/share-alike requirements. Local use is the present scope; public redistribution clearance is unresolved.

R35 selects the remastered open-face export. Its editable master is `street-openface-remaster-master.blend`; `selection.json` is the authoritative filename mapping. Race R35 studies are not selected: their panel transitions were too soft and the tightening follow-up was not accepted before the 2% usage stop. R34 Race remains the delivered version. See [helmet recipe](../helmet-remaster/README.md).
