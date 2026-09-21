# Riding pose implementation and qualification

The research, measured starting build, implementation experiments and rejected
candidates are preserved here. Current plan status is in `../../plans/RIDING_POSES.md`.
Round2 source implements shared geometry, physical support, continuous lean, release
and sleeve conditioning. Round3 runs fresh input/browser/player and played visual
qualification on simulation fingerprint1255af7f; it is not yet a completion claim.

Large historical JSON reports use lossless gzip. `compressed-evidence.json` maps
original names to stored files; decompress before reading as JSON. Compression was
round-trip byte checked and does not change any measurement. Diagnostic scripts
still emit plain JSON at their requested output paths.

Scope checks for the frozen build: typecheck/build and139 rig/contact/release/snapshot
tests pass. All20 outfit/detail/class transition geometry samples pass their rear
clearance check. Full motion appearance, refreshed track clears, strangers, full
handling/cost suite and ship gate remain open.
