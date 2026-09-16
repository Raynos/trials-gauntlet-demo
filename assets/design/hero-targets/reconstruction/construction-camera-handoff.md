# Initial construction camera, mask and projection handoff

Normal and strict validation now pass. No factory was generated and no checklist/review/loop counters were changed. Parent reviews this scoped patch before marking strict validation and generating blockout.

## Concrete construction inputs

`construction-camera.json` contains six fixed Three.js perspective camera transforms (front, ±35°, right, back, left), viewport495×980/DPR1, near.01/far100. Apply each position and lookAt target literally; do not auto-frame each view. Only front currently corresponds to a reviewed pixel-overlay view. Other views provide volume evidence; side/back source images guide geometry but have not been camera-calibrated.

Front camera: FOV20°, aspect495/980, position `[0.008539445629,0.880511727079,5.273445632271]`, target `[0.008539445629,0.880511727079,0]`. This frames the assumed1.78m grounded scaffold against reviewed mask bounds `[24,16,462,954)` in the495×980 front crop. `construction-framing-check.json` verifies only the analytical z=0 framing equation; it is not a mesh fit.

`prepare_construction_camera.py` reproducibly reads the binary reviewed mask and invokes the official initial-camera helper. All camera choices except image aspect retain `agentFill=true`; `solved=false`. The20° weak-perspective hypothesis and1.78m stature are explicit design choices. A real procedural render and overlay are the next inputs needed for refinement. This is why a solved camera cannot truthfully be required before the first blockout exists.

`turnaround-front-reviewed-mask.png` is the parent's reviewed geometry-silhouette mask. It does not authorize sampling source RGB. No reference image or mask was edited by this task. Original target01 remains the final gameplay identity and its original unresolved camera is retained in the spec.

## Scoped spec changes

- `referenceCamera`: initial front construction framing, explicitly unsolved; original camera retained in `preSpecAssessment.initialOriginalReferenceCamera`.
- `preSpecAssessment`: all three prior unknown strings preserved verbatim in `unresolvedEvidence`. Only decisions required to implement neutral blockout are resolved. Calibration, target01 mask and reference projection remain later acceptance obligations. Construction reference is separate from unchanged final `sourceImage`.
- `materialGate.passed=false`: the existing official orchestrator rejects material-pass acceptance with `materialGate.passed must be true after crop/render comparison`. No quality threshold or review target was relaxed.
- `projection-readiness.json` rejects both existing de-lit candidates by source hash. `check_projection_ready.py` exits1 while camera, regional delight, UV coverage and relighting evidence are absent. No projected RGB sampling is permitted before it passes. This local check supplements the official material gate; it does not replace it.

## Exact next commands after parent reviews the patch

Use Homebrew Python: system Python3.9 cannot import the official camera helper's TypeAlias dependency.

```sh
/opt/homebrew/bin/python3 /Users/raynos/.codex/skills/img2threejs/forge/state.py mark strict-validation --state .img2threejs/state.json --evidence assets/design/hero-targets/reconstruction/construction-strict-validation.txt
/opt/homebrew/bin/python3 /Users/raynos/.codex/skills/img2threejs/forge/next.py --state .img2threejs/state.json assets/design/hero-targets/street-mustard.sculpt.json
```

Then run the generator command emitted by next.py for blockout, choosing the parent's isolated reconstruction output path. Render neutral geometry without projected reference textures, with the fixed front construction camera, and capture the other five views. Do not claim likeness or advance the pass before the existing diagnostics and visual-review gates. No runtime/GLB/rig edits or commits were made.
