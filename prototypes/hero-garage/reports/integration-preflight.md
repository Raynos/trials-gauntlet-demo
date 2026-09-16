# Gameplay integration preflight (not an integration pass)

Read-only snapshot during the overnight garage build. Gameplay and physics have unrelated concurrent edits; this prototype does not import or change them. Re-read current source before Milestone F.

The current src/render/hero/riderRig.ts declares stature 1.78m and a shared profile, but its neutral hipY is 0.85m with torso 40 degrees. Its comments document mismatch between the renderer anatomy mass map and the physics pose-table COM. src/render/hero/gltfRider.ts applies contact solving and owns the 19-bone mapping; the physical pose path can bypass authored animation. Therefore a successful garage animation is not proof of a seated game rider.

Before F, the authoring owner and physical-pose owner must agree exported rest transforms, forearm length, grip/peg sockets, pelvis seat target, and the mapping from physics body state to approved poses. Inspect shoulder twist/forearm twist and fingers; do not force a richer groom/garment rig into the old 19-joint contract silently. Evaluate mass mapping with the updated geometry, then re-prove handling and byte-identical clear time. Any physics modification uses fresh source hashes and recorded inputs; existing passing reports are not evidence for the new asset.

User selected 30fps for the mobile garage, not for game rendering. True iPhone proof remains a distinct requirement from headless macOS WebKit and simulator captures.
