# Astra's editable hero-art masters (Blender 5.2.1)

The `.blend` files here are **local only** (`.gitignore`: `assets/blender/hero-art/masters/*.blend`); the four variant
masters are also inside the prototype's local `art/delivery/hero-garage-variants.zip`, the mustard master inside
`hero-garage-handoff.zip`. They are the editable sources behind the seven deliveries in `../delivery/`; the game
outputs are rebuilt from those deliveries, not from these masters (re-exporting a master is not promised to reproduce
the delivery bytes — see `REBUILD.md`). Not copied on purpose: the `-r35` Race and `-satin` open-face masters (unaccepted).

| file | bytes | sha256 |
|---|---|---|
| `hero-garage-master.blend` (mustard Street + bike, six actions, studio collection) | 131,043,726 | `be8450728097dd85fc6f817bf884b834262eed5bc97e63d2f778d433f48bc6fb` |
| `street-charcoal-master.blend` | 130,913,797 | `ee5b8d9bbe249570450dd693e201f46827ff9ae4691258c5f10fe15e5e56b294` |
| `street-openface-remaster-master.blend` | 27,576,929 | `ed8eb7afe972f0b449ba1ff68b7770e00f4a2457a0e0931bc21f6e1d72fa653b` |
| `race-bluewhite-master.blend` | 12,709,547 | `4ecc30850566565484da01fdedebc765c88da426a78830c7843de186ba62f436` |
| `race-charcoalyellow-master.blend` | 12,631,236 | `967159709963e17cb332fa86d8888bc900c50a9c2141f2e5da7ff236c7abcff4` |

`build_master.py`, `REBUILD.md` and `REBUILD-BIKE.md` are verbatim copies of `prototypes/hero-garage/art/delivery/`;
they address the prototype layout (`prototypes/hero-garage/public/assets/catalog.json`, component recipes under
`art/*`, `tools/*.mjs`), so they document how the masters were made rather than run against this directory.
Delivered assets and their handoff/licensing record: `docs/evidence/hero-art/delivery/`.
