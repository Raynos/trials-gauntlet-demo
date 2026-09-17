# Ask 61 — "in-run you get a floating placeholder quad"

**The object:** the industrial / foundry hall's `tarp` prop batch — `src/render/world/hall.ts`
(`const tarps = new PropBatch('tarp', …)`, scene-graph name `props:tarp:<chunk>`), a flat
`PlaneGeometry(3, 2.4)` in one flat colour (`0x2a4d8a` blue / `0x8a6a2a` tan / `0x5a5a5a` grey), no
texture, no folds, no hanger. Four placements, all industrial + foundry tracks (b1 b2 b3 m1 p1; m3 h3
x2 x3 p5): (1) **hung 3–6 m under the roof at z −16…−8 with nothing holding it** — this is the quad
the reviewer saw, it sits in the top third of the riding frame on b1 from 0:05 on; (2) the two
"banners" under the b1 / p1 jib gantry (rendered as a flat dark plate); (3) the start / finish event
stand banners; (4) tarps draped over container front edges (`dressDeckLevel`). Found by playing all
20 shipped tracks headless (`harness/clip.ts <track> --fps 2`, the bot-3 goldens, 1280×720 high) and
reading every frame on 4×4 contact sheets: the flat plate appears only in the hall biomes; canyon,
snow and nightCity have no such object.

**The fix (source, not a patch):** the tarp is now a real prop — `tarpGeometry()` in
`src/render/world/props.ts` (hung by its two top corners: the tied edge sags, the sheet bellies and
hangs in folds that fan toward the free hem, fold-valley + hem grime in the vertex colour, real
normals; 320 tris) with `tarpTexture()` (weave, hemmed bands, six eyelets with rust runs, grime). The
roof-hung instances hang from the truss line on two chains to their corners (`chains` batch: no new
draw), 2–3.6 m below the roof instead of floating mid-hall. The material carries the library's
neutral map set (`lib.complete`) and is front-faced, so it shares the container skins' program
instead of owning a DoubleSide / no-map variant. Draw count unchanged (one instanced batch per
chunk); +~3 k tris per hall. Tests: `src/render/world/props.test.ts`.

## Frames (same recording `harness/inputs/b1-first-ride/bot-3.json`, same ticks, before = HEAD, after = this tree)

| when | before | after | what to look at |
|---|---|---|---|
| 0:05.0 | `before-b1-5.0s.jpg` | `after-b1-5.0s.jpg` | top right: the 3 × 2.4 m flat blue quad floating over the container row → gone; the hem of the tarp now hung on chains just under the truss shows at the frame's top edge |
| 0:06.0 | `before-b1-6.0s.jpg` | `after-b1-6.0s.jpg` | top right: tan flat quad → gone (hung above the frame) |
| 0:07.5 | `before-b1-7.5s.jpg` | `after-b1-7.5s.jpg` | checkpoint 1 pass, top band clear in both; the crowd here is ask 62's |
| 0:20.5 | `before-b1-20.5s.jpg` / `before-b1-jib-banners-zoom.jpg` | `after-b1-20.5s.jpg` / `after-b1-jib-banners-zoom.jpg` | the jib gantry's two banners: a flat dark plate → two hung cloth banners with sag, folds, hem and eyelets |
| 0:22.0 | `before-b1-22s.jpg` | `after-b1-22s.jpg` | past the jib |
| 0:06.0 (sign) | `before-b1-6.0s.jpg` / `before-b1-6.0s-sign-zoom.jpg` | `after-b1-6.0s-sign.jpg` / `after-b1-6.0s-sign-zoom.jpg` | follow-up: the hall's `sign` batch — a bare `hazardTape` box floating 2 m up in front of the back wall (the flat yellow board top-right) → a printed site sign (`signBoardGeometry` + `siteSignTexture`: steel frame, hazard-stripe border, warning triangle, "DANGER / HARD HAT AREA" legend seeded from four, bolt heads with rust runs, scratches, grime) on two steel posts to the floor (`railPost`, merged into the steel draw); own batch as before, 2 tris instead of 12, no new draw |
| 0:00–0:08 | `before-b1-sheet-0-8s.jpg` | `after-b1-sheet-0-8s.jpg` | 16 frames at 2 fps, the whole opening: the blue / tan quads in the top band (before) vs none (after) |

Captured with `npx tsx harness/clip.ts b1-first-ride --fps 2 --no-camera-check` (before: a scratch
copy of the tree with the world files at HEAD, built with the frozen-build recipe in
`harness/README.md`; after: the working tree's `dist/`). The 20-track survey sheets live in the
session scratchpad, not here (60 MB).
