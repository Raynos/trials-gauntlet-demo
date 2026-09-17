# Genuine race-family quality pass

Outputs are `public/assets/variants/race-bluewhite.glb` and
`public/assets/variants/race-charcoalyellow.glb`. Both derive from the protected
`assets/blender/source/rider-race.blend` and its actual rookie/pro colourways.
References inspected: `assets/design/hero-targets/03-race-rookie.png` and
`05-race-pro-hop.png`. The race jersey, technical pants/knee panels, articulated
boots, constructed full-face helmet and moulded gloves are preserved. These are
not hoodie recolours. The existing anatomical head remains fitted to the helmet;
no saved curly groom was forced into its enclosed shell.

`build.py` preserves race topology, all non-collar skin weights and all non-jersey geometry, reduces
excessive fabric/rubber bump, separates textile/rubber/moulded-shell roughness,
and bakes2048px colour plus1024px lossless normal/ORM maps with local AO.
The UV atlas is repacked. The accepted upper-shoulder treatment adds one jersey
subdivision level and blends dark gussets continuously into the colourway main
between1.07m and1.145m rest-space height. The second bounded collar attempt
removes the earlier hoodie-neck coordinate graft. `fit-collar.py` orders the
original148-vertex race neck boundary, fits it4mm outside the actual race skin
at55mm below the head joint, solves a100mm harmonic annulus to remove the folded
lip, and matches local collar skin weights to race-neck weights with75mm falloff.
Control and weight changes are recorded in `build-report.json`; initial defects
and rejected attempt1 collar are documented in `correction-history.json`.
`race-quality-source.blend` retains the editable
procedural source and both source colourway definitions. Geometry-only GLBs are
intermediates; the two names above are the deliverables.

`attach-motion.py --motion-source PATH` imports the accepted six-clip family by
copying animation accessors and mapping targets by bone name. It first checks
all inverse-bind matrices: maximum difference3.28e-6, below1e-5. Existing race
geometry binary bytes are asserted unchanged. Reproduction from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python prototypes/hero-garage/art/race-variants/build.py
prototypes/hero-garage/.venv-art-images/bin/python prototypes/hero-garage/art/race-variants/attach-motion.py --motion-source prototypes/hero-garage/public/assets/street01-rider-delivery-raw.glb
```

The motion attachment needs Python+NumPy. The build needs Blender5.2.1 and the
repo's existing `assets/blender/common.py`, `rider_asset.py`, and
`art/hoodie-shell/repair_annulus.py` helpers plus local `fit-collar.py`. No new
source download, paid tool or game integration is involved.

Each `reports/race-*-rig-contract.json` samples750 clip frames and confirms19
joints,14 skinned meshes,26 sockets and six clips; maximum contact drift is
approximately2.52 micrometres. `verify-motion.py -- --variant NAME` measures
finite geometry and degenerate triangles at54 poses per asset. Separate timed
headless recordings and full/helmet images are in `captures/race-*-collar-final/`,
with harness reports in `reports/race-*-collar-final.json`. Earlier `*-review` and `*-shoulder-check`
captures document the before state and must not be presented as current.

Limits: the original race pants and lower panel boundaries retain angularity.
The corrected upper shoulder and second-attempt low collar require final parent
played-motion judgment; no claim of reference-perfect tailoring is made. Material resolution and motion
upgrades do not establish sculpted-reference parity or equal finish to the
mustard hero. Existing helmet/head and race glove/boot design is retained rather
than replaced with street components. No whole-body collision or real-iPhone
performance claim is made. Parent owns played-motion and appearance judgment.
