# Rejected posterior hem experiment

Do not promote this candidate. The one bounded gathering attempt preserves
weights, topology, UVs, upper garment, neck, cuffs, hood and pocket, but increases
intersections with the actual dark indigo denim.

`build.py` derives `hem-source.blend` from immutable
`../garment-shape/garment-source.blend`. It gathers posterior lower 160 mm with
25 mm inward movement,14 mm upward movement and up to6.5% lateral taper.
`assemble.py` requires explicit `--base` and `--out`; the diagnostic candidate
`street01-rider-hem-study.glb` used `street01-rider-round31-study.glb` as base.

`verify-motion.py` checks nine samples of each of the six actual assembled clips,
including the denim mesh selected by its dark-indigo material. It also checks
hood/shirt, cords, degenerates and nonfinite vertices. Override the asset filename
with `SLEEVE_STUDY_SOURCE` and report filename with `SLEEVE_STUDY_REPORT`.

`comparison.json` records baseline maxima of540 denim/shirt triangle pairs and
candidate maxima of684. Every pose adds exactly144 pairs. Pair counts do not
measure penetration depth, but the consistent increase rejects this mapping.
A safe follow-up needs denim-aware collision fitting. No canonical assets,
runner recipes or catalog entries were changed by this experiment.

## Second attempt: denim-aware fit, awaiting parent judgment

`build-fitted.py` applies the proposed gathering and then `fit-denim.py` clamps
changed control points outward against the actual round31 rest-denim surface,
targeting6mm. It writes `hem-fitted-source.blend` and a distinct fitted donor.
`assemble-fitted.py` writes `street01-rider-hem-fitted-study.glb` over the unchanged
round31 clip family. All skin weights remain exact; upper garment, cuffs, hood,
front and pocket are unchanged.

`verify-localized.py` and `fitted-comparison.json` separate posterior hem from
whole-shirt intersections across the same54 animated poses. The localized hem
has zero denim crossings in both baseline and fitted candidate; the candidate's
minimum evaluated vertex clearance is3.637mm after subdivision and the inward
shell. Whole-garment crossing counts match baseline (344–540), with no added
pairs. Hood/shirt crossings, cord crossings and degenerates remain zero.

The diagnostic region is below180mm torso height, behind55mm local front and
within230mm absolute lateral distance; all three triangle vertices must be
inside. It includes outer and inner shirt surfaces. Nearest-normal signed values
are retained as diagnostics but do not prove containment, especially above the
open denim waistband. Geometry checks do not establish visual improvement;
parent must judge the played candidate. No runner or canonical updates.

## Delivery integration

Stage37 rebuilds the accepted fitted candidate from the newly generated garment
source and cotton maps. `build-fitted.py` now requires `--denim-source PATH`;
the runner passes its current pre-hem raw delivery, avoiding a dependency on an
old study export. `fit-denim.py` is an explicit input and recipe fingerprint.
`assemble-fitted.py` continues to require explicit `--base` and `--out`.
A read-only mocked missing-helper check confirms preflight catches its absence.
Stages34–36 retain their existing recipe behavior. Parent owns packing,
pruning, final motion judgment and catalog promotion.
