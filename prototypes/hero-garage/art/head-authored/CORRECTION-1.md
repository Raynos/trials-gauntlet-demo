# Authored head correction 1

Parent's first played review named three defects: broad ribbon hair/scalp gaps/cut ends; soft young face; pale flat skin and weak beard. This correction remains unaccepted until the parent plays a new browser recording.

Prior recipe, packed source, GLB and build report are preserved under ignored `attempts/a1/`, with SHA256SUMS. This correction changes only the authored source branch.

## Source changes

- Stronger named MPFB rectangular/age, chin bone/width/prominence, nose depth/Greek/downward tip, cheek-bone targets; forward/down brows and bilateral eye recession. No direct coordinate facial displacement.
- Skin tint factor moves the existing authored skin toward the warm olive brief. This is a uniform PBR factor, not invented detail or painted light.
- Cortu hair diffuse is naturally blonde. A less crushing dark-brown factor retains source strand contrast. Hair alpha cutoff drops from 0.35 to 0.12 to retain thinner ends; eyes/brows/lashes remain 0.35. This does not guarantee that a low-resolution card atlas will pass close review.
- The shared hair atlas object-normal texture's green channel is almost zero (0..0.0078). It describes a source card plane facing −Y, not the differently oriented cards fitted around the head. A documented inferred card basis maps (Nx,Ny,Nz) to (Nx,Nz,−Ny), then normalizes each vector into tangent-space RGB. The output is linked through a Blender Tangent Normal Map node at 0.45 strength and exported as a glTF normalTexture. No global object-space normal is mislabeled as tangent.

The basis is an inference from actual pixel data and common source-card orientation, not an upstream documented guarantee. Browser orbit/relighting must determine whether it improves the strands. A mesh-wide bake treating this shared atlas as head-object-space would impose inconsistent normals on UV-overlapping cards; the explicit local-basis conversion preserves card orientation instead.

## Export checks

Inspect the final GLB JSON for `normalTexture` on Cortu hair, MASK coverage, the declared cutoff and explicit hair/skin base-color factors. Blender's exporter does not preserve the chosen Multiply node factor consistently, so the deterministic recipe explicitly writes those supported factors to GLB JSON after export. Geometry, UVs and embedded original diffuse remain unchanged by that export correction.

## Added beard source and normal interpretation

Parent provided Grinsegold full beard and moustache. Both fit through MPFB MHCLO against the morphed head; original diffuse/coverage textures supply strand boundaries. These remain a local personal trial: the official pack says CC-BY while embedded MHCLO headers say AGPL, so no public-release permission is inferred. Parent maintains source/terms evidence.

The beard materials call their `_hn.png` images `bumpTexture`, with `normal false`; however the actual pixels are blue RGB vector fields, not grayscale height. This recipe **infers** tangent normals from that encoding, at low 0.35 strength. Pixel checks in `beard-normal-check.json` find mean R/G near 0.5, B near 0.74–0.78, and >99.98% of covered vectors facing +Z. Vector lengths vary (median ~1.12–1.14), so these are not claimed to be verified upstream normal maps. The standard normal-map shader normalizes them. Browser relighting must still judge the inferred use. No height-to-normal bake was applied to RGB vector data.
