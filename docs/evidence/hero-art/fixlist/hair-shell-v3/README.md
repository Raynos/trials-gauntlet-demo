# Fix-list item 5: hair shell v3 — temple facets and the G/B colour gap (ask 49)

Two residuals from `hair-options/d-shell-v2.png`: dark concave facets at the temples (the collapse leaves creases that smooth normals shade black) and hair colour ~10 % low in green/blue against Astra's groom (crown-box hair-pixel mean, background/skin masked: target (a) 0.229/0.182/0.159, v2 0.223/0.161/0.137 sRGB).

Change (`hero_art_hair.py` `V2`: `smooth` 2→4 passes at factor 0.5 after the collapse; albedo = delivered strand colour ×5.0 + 0.16 grey sheen, was ×6.0 + 0.12): measured after (`after-street-mustard.png`, same camera/light/frame as `hair-options`) 0.236/0.182/0.159 — green and blue on target, red +0.007. Temple creases are rounded off; a few small dark facets remain along the hairline at the temple (see the turntable), which the 8 k budget does not allow smoothing further without losing the curl lumps.

| | rider tris / hair | draws | bytes | verify |
|---|---|---|---|---|
| before `rider-street-mustard` (v0.3.1) | 58,967 / 7,689 | 6 | 3,305,688 | green |
| after `rider-street-mustard` / `-lod` | 58,967 / 7,689 · 7,836 | 6 | 3,616,252 / 1.75 MB | green (pose 1.9e-4); bytes include item 4's hi-res normal |
| after `rider-street-charcoal` / `-lod` | same shell | 6 | 3.49 / 1.71 MB | green |

`before-street-mustard.png`, `after-street-mustard.png`, `turntable-before-after.mp4` (20 frames, before left, after right). Open-face is unaffected (no groom). Not done: the delivered groom's sparse crown (scalp faintly showing through the parting) — the scalp tint is thickness-driven and the shell is never thin enough at the crown to trigger it; making the crown sparse is a groom-density edit in the master, not a shell rule.
