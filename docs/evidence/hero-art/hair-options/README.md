# Hair options for the street riders (ask 43, round 3) — the user picks

Same head camera, light and `sit_cruise` frame 40 (Eevee via `assets/blender/hero_art_preview.py`) on `rider-street-mustard`; whole-rider numbers per version, hair part in brackets.

| version | still | rider tris | hair tris | draws | GLB bytes | hair textures |
|---|---|---|---|---|---|---|
| (a) Astra's delivered strand groom (reference, cannot ship) | `a-delivered-groom.png` | 3,661,632 | 3,456,000 | 23 | 132,130,128 (uncompressed) | none (flat colour) |
| (b) shipped shell (`public/models/rider-street-mustard.glb` @ 3af533e) | `b-shell.png` | 58,976 | 7,677 | 6 | 3,171,116 | normal 512² + albedo 512² |
| (c) shell + 583 silhouette ribbons (scratch only) | `c-shell-ribbons.png` | 65,974 | 14,673 (+6,996) | 7 | 3,400,404 (+229 KB) | + alpha-tested strip 256×1024 |
| (d) shell v2 — shipped from round 4 (`--hair-v1` rebuilds b) | `d-shell-v2.png` | 58,976 | 7,689 | 6 | 3,267,248 | normal 512² (strength 0.35) + albedo 512² (AO, scalp tint) |

Crown-box mean colour of the hair pixels (sRGB, background/skin masked): (a) 0.229/0.182/0.159, (b) 0.118/0.099/0.095, (d) 0.223/0.161/0.137. Shell v2 = v1 volume shrunk 2 mm along normals, 2 smooth passes, true smooth vertex normals (v1 exported split/flat), delivered strand colour ×6 + 0.12 grey sheen (matched on the stills), roughness 0.9, specular 0.08, AO floor 0.45, skin tint where the shell is < 12 mm from the scalp.

`turntable-shell-vs-ribbons.mp4`: 24 frames / 8 s, (b) left and (c) right, 360° around the head. Ribbons are strands that skim the shell (mean signed distance −2…+14 mm), resampled to 6 segments, laid flat on the shell normal, lifted 3 mm, 12 mm wide tapering to 45 %, alpha-tested (MASK 0.5); the strip texture is seven real strand centrelines projected onto their principal plane. Build (c): `blender -b --python-exit-code 1 --python assets/blender/hero_art_import.py -- --input <decoded mustard> --output c.raw.glb --kind rider --stage 1 --ribbons 7000 --tris 67000 --no-meshopt` then `node assets/blender/hero_art_pack.mjs c.raw.glb c.glb`; (a): same with `--stage 0 --keep-groom --no-join --tris 5000000`.
