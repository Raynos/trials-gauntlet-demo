# R12 silhouette group: correction2 handoff

Official next.py reported blockout correction2/3, total2/6 before each generation. No review action, state mark or counter edit was made by this builder. The factory was regenerated through the official strict-gated command; there is no hand-written factory postprocess.

## Shape implementation

`shape_fit_r12.py` reproducibly changes only the owned component geometry/transforms and their semantic region representation in the sculpt spec. Source01 final identity, all materials except hidden semantic markers, quality thresholds, head/hair and rig contracts remain intact.

- **Hoodie:** one SDF surface combines fitted abdomen/ribcage/hem, shoulder caps, both tapered sleeves, cuffs and dropped hood. The neck/hood opening is a subtraction in that same field. Sleeve/hood regions no longer emit visible duplicate capsules.
- **Jeans:** one SDF surface combines pelvis/crotch and both tapered thigh/calf/ankle chains. Frusta are actual clipped cone fields smoothly unioned before extraction, not independent leg mesh stacks.
- **A-pose:** observed front shoulder/elbow/cuff/wrist/hand/ankle landmarks guide metric positions. Exposed skin and gloves terminate at the sleeve boundaries. These metric/depth values remain construction inferences, not calibrated likeness measurements.
- **Shoes:** each upper has an ankle collar, low vamp and rounded forward toe merged before extraction, seated on a flat sole with an elliptical footprint. No deep rectangular extrusion remains visible.
- Every SDF uses explicit metre-space sampling bounds and unity baked geometry scale. Hidden region markers use a1mm normalized box scale; generated pivot Groups remain unity, so child positions are not shrunk.

## Important rejected intermediate

Capture05 (`2d1ac17…`) revealed that the official generator ignores `semanticGroupOnly` for mesh emission. Old sleeve/thigh/hood profiles still rendered atop the joined fields. That custom metadata was not sufficient and the initial claim that it removed duplicate meshes was wrong.

The final spec uses the existing supported `hidden` material/materialLayers for these semantic-only components and substitutes1mm own-geometry markers. Their original geometry/dimensions/material intent remain under `geometryDescriptor.semanticRegionEvidence`. Group IDs and child hierarchy remain. No preview-only hide or generated-code postprocess was added. Capture05 and its census log remain a preserved failed emission witness.

## Actual final generated geometry

Factory SHA256: `a303b69015d7a97cc97e091f8f3206aa401a515a78fca9fbb5b5d5c339ed4acc`.

`shape-fit-r12-measured.json` contains actual indexed triangle graph counts and world bounds from the generated factory. There is no position welding or proximity merge.

| Owner | Indexed components | Boundary / nonmanifold edges | Triangles | Actual world bounds min → max |
| --- | --- | --- | --- | --- |
| Hoodie |1|0 /0|34,444|[-.346944,.946,-.184693] → [.346944,1.543,.126859]|
| Jeans |1|0 /0|36,768|[-.238258,.126574,-.124648] → [.238258,.977,.106648]|
| Left forearm |1|0 /0|12,892|[.258136,.936071,-.039026] → [.375845,1.114547,.039278]|
| Left glove |1|0 /0|12,792|[.305041,.781076,-.018959] → [.393012,.957858,.035944]|
| Left shoe upper |1|0 /0|21,524|[.137064,.0305,-.087948] → [.247820,.183866,.206882]|
| Left sole |1|0 /0|19,948|[.130020,.01,-.101908] → [.249980,.036,.203908]|

Right sides are reflected in X. The forearm's sampling box was widened after an actual boundary-edge check caught a clipped proximal edge. Final owned visible fields have zero boundary/nonmanifold edges. Hidden box markers have separate face indices as ordinary BoxGeometry does; they are explicitly labeled hidden and are not part of the garment closedness claim.

All used vertices are finite. Unbound skins remain explicitly base-geometry previews; no rig/deformation, final likeness or material-pass acceptance follows. Tessellation is unoptimized and the total visible budget still requires the parent capture report/optimization gate.

## Validation / next evidence

Strict spec validation passes. `mega_bike` is producing fresh scalp evidence and neutral fixed-camera capture06 against this frozen hash. Parent judges the played orbit and front/side/back comparison. No additional review should be appended by a builder; the next correction/pass action belongs to the parent.
