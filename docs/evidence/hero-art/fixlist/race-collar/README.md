# Fix-list item 3: Race collar / panel tailoring (ask 49)

The delivered Race jersey ends in a wide, hard-edged scoop that leaves the neck and the tops of the shoulders bare (the "slit" at the left shoulder is the scoop's deepest dip, not a hole: after welding the panel seams the jersey has exactly four open loops — neckline, two cuffs, hem). `assets/blender/hero_art_collar.py` (`hero_art_import.py --race-collar v2`, default; `v1` = as delivered) lofts a collar/yoke panel from the jersey's own neckline (72 angular bins around the neck bone axis, the deepest scoop point per bin, plus a tuck row 15 mm below and 7 mm inside the jersey so the seam hides under the edge) up to a ring measured from the delivered head-and-neck mesh 45 mm above the neckline (+7 mm ease), with a slight convex yoke. Colour is the median of the jersey's albedo sampled at the neckline (blue 0.030/0.118/0.617, charcoal 0.045/0.045/0.048 linear), roughness 0.75, double-sided; weights blend from the neckline vertices' own (chest / shoulders) to `neck` 0.85 / `chest` 0.15 at the top. The panel is opaque and flat-coloured, so the stage-1 atlas bake folds it into the single body draw.

| | tris (rider / collar) | draws | bytes | verify |
|---|---|---|---|---|
| before `rider-race-bluewhite` (v0.3.1) | 44,099 / 0 | 2 | 2,133,548 | green |
| after `rider-race-bluewhite` / `-lod` | 44,096 / 576 · 7,815 | 2 | 2,145,556 / 789,856 | green: 19 bones, sockets 2.4e-7, six clips, pose 1.9e-4 |
| after `rider-race-charcoalyellow` / `-lod` | 44,096 / 576 · 7,815 | 2 | 2,052,724 / 755,656 | green |

Stills from the `neck` bone at 0.7 m, same light and `sit_cruise` frame 40 as the other items: `before-race-bluewhite.png`, `after-race-bluewhite.png`, `after-race-charcoalyellow.png`; `turntable-before-after.mp4` 20 frames, before left, after right. Not done: a ribbed collar band texture and a zip placket (flat colour only), and the scoop edge itself is still Astra's — the yoke covers it rather than re-tailoring the panel.
