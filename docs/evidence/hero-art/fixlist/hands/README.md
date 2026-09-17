# Fix-list item 2: hands (ask 49)

Astra's delivered gloves are three constructions per rider (`rider:glove_top` 4,600 tris: back-of-hand plates + thumb, `rider:gloves` 1,648: eight 4-ring finger tubes, `rider:hero glove construction` 956: knuckle pads). The v0.3.0 full-res riders collapsed them uniformly with the body (about 2.4 k tris for both hands), which turned the 4-ring finger tubes into flat slabs; `delivered-full-res-handR.png` shows the same hand as delivered.

Change (`hero_art_import.py`, `HAND_KEEP_FULL = 0.85`): at full res every hand part (found by more than 50 % `hand.*` weight) keeps at least 85 % of its delivered triangles (3,830 + 1,372 + 784 = 5,986 for both hands, was ~2,400); the sweatshirt absorbs the difference (28,928 tris, was 30.5 k). LOD floors unchanged (400 per part). Budgets hold: street 58,967 tris / 6 draws, race 44,092 / 2, LODs 7,806-7,836.

| | tris (rider / hands) | bytes | verify |
|---|---|---|---|
| before `rider-street-mustard` | 58,976 / ~2,400 | 3,267,248 | green |
| after `rider-street-mustard` | 58,967 / 5,986 | 3,305,688 | green (19 bones, sockets 2.4e-7, six clips, pose 1.9e-4) |

Stills: right hand from the `hand.R` bone at 0.35 m (`hero_art_preview.py --bone hand.R --head-dist 0.35`), same light, `sit_cruise` frame 40: `before-street-mustard-handR.png`, `after-street-mustard-handR.png`; `turntable-before-after.mp4` 20 frames, before left, after right. All five riders (full + LOD) rebuilt with this floor.
Not done, and why: the finger/thumb *shapes* (four parallel identical tubes, a plank thumb that does not wrap the grip, no palm volume) are the delivered construction; changing them means re-sculpting the glove parts in Astra's masters against the reference boards, not a pipeline rule — see the report.
