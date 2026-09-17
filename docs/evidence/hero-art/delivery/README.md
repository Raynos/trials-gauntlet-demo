# Astra's hero-art delivery — handoff record (ask 43; copied from `prototypes/hero-garage` at 9b09013 before its retirement)

The seven delivered GLBs live in `assets/blender/hero-art/delivery/` (with `manifest.json`: prototype path, sha256, bytes, Astra's commits `85a03c8` / `4d2e762` / `9471131`); the editable masters in `assets/blender/hero-art/masters/` (local, sha256 in its README); the game rebuild is `node assets/blender/hero_art_build.mjs` (recipe: `assets/blender/README.md`). Links inside the copied documents were rewritten to these locations; anything not copied points at the archived prototype path and is marked so.

| file | what it is |
|---|---|
| `ART_HANDOFF.md` (13 KB) | Astra's original handoff: catalog, rebuild pipeline, rig/coordinate contract, verification boundaries, source terms |
| `OPUS_HANDOFF.md` (5 KB) | the integration handoff: exact selections table, what is and is not delivered, evidence, editable masters |
| `VARIANTS.md` (4 KB), `variants-manifest.json`, `variants-selection.json` | the five outfits / two liveries guide, authoritative URLs + sha256, selection/review/master mapping |
| `RIG_CONTRACT.md` (2 KB), `rig-contract.json` (625 KB) | 19 joints, inverse binds, 26 sockets, clip channels, 750-frame contact measurements from the catalog GLBs |
| `material-contract.json` (114 KB) | material names, PBR factors, image hashes, texture slots and colour spaces per delivered asset |
| `art-round33-review.json`, `art-round35-review.json`, `delivery-master.json` | the accepted R33 review, the rejected R35 Race review, the consolidated-master report (catalog hashes) |
| `provenance/` | licensing: MPFB/MakeHuman head + skin (CC0; `authored-human/LICENSE*.md`), Grinsegold beard (CC-BY vs embedded AGPL — unresolved; `authored-beard/`), Bystedt curly hair (CC BY-SA, share-alike; `replacement-hair/SOURCE.md`, `authored-hair/`), Lee Perry-Smith head alternate (its licence), `sources-provenance.json`, `BUNDLE-README.txt` |

No public-redistribution clearance is claimed for the beard or hair sources (ART_HANDOFF.md "Source terms"); the shipped hair shell and atlases are derivatives of those sources and carry the same obligations.
