# Street mustard spec authoring handoff

Owned only `../street-mustard.sculpt.json` and this note. Reference01 was inspected at native resolution; analysis, anatomy, assessment-derived starter and all20 detail mappings were read. Relevant installed img2 authoring contracts read: quality contract, surface topology, character layer decomposition, head construction guidance and detail inventory. No code generation, geometry, state mutation, rig binding, render or acceptance performed. `forge/next.py` reported active/detail-inventory at start; parent owns checklist progress.

## Authored structure

- Replaced the generic 60-part stylized character/finger-bone template with45 semantic target components: visible head/neck/hair/eyes, dropped hood and mustard top with rolled cuffs, exposed forearms, opposed gripping glove digits, indigo pelvis/legs/pockets, high-top uppers/tongues/laces/sole bands.
- Continuous garment/skin profiles specify shared-joint welding and shared weights. Face and ear cavities use explicit subtractive fields; scalp hair uses a hollow trimmed cap with stand-proud constraint and required swept relief. These are initial parametric design descriptions, **not accepted final anatomical surfaces**. Shoe/pocket patches still require host-conforming/heel-to-toe form fitting during the locked passes. Semantic hidden groups are not rendered anatomy.
-20/20 inventory refs resolve to actual arrays. Existing dotted `mapsTo.ref` values remain unchanged; matching `localFeatures[].id`/`localOverrides[].id` contains the full dotted name. `di.json` and assessment files were not edited.
- Material IDs ready for parent's extraction: **cotton, denim, skin, glove, shoe**; supporting **hair, rubber, eye, thread, hidden**. All initial colors/PBR scalars are explicitly uncalibrated hypotheses; independent channels and restrained physical microdetail replace template mottling.
- Added a real structural-pass to the locked pass order; kept every fidelity/depth floor. Outfit/palette is now a must-pass critical identity feature. No pass is marked complete.
- Rig scaffold has exactly19 production bone names and records all eight clip names, four weights maximum, one runtime skinned draw and≤6000-triangle LOD. Fingers belong to the hand bone, no new digit joints. **This is a provisional named A-pose scaffold, not imported authoritative bind data**: parent Stage R must reconcile it with actual production rig/contact frames. All camera/world-axis conversions remain explicitly unresolved pending chirality and socket parity checks.

## Anatomy honesty

Original null torso/legs/shoulder/hip measurements and far-eye spacing remain null. Observed 2D landmarks/angles remain intact. A separate `anatomy.inferredScaffold` records 1.75m adult/7.5-head initialization and limb-width/length assumptions at confidence .45; it cannot be treated as measurement. No projected angle was copied into a claimed 3D joint rotation. The numerical head-unit observation in anatomy is a fraction of source image height, not a physical unit conversion.

## Validation (Python3.12)

Normal `validate_sculpt_spec.py`: **PASS, zero errors**.

`--strict-quality`: **FAIL,13 remaining errors**:

1. Unresolved pre-spec unknowns (camera fit, far side, proper rider mask, de-lighting).
2–11. Missing usable `referencePbr` on all10 material records: skin/cotton/denim/glove/shoe/hair/rubber/eye/thread/hidden. Parent owns evidence extraction/wiring. Hidden semantic groups need a documented applicability treatment, not fake extracted maps.
12. Lighting-pass lacks concrete key/fill/rim/environment entries; parent owns calibrated look-development evidence.
13. Character torso/leg head-unit ratios remain unset because seated image does not measure them. Do not replace nulls with invented measurements to silence this gate. If inferred scaffold ratios are later used by the schema, preserve original observations/provenance and explicitly label the selected inference and its fit validation.

No remaining structural schema or detail-map errors were reported. These results establish authored schema structure only, not code-generation readiness, likeness, scalp closure, mesh continuity or animation success. No validation thresholds were lowered, no evidence confidence manufactured and no blockers silently waived.

Re-run from repository root:

```sh
python3.12 /Users/raynos/.codex/skills/img2threejs/forge/stage2_spec/validate_sculpt_spec.py assets/design/hero-targets/street-mustard.sculpt.json
python3.12 /Users/raynos/.codex/skills/img2threejs/forge/stage2_spec/validate_sculpt_spec.py assets/design/hero-targets/street-mustard.sculpt.json --strict-quality
```
