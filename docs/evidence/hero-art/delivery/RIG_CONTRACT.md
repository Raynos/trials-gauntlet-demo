<!-- Archived from prototypes/hero-garage/art/rig-contract/README.md at 9b09013 for the hero-art integration record (ask 43); links rewritten to docs/evidence/hero-art/delivery/, assets/blender/hero-art/ or the archived prototype path. -->

# Current runtime rig contract

Run `node tools/export-rig-contract.mjs` from the prototype. `reports/rig-contract.json` is derived from the actual catalog GLBs, with source hashes, 19 joint names, local transforms, per-skin inverse bind matrices, 26 sockets, clip channels and all-frame contact measurements. Two runs produced identical bytes. Materials alone are stripped in memory for decoding; source files are untouched.

Coordinates are metres, Y up and X along the bike. Catalog placement is included; common floor grounding and garage suspension are excluded from the recorded initial positions. Initial node transforms are captured before animation evaluation; they must not be confused with an authored control rig or a new rest pose. Both raw exported and Three.js sanitized names are recorded (`gripSocket.L` becomes `gripSocketL`).

At runtime, evaluate the rider clip first, then apply the shared chassis transform and bike mechanism driver. The driver preserves existing contact offsets. Across 750 frames, socket-offset variation stays below 2.3 micrometres. Sole sockets intentionally sit about 11 mm above peg centres; this is not a surface-contact or penetration proof.

Game integration remains open. The existing physical body/mass mapping must agree with the approved visible poses; do not stack these clips on it independently. The current rig lacks finger and forearm twist chains. This contract documents the provisional export, not final rig/art acceptance.
