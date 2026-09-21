# Sleeve candidate — parent judgment pending

Retained changes:

- `gltfRider.ts` arm roll: the old directed flexion-plane normal introduced ±156° upper-arm / ±122° forearm axial twists at the rejected played Pro tick404. The normal and its negative describe the same plane. Hard modulo-π correction removed pits but jumped176° near lean+.517, caught by the new dense sweep. Retained continuous correction is `sin(theta) * cos(theta)` around the authored shortest transport: bounded±0.5rad, sign-invariant, history-free, and zero at the ambiguous perpendicular alignment. Joint positions are unchanged.
- `sleeveSkin.ts`: near the elbow, blend weights use distance along the bind-pose upper/lower limb bisector, smoothstep across±100mm, with influence feathered radially from100mm to160mm. This prevents the old noisy Street forearm/upper-arm blend from collapsing triangle5025 under the corrected roll. Neck/head weights, positions, normals, UVs, indices and source geometry are unchanged. No source-surface smoothing or material changes remain.
- `gltfRiderCloth.test.ts`: adds241-step full-lean-range sleeve-quaternion continuity check (<20° per step), and triangle IDs in existing failure messages. Existing strain bars were not loosened.

Qualification: **94/94** cloth14 + actual physical contacts/mass60 + actual release20 pass; typecheck and ESLint pass. Parent's independent Rookie release fix is preserved in the same gltfRider.ts. No physics edits.

Frozen bundle `/tmp/trials-sleeve-final-dist` includes the parent release fix and this candidate. Played Pro Race full transition: `/tmp/trials-sleeve-final-race/{clip.mp4,evidence.json,frames}`. Played Rookie Street full transition: `/tmp/trials-sleeve-final-street/` (complete:165frames, no errors). Both render the complete input prefix. Candidate source hashes are in `candidate-source.sha256`.

Worker inspected decoded Race frames34,55,58: the outer-arm craters are removed; a smaller underarm/chest fold remains. This is **not parent visual acceptance** and not a claim of all-pose bodywork clearance. Parent must review sequential played evidence, all20 outfit/class combinations, current real overreach/restart, and updated CPU cloth clearance audit.

Failed probes and measurements are described in README.md. The texture/surface/shell probes did not fix the root problem and were reverted. The raw normal-vs-face diagnostics contain inward shell normals and therefore must not be interpreted as inversion counts. The hard nearest-plane candidate passed old strain tests but failed the new continuity test, preserved in rejected-plane-continuity.log. Continuous correction alone was visually better but failed Street area(.091vs.1); anatomical elbow blending is needed for the retained result.

No commit made. No completion/deployment claim.
