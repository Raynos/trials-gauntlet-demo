# Experimental rider and outfit menus

Implemented directly on main. Both the main menu and in-level pause menu expose Classic, Blender and Img2 experiment rider modes, plus all five existing Blender outfits. Selecting an outfit switches to Blender. Selection persists; paused swaps do not advance physics. Existing two bike classes remain; this adds one experimental mustard rider, not five new bikes or five reconstructed characters.

The frozen generated factory is preserved. The adapter conditions its skeleton and continuous clothing weights for the existing game rig. Its 45 texture files are recorded with source paths and hashes in `public/img2-experiment-assets.json`. The experiment module loads on demand and is excluded from mandatory core prefetch.

## Verification

- Typecheck, scoped lint and production build passed.
- 51 targeted tests across 11 files passed, including garment vertex movement and UI selection.
- Headless production WebKit: main/pause selection of every outfit, experiment reload persistence, mobile controls, unchanged paused tick, resumed gameplay; no browser errors or missing files. See report.json.
- Parent played the corrected-binding gameplay clip in QuickTime. Accepted as a selectable experiment only. Final v3 rerun additionally checks that the countdown banner cannot cover pause controls.
- Mobile pause screenshot confirms all five outfits and all three rider modes are visible.

This is not AAA art acceptance, real-device performance proof, or closure of the outstanding seated/lean/elbow work. The experiment uses the existing pose-chain fallback, not the Blender physical-body path. Whole-game release remains the main release owner's gate.

Local final capture: `harness/out/blender/img2-menu-release-v3/played-menu-and-rider.webm`.
Parent-reviewed clip: `harness/out/blender/img2-menu-release-v2/played-tail.mp4`.
Parent-reviewed clip SHA256: 2654e841f67a0358313c48ecc8157230ca818816dc287375aec1ad49af1b8ef6

Latest whole-suite check on the concurrently changing main working tree: 822 passed / 14 failed across 70 files. These are outside the menu integration checks; this task does not claim a green whole-game release or deploy the working tree.
