# Fix-list item 1: Race helmet remaster (ask 49)

Astra remastered only the open-face helmet; the delivered Race `rider:constructed_helmet` (3,166 tris) is a boxy shell with a flat strap. `assets/blender/hero_art_helmet.py` (`hero_art_import.py --race-helmet v2`, default; `v1` keeps the delivered mesh) rebuilds an MX full-face helmet in the head bone's frame so it tilts with the riding posture: padded cranium shell fitted to the delivered head (+24/30/26 mm foam), face opening hugging a superellipse goggle frame, solidified rims, chin bar standing 40 mm off the chin, short upward-flaring peak, goggle strap around the shell, three crown vents, a livery-accent racing stripe, tinted goggle lens (BLEND). Livery from the file name: white/blue and charcoal/yellow. All vertices weighted 1.0 to `head` like the delivered helmet.

| | tris (rider / helmet) | draws | bytes | verify |
|---|---|---|---|---|
| before `rider-race-bluewhite` (v0.3.0) | 44,093 / 3,166 | 1 | 2,091,492 | green |
| after `rider-race-bluewhite` | 44,099 / 7,452 + 38 lens | 2 (body atlas + lens) | 2,133,548 | green: 19 bones, sockets 2.4e-7, six clips, pose 1.9e-4 |
| after `-lod` | 7,815 | 2 | 793,588 | green |
| after `rider-race-charcoalyellow` / `-lod` | 44,099 / 7,815 | 2 | 2,043,532 / 761,456 | green |

Stills: same head camera at 0.8 m (`hero_art_preview.py --head-dist 0.8`), same light and `sit_cruise` frame 40 as `hair-options`. `before-race-bluewhite.png`, `after-race-bluewhite.png`, `after-race-charcoalyellow.png`, `after-race-bluewhite-lod.png`; `turntable-before-after.mp4` 20 frames / 6.7 s, before left, after right. The helmet's flat colours are folded into the rider's single body atlas by the stage-1 bake, so the body stays one draw; the lens is the second. Not done: goggle strap buckle, chin-bar mesh vents, sponsor graphics (the reference boards' FOX-style decals need a decal sheet; the racing stripe is a placeholder).
